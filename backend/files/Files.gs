/**
 * Magmafy Files — the CRM's file store.
 *
 * Runs on the account whose Drive holds the files (mrvoroo@gmail.com, 1 TB), as its own Apps Script project:
 *   Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
 * Every file it saves belongs to that account, so it uses that account's storage.
 *
 * It never decides who may do what. The main CRM script checks the person and the lead, then signs a short
 * «ticket» with the shared secret. This script only accepts requests that carry a valid, unexpired ticket,
 * and answers an upload with a signed receipt the CRM records in the sheet.
 *
 * Setup: paste the value of FILES_SECRET (tab «الإعدادات» in the CRM sheet) between the quotes below.
 */

const SECRET = 'PASTE_FILES_SECRET_HERE';

const ROOT_NAME = 'Magmafy CRM';
const MAX_BYTES = 20 * 1024 * 1024;
const MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[\w.-]+|zip|x-zip-compressed)|text\/(plain|csv))$/;

/* ---------- web endpoints ---------- */

function doGet() {
  return json_({ ok: true, service: 'Magmafy Files', version: 1, ready: SECRET.length >= 32 && SECRET.indexOf('PASTE') < 0 });
}

function doPost(e) {
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) { return json_({ ok: false, error: 'bad_json' }); }
  try {
    const t = verify_(b.ticket);
    if (b.action === 'upload' && t.op === 'upload') return json_(upload_(t, b));
    if (b.action === 'get' && t.op === 'view') return json_(get_(t));
    if (b.action === 'trash' && t.op === 'trash') return json_(trash_(t));
    return json_({ ok: false, error: 'bad_op' });
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (!/^(bad_ticket|expired|used|too_big|bad_type|mismatch|not_found|not_ready)$/.test(msg)) console.error(err);
    return json_({ ok: false, error: /^[a-z_]+$/.test(msg) ? msg : 'server' });
  }
}

/* ---------- actions ---------- */

function upload_(t, b) {
  // A ticket uploads one file, once.
  const cache = CacheService.getScriptCache();
  if (cache.get('used:' + t.n)) throw new Error('used');
  const bytes = Utilities.base64Decode(String(b.data || ''));
  if (!bytes.length) throw new Error('mismatch');
  if (bytes.length > MAX_BYTES) throw new Error('too_big');
  if (bytes.length !== Number(t.size)) throw new Error('mismatch');
  if (!MIME_OK.test(t.mime)) throw new Error('bad_type');
  cache.put('used:' + t.n, '1', 21600);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let folder;
  try { folder = leadFolder_(t.leadId, t.leadName); } finally { lock.releaseLock(); }
  const file = folder.createFile(Utilities.newBlob(bytes, t.mime, safeName_(t.name)));
  file.setDescription('Magmafy CRM · ' + t.leadId + ' · ' + t.email);
  return {
    ok: true,
    receipt: sign_({ op: 'receipt', leadId: t.leadId, email: t.email, fileId: file.getId(), name: file.getName(), mime: t.mime, size: bytes.length, url: file.getUrl(), exp: Date.now() + 30 * 60000, n: t.n })
  };
}

function get_(t) {
  const file = fileOfLead_(t.leadId, t.fileId);
  const blob = file.getBlob();
  return { ok: true, name: file.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function trash_(t) {
  fileOfLead_(t.leadId, t.fileId).setTrashed(true); // in Drive's bin for 30 days, not gone
  return { ok: true };
}

/* ---------- Drive folders ---------- */

/** «Magmafy CRM» at the top of this account's Drive; made the first time. */
function root_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (_) { /* deleted: make a new one */ } }
  const found = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  const f = found.hasNext() ? found.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
  props.setProperty('ROOT', f.getId());
  return f;
}

/** One folder per lead: «اسم العميل · L-0001». Hold the lock. */
function leadFolder_(leadId, leadName) {
  const props = PropertiesService.getScriptProperties();
  const key = 'LF_' + leadId;
  const id = props.getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (_) { /* gone */ } }
  const name = safeName_((leadName ? leadName + ' · ' : '') + leadId);
  const root = root_();
  const it = root.getFoldersByName(name);
  const f = it.hasNext() ? it.next() : root.createFolder(name);
  props.setProperty(key, f.getId());
  return f;
}

/** The file, only if it sits in that lead's folder (a ticket for one lead can't reach another's files). */
function fileOfLead_(leadId, fileId) {
  const folderId = PropertiesService.getScriptProperties().getProperty('LF_' + leadId);
  if (!folderId) throw new Error('not_found');
  let file;
  try { file = DriveApp.getFileById(String(fileId)); } catch (_) { throw new Error('not_found'); }
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return file;
  throw new Error('not_found');
}

/* ---------- signed tickets (same format as filesSign_ / filesVerify_ in the CRM's Api.gs) ---------- */

function hmac_(text) {
  return Utilities.computeHmacSha256Signature(text, SECRET, Utilities.Charset.UTF_8)
    .map((x) => ('0' + (x & 255).toString(16)).slice(-2)).join('');
}

function sign_(obj) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(obj), Utilities.Charset.UTF_8);
  return body + '.' + hmac_(body);
}

function verify_(ticket) {
  if (SECRET.length < 32 || SECRET.indexOf('PASTE') >= 0) throw new Error('not_ready');
  const parts = String(ticket || '').split('.');
  if (parts.length !== 2 || hmac_(parts[0]) !== parts[1]) throw new Error('bad_ticket');
  const t = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));
  if (!t.exp || t.exp < Date.now()) throw new Error('expired');
  return t;
}

/* ---------- helpers ---------- */

function safeName_(s) { return String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'file'; }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
