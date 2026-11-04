/**
 * A small in-memory stand-in for the Apps Script services the backend uses
 * (SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, MailApp, Session, ContentService …),
 * so Code.gs + Crm.gs + Api.gs can run in Node exactly as written and be checked against the site's schemas.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

type Cell = unknown;

class Range {
  constructor(private sh: Sheet, private r: number, private c: number, private nr = 1, private nc = 1) {}
  getValues() {
    const out: Cell[][] = [];
    for (let i = 0; i < this.nr; i++) {
      const row: Cell[] = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.sh.get(this.r, this.c); }
  setValues(v: Cell[][]) { v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; }
  setValue(v: Cell) { this.sh.set(this.r, this.c, v); return this; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
  getSheet() { return this.sh; }
  // formatting: no-ops
  setNumberFormat() { return this; } setDataValidation() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setFontWeight() { return this; } setVerticalAlignment() { return this; } setWrap() { return this; } setFontSize() { return this; }
  setNote() { return this; } clearNote() { return this; } setFormula(f: string) { this.sh.set(this.r, this.c, f); return this; }
}

/** Sheets turns what you type into numbers / dates; mimic the part that matters (numbers). */
function coerce(v: Cell): Cell {
  if (typeof v === 'string') {
    if (v.startsWith("'")) return v.slice(1);
    if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 15) return Number(v);
  }
  return v instanceof Date ? new Date(v.getTime()) : v;
}

export class Sheet {
  data: Cell[][] = [];
  maxRows = 1000;
  constructor(public name: string) {}
  get(r: number, c: number) { const v = this.data[r - 1]?.[c - 1]; return v === undefined || v === null ? '' : v instanceof Date ? new Date(v.getTime()) : v; }
  set(r: number, c: number, v: Cell) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = coerce(v); }
  getName() { return this.name; }
  getLastRow() { for (let i = this.data.length; i > 0; i--) if (this.data[i - 1].some((x) => x !== '' && x != null)) return i; return 0; }
  getLastColumn() { return this.data.reduce((m, row) => { let k = 0; row.forEach((x, i) => { if (x !== '' && x != null) k = i + 1; }); return Math.max(m, k); }, 0); }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_a: number, n: number) { this.maxRows += n; }
  getRange(a: number | string, c = 1, nr = 1, nc = 1) { if (typeof a === 'string') return new Range(this, 1, 1); return new Range(this, a, c, nr, nc); }
  appendRow(row: Cell[]) { const r = this.getLastRow() + 1; row.forEach((x, i) => this.set(r, i + 1, x)); }
  deleteRows(r: number, n: number) { this.data.splice(r - 1, n); }
  clear() { this.data = []; }
  setRightToLeft() {} setFrozenRows() {} setRowHeight() {} setColumnWidth() {} setColumnWidths() {} hideSheet() {}
  getConditionalFormatRules() { return []; } setConditionalFormatRules() {}
}

export class Spreadsheet {
  sheets: Sheet[] = [];
  getSheetByName(n: string) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n: string) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s: Sheet) { this.sheets = this.sheets.filter((x) => x !== s); }
  getId() { return 'SS1'; } getUrl() { return 'https://docs.google.com/spreadsheets/d/SS1'; }
  setSpreadsheetTimeZone() {} setSpreadsheetLocale() {} setActiveSheet() {} moveActiveSheet() {} toast() {}
}

const signed = (buf: Buffer) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const unsigned = (bytes: number[]) => Buffer.from(bytes.map((b) => b & 255));

class Blob {
  constructor(public bytes: number[], public mime = 'application/octet-stream', public name = 'file') {}
  getBytes() { return this.bytes; } getContentType() { return this.mime; } getName() { return this.name; }
  getDataAsString() { return unsigned(this.bytes).toString('utf8'); }
}

