/**
 * Turning a quote / invoice into a page: the template's HTML with Magmafy's own fonts and logo, shown in an
 * iframe, printed to PDF, or linked on WhatsApp.
 */
import tj400 from '../../assets/fonts/tajawal-arabic-400-normal.woff2?url';
import tj500 from '../../assets/fonts/tajawal-arabic-500-normal.woff2?url';
import tj700 from '../../assets/fonts/tajawal-arabic-700-normal.woff2?url';
import tj800 from '../../assets/fonts/tajawal-arabic-800-normal.woff2?url';
import tl400 from '../../assets/fonts/tajawal-latin-400-normal.woff2?url';
import tl500 from '../../assets/fonts/tajawal-latin-500-normal.woff2?url';
import tl700 from '../../assets/fonts/tajawal-latin-700-normal.woff2?url';
import tl800 from '../../assets/fonts/tajawal-latin-800-normal.woff2?url';
import inter from '../../assets/fonts/inter-latin-wght-normal.woff2?url';
import { config } from '../../config';
import { renderDoc, type DocData } from './template';

const abs = (u: string) => new URL(u, location.href).href;
const AR = 'unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200E,U+2010-2011,U+FB50-FDFF,U+FE70-FEFC;';
const face = (fam: string, w: string, url: string, range = '') => `@font-face{font-family:'${fam}';font-weight:${w};font-display:block;src:url('${abs(url)}') format('woff2');${range}}`;

export function docFontCss() {
  return [
    face('Tajawal', '400', tj400, AR), face('Tajawal', '500', tj500, AR), face('Tajawal', '700', tj700, AR), face('Tajawal', '800', tj800, AR),
    face('Tajawal', '400', tl400), face('Tajawal', '500', tl500), face('Tajawal', '700', tl700), face('Tajawal', '800', tl800),
    face('Inter', '100 900', inter)
  ].join('');
}

export const logoUrl = () => abs(config.basePath + 'icon-512.png');

/** The server's document (DocData without the logo) → full HTML page. */
export function docHtml(doc: Record<string, unknown>) {
  return renderDoc({ ...(doc as unknown as DocData), logoUrl: logoUrl() }, docFontCss());
}

/** Opens the print dialog for the document; «Save as PDF» there gives the PDF. */
export function printDoc(html: string, title: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset:auto 0 0 auto;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(frame);
  const w = frame.contentWindow!;
  w.document.open();
  w.document.write(html.replace(/<title>[^<]*<\/title>/, '<title>' + title.replace(/[<>&]/g, '') + '</title>'));
  w.document.close();
  const go = () => {
    const prev = document.title;
    document.title = title; // most browsers name the PDF after the top page's title
    w.focus();
    w.print();
    setTimeout(() => { document.title = prev; frame.remove(); }, 1500);
  };
  const fonts = (w.document as Document & { fonts?: FontFaceSet }).fonts;
  const imgs = Array.from(w.document.images).map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; })));
  Promise.all([fonts ? fonts.ready : Promise.resolve(), ...imgs]).then(() => setTimeout(go, 150), () => setTimeout(go, 150));
}

/** wa.me link with a ready message. Phones are stored as 9665…; a local 05… is turned into 9665…. */
export function waLink(phone: string, text: string) {
  let d = String(phone || '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
  else if (/^01[0125]\d{8}$/.test(d)) d = '20' + d.slice(1);
  if (/^00/.test(d)) d = d.slice(2);
  return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
}

export const money = (n: number | null | undefined, cur = 'USD') =>
  cur + ' ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
