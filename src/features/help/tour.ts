/** The step tour of «كيف يعمل؟»: each step points at an element marked data-tour="…". */
export type TourStep = { target: string; route?: string; ar: [string, string]; en: [string, string] };

export const TOUR: TourStep[] = [
  { target: 'nav', ar: ['القائمة', 'كل حاجة هنا مترقمة: التحليل فوق، الشغل اليومي في النص، والأتمتة تحت. على الموبايل افتحها من زرار ☰.'], en: ['Navigation', 'Everything is numbered: analysis on top, daily work in the middle, automation below. On a phone open it with ☰.'] },
  { target: 'cmdk', ar: ['سطر الأوامر', 'اضغط Ctrl+K أو / وابدأ اكتب: اسم عميل، رقم جوال، أو أمر زي «عميل جديد».'], en: ['Command line', 'Press Ctrl+K or / and type: a lead name, a phone number or a command like “new lead”.'] },
  { target: 'range', route: '/', ar: ['الفترة والمقارنة', 'اختار الفترة، وكل رقم بيتقارن أوتوماتيك بالفترة اللي قبلها بنفس الطول.'], en: ['Range and comparison', 'Pick a range; every number is compared with the previous period of the same length.'] },
  { target: 'widgets', route: '/', ar: ['لوحة المدير', 'اسحب أي ودجت من المقبض ⋮⋮ عشان ترتبها، أو ركّز عليه واضغط مسافة وبعدين الأسهم. الترتيب بيتحفظ على جهازك.'], en: ['Manager board', 'Drag any widget by its ⋮⋮ handle, or focus the handle, press Space and use the arrows. The order is saved on this device.'] },
  { target: 'sla-chip', ar: ['سرعة أول رد', 'العداد ده بيقولك كام عميل جديد مستني أول رد وكام واحد عدّى الوقت المسموح.'], en: ['First-response SLA', 'This counter shows new leads waiting for a first reply and how many breached the target.'] },
  { target: 'help', ar: ['ارجع هنا أي وقت', 'زرار «كيف يعمل؟» ده فيه الشرح كله والاختصارات، وتقدر تعيد الجولة منه.'], en: ['Come back any time', 'The “How it works?” button has the full guide and shortcuts, and replays this tour.'] }
];

export type Rect = { top: number; left: number; width: number; height: number };

/**
 * Where the tour card goes next to a target: below if it fits, else above, else beside;
 * always kept inside the viewport with a margin.
 */
export function placeCard(target: Rect | null, card: { width: number; height: number }, vp: { width: number; height: number }, gap = 14, margin = 12): { top: number; left: number; side: 'below' | 'above' | 'center' } {
  const clampX = (x: number) => Math.max(margin, Math.min(vp.width - card.width - margin, x));
  const clampY = (y: number) => Math.max(margin, Math.min(vp.height - card.height - margin, y));
  if (!target) return { top: clampY((vp.height - card.height) / 2), left: clampX((vp.width - card.width) / 2), side: 'center' };
  const cx = target.left + target.width / 2 - card.width / 2;
  if (target.top + target.height + gap + card.height <= vp.height - margin) return { top: target.top + target.height + gap, left: clampX(cx), side: 'below' };
  if (target.top - gap - card.height >= margin) return { top: target.top - gap - card.height, left: clampX(cx), side: 'above' };
  return { top: clampY(target.top + target.height / 2 - card.height / 2), left: clampX(cx), side: 'center' };
}