/** Shared Apps Script Utilities (both scripts use the same signing helpers). */
export const utilities = {
  formatDate: (d: Date, tz: string, p: string) => fmt(d, tz, p), getUuid: () => randomUUID(),
  computeDigest: (_a: unknown, s: string | number[]) => signed(createHash('sha256').update(typeof s === 'string' ? Buffer.from(s, 'utf8') : unsigned(s)).digest()),
  computeHmacSha256Signature: (text: string, key: string) => signed(createHmac('sha256', key).update(text, 'utf8').digest()),
  base64EncodeWebSafe: (s: string | number[]) => (typeof s === 'string' ? Buffer.from(s, 'utf8') : unsigned(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  base64DecodeWebSafe: (s: string) => signed(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  base64Decode: (s: string) => signed(Buffer.from(s, 'base64')),
  base64Encode: (bytes: number[]) => unsigned(bytes).toString('base64'),
  newBlob: (bytes: number[] | string, mime?: string, name?: string) => new Blob(typeof bytes === 'string' ? signed(Buffer.from(bytes, 'utf8')) : bytes, mime, name),
  DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }
};

/** An in-memory Google Drive for the files script. */
export class Drive {
  folders = new Map<string, { id: string; name: string; parent: string; trashed: boolean }>();
  files = new Map<string, { id: string; name: string; parent: string; blob: Blob; trashed: boolean; description: string }>();
  private seq = 0;
  private id(p: string) { return p + (++this.seq); }
  constructor() { this.folders.set('root', { id: 'root', name: 'My Drive', parent: '', trashed: false }); }
  folder(id: string) {
    const f = this.folders.get(id);
    if (!f) throw new Error('No item with the given ID could be found');
    const drive = this;
    const iter = <T>(list: T[]) => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
    return {
      getId: () => f.id, getName: () => f.name, isTrashed: () => f.trashed,
      getFoldersByName: (n: string) => iter([...drive.folders.values()].filter((x) => x.parent === f.id && x.name === n && !x.trashed).map((x) => drive.folder(x.id))),
      createFolder: (n: string) => { const nf = { id: drive.id('fo'), name: n, parent: f.id, trashed: false }; drive.folders.set(nf.id, nf); return drive.folder(nf.id); },
      createFile: (b: Blob) => { const nf = { id: drive.id('fi'), name: b.name, parent: f.id, blob: b, trashed: false, description: '' }; drive.files.set(nf.id, nf); return drive.file(nf.id); }
    };
  }
  file(id: string) {
    const f = this.files.get(id);
    if (!f) throw new Error('No item with the given ID could be found');
    const drive = this;
    return {
      getId: () => f.id, getName: () => f.name, getUrl: () => 'https://drive.google.com/file/d/' + f.id + '/view',
      setDescription: (d: string) => { f.description = d; }, getBlob: () => f.blob, setTrashed: (v: boolean) => { f.trashed = v; },
      getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return drive.folder(f.parent); } }; }
    };
  }
  api() {
    return { getRootFolder: () => this.folder('root'), getFolderById: (id: string) => this.folder(id), getFileById: (id: string) => this.file(id) };
  }
}

function services(props: Map<string, string>, cache: Map<string, { v: string; until: number }>) {
  return {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (props.has(k) ? props.get(k)! : null), setProperty: (k: string, v: string) => { props.set(k, String(v)); },
        deleteProperty: (k: string) => { props.delete(k); }, getProperties: () => Object.fromEntries(props)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => { const e = cache.get(k); return e && e.until > Date.now() ? e.v : null; },
        put: (k: string, v: string, s = 600) => { cache.set(k, { v: String(v), until: Date.now() + s * 1000 }); },
        remove: (k: string) => { cache.delete(k); }
      })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Utilities: utilities,
    ContentService: { createTextOutput: (t: string) => ({ setMimeType() { return this; }, getContent: () => t, text: t }), MimeType: { JSON: 'json' } }
  };
}

/** The «Magmafy Files» script on its own account, with its own properties and an in-memory Drive. */
export function createFilesSim(secret: string) {
  const drive = new Drive();
  const ctx: Record<string, unknown> = { console, DriveApp: drive.api(), ...services(new Map(), new Map()) };
  vm.createContext(ctx);
  const src = readFileSync(join(__dirname, '..', 'files', 'Files.gs'), 'utf8').replace("'PASTE_FILES_SECRET_HERE'", JSON.stringify(secret));
  vm.runInContext(src + '\n;globalThis.__run = (name, args) => eval(name).apply(null, args || []);', ctx, { filename: 'Files.gs' });
  const run = (name: string, ...args: unknown[]) => (ctx as { __run: (n: string, a: unknown[]) => unknown }).__run(name, args);
  return {
    drive,
    post(body: Record<string, unknown>) { return JSON.parse((run('doPost', { postData: { contents: JSON.stringify(body) } }) as { text: string }).text) as Record<string, unknown>; },
    get() { return JSON.parse((run('doGet', {}) as { text: string }).text); }
  };
}

function fmt(d: Date, tz: string, p: string) {
  const off = tz === 'Asia/Riyadh' ? 3 : 0;
  const x = new Date(d.getTime() + off * 3600e3);
  const pad = (n: number, k = 2) => String(n).padStart(k, '0');
  const map: Record<string, string> = {
    yyyy: String(x.getUTCFullYear()), MM: pad(x.getUTCMonth() + 1), dd: pad(x.getUTCDate()), HH: pad(x.getUTCHours()), mm: pad(x.getUTCMinutes()),
    u: String(x.getUTCDay() || 7), d: String(x.getUTCDate()), M: String(x.getUTCMonth() + 1), H: String(x.getUTCHours())
  };
  return p.replace(/yyyy|MM|dd|HH|mm|u|d|M|H/g, (t) => map[t]);
}

