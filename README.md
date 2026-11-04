# Magmafy CRM

The Magmafy team's CRM portal: login, leads and pipeline, schedule, tasks, team chat and admin announcements. It is built on the HubSpot CRM Kit layout, with the 3D volcano and colour scheme from magmafy-pro. Dark is the default theme, with light and auto as options. Arabic (RTL) is the default language, with English available.

The backend is Google Apps Script + a Google Sheet; its source is in `backend/` (setup steps in `backend/README.md`, in Arabic).

## Quick start

```bash
npm install
npm run dev:mock     # full app on sample data, no backend needed
```

Open the URL Vite prints. Sign in with any team email from the sample data (the login page shows a hint), then enter code **123456**. Mock data lives in your browser's localStorage. Clear `mg-crm-mock-db-v3` to reset it.

To work against the real backend:

```bash
cp .env.example .env.local   # set VITE_API_URL to the Apps Script /exec URL
npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `dev:mock` | Dev server (real API / in-browser mock) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run build:mock` | Demo build (mock settings are built into `vite.config.ts`, no .env file needed) on mock data (hash router, relative paths: opens from any folder) |
| `npm run typecheck` · `lint` · `test` | TypeScript strict, ESLint, Vitest |

## Environment

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | none | Apps Script web app `/exec` URL. Put it in a local `.env.production` (not committed) before `npm run build`. |
| `VITE_BASE_PATH` | `/` | Sub-path when hosted under a folder, e.g. `/magmafy-crm/` on GitHub Pages |
| `VITE_ROUTER` | `browser` | `hash` for hosts without SPA rewrites (GitHub Pages works either way: the build ships a `404.html`) |
| `VITE_MOCK` | `0` | `1` = in-browser mock API (never in production) |
| `VITE_DEFAULT_LANG` | `ar` | `ar` or `en` |
| `VITE_DEFAULT_THEME` | `dark` | `dark` or `light` |

## Deploy

**GitHub Pages (automatic).** `.github/workflows/ci.yml` runs lint, typecheck, tests and build on every push, and deploys `main` to Pages. To set it up:
1. In repo settings, open Pages → Source and choose **GitHub Actions**.
2. Optionally, under Settings → Variables → Actions, add `VITE_API_URL`. Without it the site deploys as a mock demo.
3. Optionally add `VITE_BASE_PATH` and `VITE_ROUTER`.

**Vercel / Netlify.** Use framework preset Vite, build command `npm run build`, and output `dist`. Add the env vars above. For the browser router, add an SPA rewrite to `/index.html`.

**Apps Script.** The production build injects a CSP that allows `connect-src` only to `script.google.com` and `script.googleusercontent.com`. Deploy the web app with access set to *Anyone*. The frontend sends `POST` with `Content-Type: text/plain` (no CORS preflight):

```json
{ "action": "crm", "fn": "crmBootstrap", "args": {}, "token": "<session>" }
```

Responses are `{ "ok": true, "data": … }` or `{ "ok": false, "code": "SESSION_EXPIRED|FORBIDDEN|UNKNOWN_FUNCTION|SERVER|APP_ERROR", "error": "…" }`.

## Backend functions the frontend calls

All of them are implemented in `backend/` (`Crm.gs` and `Api.gs`), and `backend/test/` runs them against an in-memory sheet with the site's own schemas on every `npm test`.


`crmRequestCode` `crmVerifyCode` `crmLogout` `crmRequestAccess` `crmBootstrap` `crmPulse` `crmDashboard` `crmLead` `crmSaveLead` `crmDeleteLead` `crmBulkUpdateLeads` `crmAddActivity` `crmAddTask` `crmSetTask` `crmUpdateBooking` `crmLogWhatsApp` `crmSendEmail` `crmSaveTemplate` `crmActivityFeed` `crmNotifications` `crmMarkNotifications` `crmThreads` `crmThread` `crmSaveThread` `crmSendMessage` `crmEditMessage` `crmAnnouncements` `crmSaveAnnouncement` `crmAckAnnouncement` `crmAnnouncementStats` `crmRemindAnnouncement` `crmSettings` `crmSaveSettings` `crmSaveTeamMember` `crmAccessRequests` `crmHandleAccess` `crmAudit`. Also the public `GET ?action=slots` and `POST action=booking`.

The exact argument and return shapes are the Zod schemas in `src/api/schemas.ts`. The reference implementation is `src/api/mock/server.ts`. Every response is validated, so a sheet change that breaks the contract shows a clear error instead of corrupt screens.

## Project map

```
src/
  api/          client (gateway + retry), endpoints, Zod schemas, TanStack Query hooks, mock/
  app/          Shell (header, rail, bottom nav), boot, theme, global actions, error boundary
  auth/         Login (email → OTP), Welcome, AuthProvider
  components/   UI kit (notched cards, pills, chips, Seg…), ScheduleBar, notifications, palette
  features/     workspace, contacts, companies, tasks, schedule, sales, inbox, announcements, settings, profile, lead
  three/        3D volcano world (ported from magmafy-pro) + SVG fallback
  i18n/         t('ar','en') + sheet-value translations
  lib/          Riyadh time, formatting, business rules, hooks
  styles/       tokens (dark/light), base components, fonts
```

See `DECISIONS.md` for why things are built this way and `CHANGELOG.md` for history.
