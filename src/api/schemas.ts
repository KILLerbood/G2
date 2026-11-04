import { z } from 'zod';

/* Sheet cells come back as '' when empty, numbers may arrive as strings, yes/no as «نعم»/«لا».
   These helpers normalise them once, at the edge, so the app only sees clean types. */
const str = z.preprocess((v) => (v == null ? '' : String(v)), z.string());
const numOrNull = z.preprocess((v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}, z.number().nullable());
const num = z.preprocess((v) => Number(v) || 0, z.number());
const bool = z.preprocess((v) => v === true || /^(نعم|yes|true|1)$/i.test(String(v ?? '').trim()), z.boolean());
const list = z.preprocess((v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,،]\s*/).map((s) => s.trim()).filter(Boolean)), z.array(z.string()));

export const STAGES = ['جديد', 'تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية', 'عميل نشط', 'متوقف', 'خسرناه'] as const;
export const PATH = STAGES.slice(0, 8) as readonly string[];
export const ACTIVE = ['تم التواصل', 'اجتماع محجوز', 'تم الاجتماع', 'عرض مرسل', 'تفاوض', 'فترة تجريبية'];

export const MeSchema = z.object({ email: str, name: str, role: str, isAdmin: z.boolean(), emailOff: list.optional().default([]), pushOff: list.optional().default([]) });
export type Me = z.infer<typeof MeSchema>;

export const LeadSchema = z.object({
  id: str, created: str, type: str, stage: str, priority: str, score: numOrNull,
  name: str, business: str, businessType: str, city: str, country: str, phone: str, email: str, link: str,
  service: str, source: str, utmSource: str, utmMedium: str, utmCampaign: str, readiness: numOrNull, owner: str,
  dealValue: numOrNull, mrr: numOrNull, clientSince: str, renewal: str, firstReply: str, lastContact: str,
  nextFollowUp: str, lostReason: str, notes: str, lang: str, updated: str
}).passthrough();
export type Lead = z.infer<typeof LeadSchema>;

export const BookingSchema = z.object({
  id: str, leadId: str, created: str, name: str, business: str, phone: str, email: str, meetingType: str,
  start: str, startIso: str, platform: str, meetLink: str, eventId: str, status: str, clientNotes: str, outcome: str, reminder: str, lang: str
}).passthrough();
export type Booking = z.infer<typeof BookingSchema>;

export const ActivitySchema = z.object({ id: str, date: str, leadId: str, leadName: str, kind: str, direction: str, summary: str, details: str, by: str }).passthrough();
export type Activity = z.infer<typeof ActivitySchema>;

export const TaskSchema = z.object({ id: str, created: str, leadId: str, leadName: str, task: str, due: str, owner: str, status: str, doneAt: str }).passthrough();
export type Task = z.infer<typeof TaskSchema>;

export const ReadinessSchema = z.object({
  id: str, date: str, leadId: str, session: str, market: num, content: num, ads: num, website: num, replies: num, tracking: num,
  score: num, level: str, weakest: str, lang: str
}).passthrough();
export type Readiness = z.infer<typeof ReadinessSchema>;

export const TemplateSchema = z.object({ id: str, channel: str, name: str, stage: str, subject: str, body: str, active: z.preprocess((v) => (v === '' || v == null ? true : v), bool) }).passthrough();
export type Template = z.infer<typeof TemplateSchema>;

export const TeamMemberSchema = z.object({ name: str, email: str, role: str, whatsapp: str, active: z.preprocess((v) => (v === undefined ? true : v), bool) });
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const AnnouncementSchema = z.object({
  id: str, created: str, by: str, title: str, body: str, level: str, audience: str, pinned: bool, requireAck: bool, emailCopy: bool,
  startsAt: str, expiresAt: str, status: str, threadId: str, updated: str, seenAt: str.optional(), ackAt: str.optional()
}).passthrough();
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const BootstrapSchema = z.object({
  me: MeSchema,
  lists: z.record(z.array(z.string())),
  team: z.array(TeamMemberSchema),
  settings: z.object({ brand: str, teamWhatsapp: str, siteUrl: str, staleDays: num, sheetUrl: str, chatPollSeconds: num.optional(), emailDigest: str.optional(), filesReady: z.boolean().optional(), pushKey: str.optional() }).passthrough(),
  templates: z.array(TemplateSchema),
  leads: z.array(LeadSchema),
  tasks: z.array(TaskSchema),
  bookings: z.array(BookingSchema),
  announcements: z.array(AnnouncementSchema).optional().default([]),
  inbox: z.object({ version: str, unread: num }).optional(),
  now: str
});
export type Bootstrap = z.infer<typeof BootstrapSchema>;