export type Sim = ReturnType<typeof createSim>;

export function createSim(opts: { owner: string }) {
  const ss = new Spreadsheet();
  const props = new Map<string, string>();
  const cache = new Map<string, { v: string; until: number }>();
  const mails: Record<string, unknown>[] = [];
  /** Push services: every request is recorded; `pushReply` decides the status per endpoint (default 201). */
  const pushes: { url: string; headers: Record<string, string> }[] = [];
  const pushReply = new Map<string, number>();
  let activeUser = '';

  const triggers: { fn: string; id: string }[] = [];
  const triggerBuilder = (fn: string) => {
    const b: Record<string, unknown> = {};
    ['timeBased', 'everyMinutes', 'everyHours', 'atHour', 'everyDays', 'inTimezone', 'forSpreadsheet', 'onEdit'].forEach((k) => { b[k] = () => b; });
    b.create = () => { const t = { fn, id: 'trg' + (triggers.length + 1) }; triggers.push(t); return t; };
    return b;
  };
  const builder = () => { const b: Record<string, () => unknown> = {}; ['requireValueInRange', 'setAllowInvalid', 'whenTextEqualTo', 'setBackground', 'setFontColor', 'setRanges'].forEach((k) => { b[k] = () => b; }); b.build = () => ({}); return b; };
  const ctx: Record<string, unknown> = {
    console,
    SpreadsheetApp: {
      getActive: () => ss, openById: () => ss, getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }),
      newDataValidation: builder, newConditionalFormatRule: builder
    },
    ...services(props, cache),
    UrlFetchApp: {
      fetchAll: (reqs: { url: string; headers: Record<string, string> }[]) => reqs.map((r) => {
        pushes.push({ url: r.url, headers: r.headers });
        const code = pushReply.get(r.url) ?? 201;
        return { getResponseCode: () => code, getContentText: () => (code >= 300 ? 'push service said ' + code : '') };
      })
    },
    MailApp: { sendEmail: (m: Record<string, unknown>) => { mails.push(m); }, getRemainingDailyQuota: () => 100 },
    Session: { getActiveUser: () => ({ getEmail: () => activeUser }), getEffectiveUser: () => ({ getEmail: () => opts.owner }) },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setFaviconUrl() { return this; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.fn, getUniqueId: () => t.id })),
      newTrigger: (fn: string) => triggerBuilder(fn), deleteTrigger: (t: { getUniqueId: () => string }) => { const i = triggers.findIndex((x) => x.id === t.getUniqueId()); if (i >= 0) triggers.splice(i, 1); }
    },
    CalendarApp: {
      getCalendarById: () => ({ getEvents: () => [], createEvent: () => ({ getId: () => 'EV1' }), getEventById: () => null }),
      getDefaultCalendar: () => ({ getEvents: () => [] }), GuestStatus: { NO: 'NO' }
    }
  };
  vm.createContext(ctx);
  const dir = join(__dirname, '..');
  // Apps Script puts every .gs file in one global scope; concatenating does the same.
  const src = ['Code.gs', 'Crm.gs', 'Api.gs'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n;\n');
  vm.runInContext(src + '\n;globalThis.__run = (name, args) => eval(name).apply(null, args || []);', ctx, { filename: 'backend.gs' });
  const run = (name: string, ...args: unknown[]) => (ctx as { __run: (n: string, a: unknown[]) => unknown }).__run(name, args);

  return {
    ss, props, mails, run, triggers, pushes, pushReply,
    /** Runs a time-trigger function the way Apps Script does (with its trigger id). */
    trigger(fn: string) { const t = triggers.find((x) => x.fn === fn); if (!t) throw new Error('no trigger for ' + fn); return run(fn, { triggerUid: t.id }); },
    as(email: string) { activeUser = email; },
    /** What the site does: POST {action:'crm', fn, args, token} and read the JSON envelope. */
    post(body: Record<string, unknown>) {
      const out = run('doPost', { postData: { contents: JSON.stringify(body) } }) as { text: string };
      return JSON.parse(out.text) as { ok: boolean; data?: unknown; code?: string; error?: string };
    },
    get(params: Record<string, string>) { return JSON.parse((run('doGet', { parameter: params }) as { text: string }).text); },
    /** Puts the emailed OTP straight into the cache (we can't read the email in a test). */
    otpFor(email: string) {
      const code = '424242';
      const h = createHash('sha256').update(code, 'utf8').digest('hex');
      ctx.CacheService && (ctx as { CacheService: { getScriptCache: () => { put: (k: string, v: string, s: number) => void } } }).CacheService.getScriptCache().put('otp:' + email, JSON.stringify({ h, n: 0 }), 600);
      return code;
    },
    sheet(name: string) { return ss.getSheetByName(name)!; }
  };
}
