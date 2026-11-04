# Changelog

## 1.6.0 (design pass by Sherif)

- Home: «اعمل دلوقتي / Do this now», one prioritised list (meeting about to start, meetings without an outcome, overdue tasks, unanswered new leads, due follow-ups, today's tasks, renewals) with one action per row and a snooze for follow-ups. Replaces «Needs your attention». A quick-capture bar adds a client from one line (name + phone, Enter).
- Phone: floating + (new client / task / meeting / message), labelled bottom nav, search icon in the header, pipeline shows one stage at a time with stage tabs and a «Move to stage» menu, collapsible filters on Contacts.
- First-run tour (once per person per device, reopen from the account menu or Ctrl+K), keyboard cheat-sheet on «?», recent clients in Ctrl+K.
- Search folds Arabic spellings (أ إ آ ا, ة ه, ى ي, tashkeel, Arabic-Indic digits) and matches phones in any format (05…, +966…, 00966…) in Ctrl+K, Contacts, Pipeline and Home.
- Fixes: completing a task no longer opens the client; the first field of every dialog is focused (the first space no longer closes the log-contact dialog); Enter submits dialogs; inline field errors; duplicate client shown inline with «open existing»; stage changes in the client drawer have the 5-second Undo, a «Next stage» button and larger targets; follow-up chips also create a real task; a new task jumps to the tab it lands in; entering «Lost» always asks for the reason.
- Accessibility: muted text and badge colours meet WCAG AA in both themes, 44 px targets on touch screens, one shared keyboard pattern for clickable rows, one shared load-error state with Retry, language-aware separators, billing statuses translated.

## 1.5.0 — 2026-11-02

- Quotes and invoices: services list with prices (Settings → Billing); «العروض والفواتير» tab on every client with a quote editor and live A4 preview (services, per-line and total discounts with a name, payment plan with dates, monthly lines, client details).
- Sending by WhatsApp, email or link; the client's private page (#/d/…) shows the document, downloads the PDF and accepts the quote. Opening and accepting ring the team.
- On acceptance: one invoice per payment of the plan (first ready, dated ones ready a week before, others on «جهّز»); monthly lines make an invoice every month until stopped. Lead value, MRR and stage follow.
- Payments with date, transfer reference, sender name and account; paid / balance / status recomputed; duplicate references blocked; partly paid and paid invoices; admins can remove a wrong payment or cancel an unpaid invoice.
- Review before sending by default; «إرسال تلقائي» sends invoices, payment updates and reminders by itself. Daily: reminders (3 days before, due day, 3 and 7 days late), expiry, follow-up task when a quote is opened but not answered.
- New sheet tabs: الخدمات، العروض، الفواتير، المدفوعات. Fix: «load more» never skips rows that share a timestamp.

## 1.4.0 — 2026-10-30

- Push notifications on phones and computers, even with the app closed: standard Web Push with VAPID keys made and signed (ES256) inside Apps Script, no outside service. Pushes carry no data; the service worker asks `crmPushPull` what is new and shows it, tapping opens the right page.
- «تنبيهات الموبايل» in Preferences: switch on per device, test, switch off, mute kinds (urgent announcements always ring). iPhone: from the installed app (iOS 16.4+).
- New sheet tab «أجهزة التنبيهات» (one row per device); dead devices are removed automatically; signing out removes the device.

## 1.3.0 — 2026-10-30

- Installable app: manifest with maskable icons and shortcuts (contacts, schedule, tasks, inbox), iPhone full-screen metas and safe-area padding; «التطبيق على جهازك» card in Preferences with an install button (Chrome, Edge, Android) or the Safari steps on iPhone.
- Offline: the service worker precaches every file of the build; the last loaded data is kept on the device (cleared on sign-out) so the app opens read-only without a connection.
- Updates: a new version waits and the app shows «فيه نسخة جديدة · حدّث» instead of swapping files under an open page; it checks every 30 minutes.

## 1.2.0 — 2026-10-30

- Files on Google Drive: upload (drag and drop, progress, 20 MB, PDF, images, Office, ZIP), in-app preview of images and PDFs, delete to the Drive bin. Files live on the Drive account with the space through a separate «Magmafy Files» script (`backend/files/Files.gs`), reached with signed 10-minute tickets; new sheet tab «الملفات».
- Email notifications: unread bell notifications grouped into one email per person, on an interval an admin picks in Settings (right away, 5, 10, 15, 30, 60 minutes, off; default 15). Urgent announcements always go right away; each person can mute kinds in Preferences.
- Tests cover both scripts together (tickets, replay, tampering, permissions, digest timing, mutes).

## 1.1.0 — 2026-10-30

- Backend (`backend/`): gateway for the site (`doPost action=crm`) and the 23 new functions: announcements, team chat, notifications and pulse, access requests, audit log, settings, team, templates, bulk lead edits, activity feed.
- 7 new sheet tabs created by «① تجهيز الشيت», plus `CRM_URL` and `CHAT_POLL_SECONDS` settings and an «نشط» column for templates.
- Every change (site, sheet edits, public bookings) goes to «سجل التعديلات»; assignments, bookings, announcements, messages and mentions ring the bell.
- Fix: ids no longer wrap to 0000 after 9999 records.
- Tests run the real `.gs` files against an in-memory sheet with the site's schemas.

## 1.0.0 — 2026-10-30

First complete build.

- Login with email + one-time code, request access, welcome flow.
- Workspace (kit layout) with the 3D volcano in the "O" of WORKSPACE, KPIs, today's meetings and tasks.
- Contacts (grid and table, filters, bulk actions), Companies, Lead drawer and full page (card, scope, tasks, docs, log, chat, audit).
- Schedule (day, week and month), booking a meeting, meeting outcomes; header "Your Schedule" bar with a live now marker.
- Tasks, Sales tools: Pipeline (drag between stages, lost reason, undo), Reports, Templates, Activity feed.
- Inbox: direct, group and client threads with mentions; admin ↔ employee chat.
- Announcements: admin editor (levels, audience, pin, schedule, expiry, require acknowledgement), banner, urgent modal, bell, read and ack stats, reminders, Q&A thread.
- Settings: preferences, team, access requests, agency settings, audit log with CSV export.
- Dark (default), light and auto themes; Arabic (RTL) and English; mobile layout with bottom nav.
- In-browser mock backend, CI to GitHub Pages, unit tests for time and rules.
- 3D: the real magmafy-pro particle volcano everywhere (no SVG fallback); slow devices get fewer particles but keep animating; bigger volcano in the Workspace hero.
- Brand: official Magmafy mark and wordmark (login, welcome, header, rail), favicon, app icons and Apple touch icon.
- Mobile: every 3D shape sits centred behind the content, sized to the screen width.
- Login: the Magmafy mark as a 3D particle shape (same shader and colours as the volcano) floating above a centred form.
- Fix: company grouping now strips generic Arabic words (`\b` does not match Arabic letters).
