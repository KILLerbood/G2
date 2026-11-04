import { z } from 'zod';
import { call } from './client';
import * as S from './schemas';

const ok = z.object({ ok: z.boolean() }).passthrough();

/* ---------- auth (no token) ---------- */
export const api = {
  requestCode: (email: string) => call('crmRequestCode', [email], ok),
  verifyCode: (email: string, code: string) => call('crmVerifyCode', [email, code], z.object({ ok: z.boolean(), token: z.string(), days: z.number().optional() })),
  logout: (token: string) => call('crmLogout', [token], ok),
  requestAccess: (d: { name: string; email: string; message: string }) => call('crmRequestAccess', [d], ok),

  /* ---------- CRM (existing) ---------- */
  bootstrap: () => call('crmBootstrap', [], S.BootstrapSchema),
  lead: (id: string) => call('crmLead', [id], S.LeadDetailSchema),
  saveLead: (data: Record<string, unknown>) => call('crmSaveLead', [data], S.okLead),
  deleteLead: (id: string) => call('crmDeleteLead', [id], z.object({ ok: z.boolean(), id: z.string(), deleted: z.record(z.number()).optional() })),
  addActivity: (d: { leadId: string; kind: string; direction: string; summary: string; details: string }) => call('crmAddActivity', [d], S.okLead),
  addTask: (d: { leadId: string; task: string; due: string; owner: string }) => call('crmAddTask', [d], z.object({ ok: z.boolean(), task: S.TaskSchema })),
  setTask: (id: string, status: string) => call('crmSetTask', [id, status], z.object({ ok: z.boolean(), task: S.TaskSchema })),
  updateBooking: (id: string, d: { status?: string; outcome?: string }) => call('crmUpdateBooking', [id, d], S.okLead),
  sendEmail: (d: { leadId: string; subject: string; body: string }) => call('crmSendEmail', [d], S.okLead),
  logWhatsApp: (d: { leadId: string; text: string; template: string }) => call('crmLogWhatsApp', [d], S.okLead),
  dashboard: (r: { from?: string; to?: string }) => call('crmDashboard', [r], S.DashboardSchema),

  /* ---------- CRM (new, section 8.1) ---------- */
  activityFeed: (q: { before?: string; limit?: number; kind?: string; by?: string }) => call('crmActivityFeed', [q], S.page(S.ActivitySchema)),
  bulkUpdateLeads: (ids: string[], patch: Record<string, unknown>) =>
    call('crmBulkUpdateLeads', [{ ids, patch }], z.object({ ok: z.boolean(), updated: z.array(S.LeadSchema), failed: z.array(z.object({ id: z.string(), error: z.string() })) })),
  saveTemplate: (t: Partial<S.Template>) => call('crmSaveTemplate', [t], z.object({ ok: z.boolean(), template: S.TemplateSchema })),
  saveTeamMember: (m: Partial<S.TeamMember>) => call('crmSaveTeamMember', [m], z.object({ ok: z.boolean(), team: z.array(S.TeamMemberSchema) })),
  settings: () => call('crmSettings', [], z.array(S.SettingSchema)),
  saveSettings: (s: Record<string, string>) => call('crmSaveSettings', [s], z.object({ ok: z.boolean(), settings: z.array(S.SettingSchema) })),

  /* ---------- announcements, inbox, notifications, audit (8.2) ---------- */
  pulse: (since: string) => call('crmPulse', [{ since }], S.PulseSchema),
  notifications: (q: { before?: string; limit?: number; unreadOnly?: boolean }) => call('crmNotifications', [q], S.page(S.NotificationSchema)),
  markNotifications: (q: { ids?: string[]; all?: boolean }) => call('crmMarkNotifications', [q], z.object({ ok: z.boolean(), unread: z.number() })),
  announcements: (q: { status?: string; before?: string; limit?: number }) => call('crmAnnouncements', [q], S.page(S.AnnouncementSchema)),
  saveAnnouncement: (a: Record<string, unknown>) => call('crmSaveAnnouncement', [a], z.object({ ok: z.boolean(), announcement: S.AnnouncementSchema })),
  ackAnnouncement: (id: string, ack: boolean) => call('crmAckAnnouncement', [id, { ack }], z.object({ ok: z.boolean(), seenAt: z.string(), ackAt: z.string() })),
  announcementStats: (id: string) => call('crmAnnouncementStats', [id], z.object({ audience: z.array(z.object({ email: z.string(), name: z.string(), seenAt: z.string(), ackAt: z.string() })) })),
  remindAnnouncement: (id: string) => call('crmRemindAnnouncement', [id], z.object({ ok: z.boolean(), reminded: z.number() })),
  threads: () => call('crmThreads', [], z.object({ items: z.array(S.ThreadSchema) })),
  thread: (id: string, q: { before?: string; after?: string; limit?: number }) =>
    call('crmThread', [id, q], z.object({ thread: S.ThreadSchema, messages: z.array(S.MessageSchema), next: z.string().nullable().optional(), readBy: z.record(z.string()).optional() })),
  sendMessage: (d: { threadId?: string; to?: string; body: string; replyTo?: string }) =>
    call('crmSendMessage', [d], z.object({ ok: z.boolean(), message: S.MessageSchema, thread: S.ThreadSchema })),
  editMessage: (id: string, d: { body?: string; delete?: boolean }) => call('crmEditMessage', [id, d], z.object({ ok: z.boolean(), message: S.MessageSchema })),
  saveThread: (t: Record<string, unknown>) => call('crmSaveThread', [t], z.object({ ok: z.boolean(), thread: S.ThreadSchema })),
  accessRequests: () => call('crmAccessRequests', [], z.object({ items: z.array(S.AccessSchema) })),
  handleAccess: (id: string, d: { decision: 'accept' | 'reject'; member?: Partial<S.TeamMember>; reason?: string }) => call('crmHandleAccess', [id, d], ok),
  audit: (q: Record<string, unknown>) => call('crmAudit', [q], S.page(S.AuditSchema)),

  /* ---------- files on Drive + email preferences ---------- */
  fileTicket: (q: { op: 'upload'; leadId: string; name: string; mime: string; size: number } | { op: 'view' | 'trash'; id: string }) =>
    call('crmFileTicket', [q], z.object({ url: z.string(), ticket: z.string(), maxBytes: z.number().optional() })),
  attachFile: (receipt: string) => call('crmAttachFile', [receipt], z.object({ ok: z.boolean(), file: S.FileSchema })),
  deleteFile: (id: string) => call('crmDeleteFile', [id], z.object({ ok: z.boolean(), trash: z.object({ url: z.string(), ticket: z.string() }).nullable().optional() })),
  saveMyPrefs: (p: { emailOff?: string[]; pushOff?: string[] }) =>
    call('crmSaveMyPrefs', [p], z.object({ ok: z.boolean(), emailOff: z.array(z.string()), pushOff: z.array(z.string()).optional() })),

  /* ---------- push notifications ---------- */
  pushSubscribe: (sub: { endpoint: string; device: string }) => call('crmPushSubscribe', [sub], z.object({ ok: z.boolean(), devices: z.number() })),
  pushUnsubscribe: (endpoint: string) => call('crmPushUnsubscribe', [endpoint], ok),
  pushTest: (endpoint: string) => call('crmPushTest', [endpoint], z.object({ ok: z.boolean(), sent: z.number() })),

  /* ---------- quotes, invoices, payments ---------- */
  services: () => call('crmServices', [], z.array(S.ServiceSchema)),
  saveService: (s: Partial<S.Service>) => call('crmSaveService', [s], z.object({ ok: z.boolean(), services: z.array(S.ServiceSchema) })),
  billing: (q: { leadId?: string }) => call('crmBilling', [q], S.BillingSchema),
  billingDoc: (kind: 'quote' | 'invoice', id: string) => call('crmBillingDoc', [kind, id], z.object({ doc: z.record(z.unknown()), status: z.string() })),
  saveQuote: (q: Record<string, unknown>) => call('crmSaveQuote', [q], z.object({ ok: z.boolean(), quote: S.QuoteSchema, invoices: z.array(S.InvoiceSchema).optional() })),
  sendDoc: (kind: 'quote' | 'invoice', id: string, channel: 'email' | 'whatsapp' | 'link') => call('crmSendDoc', [kind, id, channel], z.object({ ok: z.boolean(), link: z.string() }).passthrough()),
  decideQuote: (id: string, decision: 'accept' | 'reject', reason?: string) => call('crmDecideQuote', [id, decision, reason || ''], z.object({ ok: z.boolean() }).passthrough()),
  prepareInvoice: (id: string, due?: string) => call('crmPrepareInvoice', [id, due || ''], z.object({ ok: z.boolean(), invoice: S.InvoiceSchema })),
  updateInvoice: (id: string, p: { dueDate?: string; note?: string }) => call('crmUpdateInvoice', [id, p], z.object({ ok: z.boolean(), invoice: S.InvoiceSchema })),
  voidInvoice: (id: string, reason: string) => call('crmVoidInvoice', [id, reason], z.object({ ok: z.boolean(), invoice: S.InvoiceSchema })),
  stopSubscription: (quoteId: string) => call('crmStopSubscription', [quoteId], z.object({ ok: z.boolean() }).passthrough()),
  recordPayment: (invoiceId: string, p: Record<string, unknown>) =>
    call('crmRecordPayment', [invoiceId, p], z.object({ ok: z.boolean(), invoice: S.InvoiceSchema, emailed: z.boolean(), emailError: z.string() })),
  deletePayment: (id: string) => call('crmDeletePayment', [id], z.object({ ok: z.boolean() }).passthrough())
};