/** A file kept on Google Drive by the «Magmafy Files» script (tab «الملفات»). */
export const FileSchema = z.object({ id: str, date: str, leadId: str, name: str, mime: str, size: num, driveId: str, url: str, by: str, byEmail: str }).passthrough();
export type LeadFile = z.infer<typeof FileSchema>;

export const LeadDetailSchema = z.object({
  lead: LeadSchema, activities: z.array(ActivitySchema), tasks: z.array(TaskSchema), bookings: z.array(BookingSchema), readiness: z.array(ReadinessSchema),
  files: z.array(FileSchema).optional().default([])
});
export type LeadDetail = z.infer<typeof LeadDetailSchema>;

const GroupSchema = z.object({ name: str, leads: num, met: num, won: num, lost: num, mrr: num, value: num });
export type Group = z.infer<typeof GroupSchema>;
const PeriodSchema = z.object({
  leads: num, funnel: z.array(z.object({ key: str, label: str, count: num })), won: num, wonMrr: num, lost: num,
  winRate: numOrNull, cycleDays: numOrNull, meetings: num, held: num, noShow: num, showRate: numOrNull, noOutcome: num,
  replyMedianMin: numOrNull, replyWithinHour: numOrNull, replyBuckets: z.array(z.tuple([str, num]))
});
export type Period = z.infer<typeof PeriodSchema>;
export const DashboardSchema = z.object({
  range: z.object({ from: str, to: str, prevFrom: str, prevTo: str, days: num }),
  cur: PeriodSchema, prev: PeriodSchema,
  sources: z.array(GroupSchema), campaigns: z.array(GroupSchema), cities: z.array(GroupSchema), types: z.array(GroupSchema), services: z.array(GroupSchema),
  revenue: z.object({
    mrr: num, clients: num, pipeline: num, openDeals: num,
    months: z.array(z.object({ month: str, mrr: num, joined: num })),
    renewals: z.array(z.object({ id: str, name: str, renewal: str, mrr: num }))
  }),
  losses: z.object({ total: num, reasons: z.array(z.object({ name: str, count: num })), stages: z.array(z.object({ name: str, count: num })) }),
  readiness: z.object({ count: num, linked: num, avg: numOrNull, axes: z.array(z.object({ name: str, avg: numOrNull })), weakest: z.array(z.object({ name: str, count: num })) }),
  team: z.array(z.object({ name: str, leads: num, active: num, won: num, mrr: num, overdue: num, replyMedianMin: numOrNull })),
  targets: z.object({ leads: numOrNull, meetings: numOrNull, clients: numOrNull, mrr: numOrNull }),
  pipelineNow: z.array(z.object({ stage: str, count: num, value: num })),
  generated: str
});
export type Dashboard = z.infer<typeof DashboardSchema>;

export const ThreadSchema = z.object({
  id: str, created: str, createdBy: str, title: str, type: str, members: list, leadId: str, announcementId: str, lastMessageAt: str, status: str,
  unread: num.optional(), lastMessage: z.object({ fromName: str, body: str, date: str }).nullable().optional()
}).passthrough();
export type Thread = z.infer<typeof ThreadSchema>;

export const MessageSchema = z.object({
  id: str, date: str, threadId: str, fromEmail: str, fromName: str, body: str, replyTo: str, mentions: list, editedAt: str, deletedAt: str, deletedBy: str
}).passthrough();
export type Message = z.infer<typeof MessageSchema>;

export const NotificationSchema = z.object({ id: str, date: str, kind: str, title: str, refType: str, refId: str, by: str, readAt: str }).passthrough();
export type Notification = z.infer<typeof NotificationSchema>;

export const AuditSchema = z.object({
  id: str, date: str, byEmail: str, byName: str, source: str, action: str, entity: str, entityId: str, field: str, oldValue: str, newValue: str, note: str
}).passthrough();
export type AuditRow = z.infer<typeof AuditSchema>;

export const AccessSchema = z.object({ id: str, date: str, email: str, name: str, message: str, status: str, handledBy: str, handledAt: str }).passthrough();
export type AccessRequest = z.infer<typeof AccessSchema>;

