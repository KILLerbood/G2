/**
 * Files on Google Drive. The CRM backend issues a short ticket; the file goes straight to the «Magmafy Files»
 * script (on the Drive account with the space) with it; its signed receipt is then recorded by the CRM.
 * In mock mode the ticket URL is «mock:files» and an in-browser store stands in for Drive.
 */
import { api } from './endpoints';
import { ApiError } from './errors';
import type { LeadFile } from './schemas';

export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv';
const MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[\w.-]+|zip|x-zip-compressed)|text\/(plain|csv))$/;
const BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', txt: 'text/plain', csv: 'text/csv'
};
/** Browsers often leave the type empty (Windows, HEIC): fall back to the extension. */
export function mimeOf(file: File) {
  if (file.type && MIME_OK.test(file.type)) return file.type;
  return BY_EXT[(file.name.split('.').pop() || '').toLowerCase()] || file.type || '';
}
export function checkFile(file: File): string | null {
  if (!file.size) return 'الملف فاضي';
  if (file.size > FILE_MAX_BYTES) return 'الملف أكبر من 20 ميجا';
  if (!MIME_OK.test(mimeOf(file))) return 'نوع الملف مش مسموح. المسموح: PDF، صور، Word، Excel، PowerPoint، ZIP، نص';
  return null;
}

const FILES_ERRORS: Record<string, string> = {
  expired: 'التذكرة انتهت، جرّب تاني', used: 'التذكرة اتستخدمت قبل كده، جرّب تاني', too_big: 'الملف أكبر من 20 ميجا',
  bad_type: 'نوع الملف مش مسموح', mismatch: 'الملف اتغير أثناء الرفع، جرّب تاني', not_found: 'الملف مش موجود على Drive',
  bad_ticket: 'سكريبت الملفات رفض الطلب: اتأكد إن FILES_SECRET نفس القيمة في الشيت وفي Files.gs',
  not_ready: 'سكريبت الملفات لسه مش متجهز: حط FILES_SECRET في Files.gs واعمل Deploy'
};

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new ApiError('APP_ERROR', 'مقدرناش نقرا الملف'));
    r.readAsDataURL(file);
  });
}

/**
 * POST to the files script. It must stay a «simple» CORS request (text/plain, no upload listeners):
 * Apps Script doesn't answer the OPTIONS preflight an XHR upload listener would trigger, and the browser
 * would report it as a network error. So progress is estimated from the size while the request runs.
 */
async function postFiles(url: string, body: Record<string, unknown>, onProgress?: (p: number) => void): Promise<Record<string, unknown>> {
  if (import.meta.env.VITE_MOCK === '1' && url.startsWith('mock:')) return import('./mock/server').then((m) => m.mockFiles(body, onProgress));
  const text = JSON.stringify(body);
  let timer: ReturnType<typeof setInterval> | undefined;
  if (onProgress) {
    // ~250 KB/s up plus Drive's own time; eases towards 95% and waits there for the answer.
    const expected = 2500 + (text.length / 250_000) * 1000;
    const t0 = Date.now();
    timer = setInterval(() => onProgress(Math.min(0.95, 1 - Math.exp(-(Date.now() - t0) / expected * 2))), 200);
  }
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 5 * 60000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: text, redirect: 'follow', signal: ctrl.signal });
    const raw = await res.text();
    try { return JSON.parse(raw); } catch { throw new ApiError('APP_ERROR', 'سكريبت الملفات رد برد مش مفهوم: اتأكد إن الـ Deploy على «Anyone»'); }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiError('APP_ERROR', 'الرفع أخد وقت طويل، جرّب تاني');
    throw new ApiError('APP_ERROR', 'مفيش اتصال بسكريبت الملفات: اتأكد من الرابط وإن الـ Deploy على «Anyone»');
  } finally {
    if (timer) clearInterval(timer);
    clearTimeout(kill);
  }
}

function failOf(res: Record<string, unknown>) {
  const code = String(res.error || 'server');
  return new ApiError('APP_ERROR', FILES_ERRORS[code] || 'حصلت مشكلة في سكريبت الملفات، جرّب تاني');
}

export async function uploadLeadFile(leadId: string, file: File, onProgress?: (p: number) => void): Promise<LeadFile> {
  const bad = checkFile(file);
  if (bad) throw new ApiError('APP_ERROR', bad);
  const mime = mimeOf(file);
  const tk = await api.fileTicket({ op: 'upload', leadId, name: file.name, mime, size: file.size });
  const data = await toBase64(file);
  const res = await postFiles(tk.url, { action: 'upload', ticket: tk.ticket, data }, onProgress);
  if (!res.ok) throw failOf(res);
  const out = await api.attachFile(String(res.receipt));
  onProgress?.(1);
  return out.file;
}

/** Downloads the file through the files script (Drive links stay private) and returns a local object URL. */
export async function fetchLeadFile(f: LeadFile): Promise<{ url: string; mime: string; name: string }> {
  const tk = await api.fileTicket({ op: 'view', id: f.id });
  const res = await postFiles(tk.url, { action: 'get', ticket: tk.ticket });
  if (!res.ok) throw failOf(res);
  const bin = atob(String(res.data));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = String(res.mime || f.mime);
  return { url: URL.createObjectURL(new Blob([bytes], { type: mime })), mime, name: String(res.name || f.name) };
}

export async function deleteLeadFile(f: LeadFile) {
  const r = await api.deleteFile(f.id);
  if (r.trash) { try { await postFiles(r.trash.url, { action: 'trash', ticket: r.trash.ticket }); } catch { /* hidden in the CRM; Drive cleanup can wait */ } }
}

export function fileKind(mime: string): 'pdf' | 'image' | 'doc' | 'sheet' | 'slides' | 'zip' | 'text' | 'file' {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (/word|msword/.test(mime)) return 'doc';
  if (/sheet|excel|csv/.test(mime)) return 'sheet';
  if (/presentation|powerpoint/.test(mime)) return 'slides';
  if (/zip/.test(mime)) return 'zip';
  if (mime.startsWith('text/')) return 'text';
  return 'file';
}
export function fileSize(n: number) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