export const SettingSchema = z.object({ key: str, value: str, help: str });
export type Setting = z.infer<typeof SettingSchema>;

export const PulseSchema = z.object({
  version: str,
  unread: z.object({ notifications: num, messages: num, announcements: num }),
  urgent: AnnouncementSchema.nullable().optional()
});
export type Pulse = z.infer<typeof PulseSchema>;

export const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), next: z.string().nullable().optional() });
export const okLead = z.object({ ok: z.boolean(), lead: LeadSchema.optional(), error: z.string().optional(), id: z.string().optional(), name: z.string().optional() }).passthrough();

/* ---------- billing (Api.gs §13) ---------- */
export const BillItemSchema = z.object({
  serviceId: str.optional().default(''), title: str, titleEn: str.optional().default(''), desc: str.optional().default(''),
  qty: z.number(), unit: z.number(), discountPct: z.number().optional().default(0), monthly: z.boolean().optional().default(false)
});
export type BillItem = z.infer<typeof BillItemSchema>;
export const BillDiscountSchema = z.object({ name: str, pct: z.number().optional().default(0), amount: z.number().optional().default(0), recurring: z.boolean().optional().default(false) });
export const BillPlanSchema = z.object({ label: str, pct: z.number(), when: str.optional().default(''), date: str.optional().default('') });
export const BillClientSchema = z.object({ business: str, contact: str, city: str, email: str, phone: str, taxId: str }).partial().passthrough();
const BillDataSchema = z.object({
  client: BillClientSchema.optional().default({}), items: z.array(BillItemSchema).optional().default([]), discount: BillDiscountSchema.nullable().optional(),
  plan: z.array(z.object({ label: str, pct: z.number(), when: str.optional().default(''), date: str.optional(), amount: z.number().optional(), current: z.boolean().optional() })).optional(),
  period: str.optional().default(''), note: str.optional().default(''), validDays: z.number().optional(), label: str.optional(), voidReason: str.optional()
}).passthrough();
export const ServiceSchema = z.object({ id: str, nameAr: str, nameEn: str, desc: str, price: z.number(), billing: str, active: z.boolean() });
export type Service = z.infer<typeof ServiceSchema>;
export const QuoteSchema = z.object({
  id: str, date: str, leadId: str, leadName: str, status: str, total: z.number(), monthly: numOrNull, currency: str, validUntil: str,
  sentAt: str, openedAt: str, decidedAt: str, rejectReason: str, subscription: str, nextMonthly: str, by: str, link: str, data: BillDataSchema
}).passthrough();
export type Quote = z.infer<typeof QuoteSchema>;
export const InvoiceSchema = z.object({
  id: str, date: str, leadId: str, leadName: str, quoteId: str, label: str, status: str, amount: z.number(), paid: numOrNull, balance: numOrNull,
  currency: str, dueDate: str, readyOn: str, sentAt: str, by: str, link: str, overdue: z.boolean().optional().default(false), data: BillDataSchema
}).passthrough();
export type Invoice = z.infer<typeof InvoiceSchema>;
export const PaymentSchema = z.object({
  id: str, created: str, date: str, invoiceId: str, leadId: str, leadName: str, amount: z.number(), currency: str, method: str, ref: str,
  fromName: str, fromAccount: str, note: str, fileId: str, by: str
}).passthrough();
export type Payment = z.infer<typeof PaymentSchema>;
export const BillingSchema = z.object({
  quotes: z.array(QuoteSchema), invoices: z.array(InvoiceSchema), payments: z.array(PaymentSchema),
  settings: z.object({
    currency: str, autoSend: z.boolean(), dueDays: z.number(), quoteDays: z.number(),
    from: z.object({ name: str, line: str, email: str, whatsapp: str, website: str }).partial().passthrough(),
    payment: z.object({ method: str, beneficiary: str, iban: str, swift: str }).partial().passthrough(),
    termsQuote: z.array(z.tuple([z.string(), z.string()])), termsInvoice: z.array(z.tuple([z.string(), z.string()]))
  })
});
export type Billing = z.infer<typeof BillingSchema>;
/** What the client page receives (template DocData without the logo). */
export const PublicDocSchema = z.object({ kind: z.enum(['quote', 'invoice']), status: str, canAccept: z.boolean(), doc: z.record(z.unknown()) });
export type PublicDoc = z.infer<typeof PublicDocSchema>;
