# Likoy Vidya Vriddhi Email Bulker

A production-ready bulk email sender built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS 4**, **Nodemailer**, and **MongoDB**. It sends personalized campaigns through your own SMTP account with server-enforced throttling, batch cooldowns, session caps, retries, and a real-time delivery log streamed with Server-Sent Events. Campaigns run **in the background on the server**, so closing the browser tab or laptop does not stop them. The whole dashboard sits behind a JWT login.

![Likoy Vidya Vriddhi Email Bulker](public/favicon.png)

## Features

- **JWT login** — username/password from `.env`, signed HS256 token in an `httpOnly` cookie, route protection in `proxy.ts`, and a server-side session check on the dashboard page.
- **Tabbed navigation** — Setup → Audience → Compose → Send as separate views, so the whole app is not one long scrolling page. State is preserved when switching tabs.
- **Mobile-first layout** — on phones the sidebar becomes a five-icon tab bar pinned under the header, the page scrolls with the document (sticky header + tab bar, no cut-off panels or sideways scroll), and wide tables scroll inside their own card. The desktop layout keeps the fixed shell with an independently scrolling main area.
- **Bring your own SMTP** — Gmail App Passwords, Brevo, Zoho, Outlook, Mailtrap, or any standard SMTP relay. Use `.env` credentials or enter them in the dashboard.
- **Recipient management** — paste comma/newline separated addresses, `Name <email>` pairs, or spreadsheet rows, or upload a CSV. Columns are auto-detected (`email`, `name`, `company`); any extra column is kept but ignored for personalization.
- **Personalization** — only the fields we actually know are dynamic: `{{name}}`, `{{company}}` and `{{email}}`. Missing values fall back to `there` / `your team`, and unknown placeholders are removed so a raw `{{token}}` never reaches an inbox.
- **Composer** — rich-text editor with an HTML mode, email-safe font stacks, font size, text/background/accent color controls, and variable insert buttons.
- **Live preview** — renders through the *same* function used by the server, inside a sandboxed iframe, for any recipient in your list. Desktop and mobile widths.
- **Safe rate limiting (server-side)** — configurable per-email delay (1–120s), batch size (1–200), batch cooldown (0–15min), a per-campaign session cap, and a **hard daily cap across all campaigns**. Transient SMTP errors are retried twice with backoff.
- **Real-time progress** — SSE stream updates the progress bar, status counters, cooldown countdown, and every log row (timestamp, status, message ID, or error) as it happens.
- **Background sending** — the send engine lives on the server, not in the browser. Closing the tab, the laptop lid, or the whole browser does **not** stop a campaign; reopening the dashboard shows a “campaign running in the background” banner with **Attach** (live view) and **Stop**. If a different tab starts a second campaign it is rejected server-side.
- **Free serverless mode** — on Vercel (or any host with a hard function timeout) a campaign is split into chunks. Each chunk stops cleanly before the function limit, waits out any batch cooldown, and resumes automatically while the dashboard tab is open. If the tab or laptop sleeps, the campaign pauses safely and can be resumed later.
- **Cancel anytime** — Stop writes a flag to the database, so it works from any tab and even after a reload. The in-flight message is marked *unconfirmed* and everything else stays pending for a safe resume.
- **Persistent history (MongoDB)** — every campaign and message is written to MongoDB (Atlas or self-hosted). A crash, power cut, or server restart never loses the record of who was emailed.
- **Crash recovery / resume** — if a run is interrupted, the dashboard shows a banner and can resume only the unfinished rows. Already-sent emails are never repeated; messages that were mid-send when the process died are marked *unconfirmed* and only re-sent if you explicitly opt in (duplicate risk).
- **Cross-campaign duplicate guard** — before sending, the audience list is checked against history. Already-contacted leads are flagged (`Sent before`) and skipped by default; a deliberate override in the Send tab allows re-sending duplicate leads.
- **Duplicate leads report + CSV export** — see every lead contacted 2+ times with send counts and last-sent dates, and export all leads or only duplicates to CSV for Excel/Sheets.
- **Exportable audit log** — download any campaign's full delivery log as CSV.
- **Favicon** — `public/favicon.png` is wired into the dashboard header and as the app icon (`app/icon.png` + metadata).

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16, App Router, TypeScript |
| Styling | Tailwind CSS 4 |
| Icons | lucide-react |
| Email engine | Nodemailer |
| Database | MongoDB (official Node driver) |
| Streaming | Server-Sent Events via `ReadableStream` |
| CSV parsing | Custom RFC-4180-ish parser (no dependency) |

## Folder structure

```
my-app/
├── proxy.ts                         # JWT auth gate for pages and API routes
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts       # Credential check + signed session cookie
│   │   │   └── logout/route.ts      # Clears the session cookie
│   │   ├── campaigns/route.ts       # Recent campaign history + active campaign + quota
│   │   ├── campaigns/[id]/resume/   # Resume an interrupted campaign (SSE)
│   │   ├── campaigns/[id]/status/   # Snapshot used to attach to a background run
│   │   ├── campaigns/[id]/stop/     # Stop a background run (DB flag)
│   │   ├── campaigns/[id]/export/   # CSV export of a campaign log
│   │   ├── config/route.ts          # Non-secret runtime defaults (.env status)
│   │   ├── history/check/route.ts   # Which emails were already contacted
│   │   ├── history/contacts/route.ts# Contacted-lead counts (duplicates report)
│   │   ├── history/export/route.ts  # Contacted / duplicate leads CSV
│   │   ├── send-bulk/route.ts       # SSE streaming bulk sender (core engine)
│   │   └── verify-smtp/route.ts     # "Test connection" endpoint
│   ├── login/page.tsx               # Sign-in screen (redirects if already signed in)
│   ├── globals.css                  # Tailwind theme, editor styles, fonts
│   ├── icon.png                     # App icon (copy of public/favicon.png)
│   ├── layout.tsx                   # Metadata, favicon, root layout
│   └── page.tsx                     # Server auth check → renders the dashboard
├── components/
│   ├── BackgroundCampaignBanner.tsx # Attach/Stop banner for a server-side run
│   ├── CampaignConsole.tsx          # Progress, safety controls, live log, export
│   ├── ComposerPanel.tsx            # Subject, rich/HTML editor, typography
│   ├── ContactedLeads.tsx           # Duplicate leads report + CSV export
│   ├── Dashboard.tsx                # Dashboard composition, state and sign-out
│   ├── InterruptedCampaignBanner.tsx# Resume banner for crashed runs
│   ├── LoginForm.tsx                # Username/password form with error states
│   ├── PreviewPane.tsx              # Sandboxed live preview (desktop/mobile)
│   ├── RecentCampaigns.tsx          # Campaign history with per-campaign CSV
│   ├── RecipientPanel.tsx           # Paste, CSV upload, live validation count
│   ├── RichTextEditor.tsx           # contentEditable editor + toolbar
│   ├── SmtpPanel.tsx                # Env/manual SMTP, presets, test connection
│   └── ui.tsx                       # Buttons, cards, fields, badges, switch
├── hooks/
│   └── useCampaign.ts               # SSE client, reducer, stop/reset/export state
├── lib/
│   ├── auth.ts                      # JWT sign/verify, env credentials, cookie options
│   ├── campaign-runner.ts           # Shared throttled send engine (new + resume)
│   ├── csv-export.ts                # Safe CSV serializer (formula-injection guarded)
│   ├── csv.ts                       # CSV parser, email list parser, sample CSV
│   ├── db.ts                        # MongoDB history, duplicates, quota, stop flag
│   ├── mongo.ts                     # Cached MongoDB client + connection errors
│   ├── mailer.ts                    # SMTP resolution, transporter, error mapping
│   ├── sanitize.ts                  # Scrubs active content from email HTML
│   ├── session.ts                   # Reads the session cookie on the server
│   ├── template.ts                  # Email renderer (shared preview + send)
│   ├── types.ts                     # Shared TypeScript contracts
│   └── utils.ts                     # Validation, escaping, CSV download, format
├── public/
│   └── favicon.png                  # Brand favicon
├── .env.example
└── README.md
```

## Getting started

### 1. Create the database (free)

1. Sign in at <https://cloud.mongodb.com> and create a **free M0 cluster**.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → allow your IP (or `0.0.0.0/0` if your host uses dynamic IPs).
4. **Connect → Drivers** → copy the connection string, e.g.
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
5. Put it in `.env` as `MONGODB_URI=...` (the app creates the indexes and collections itself).

Until `MONGODB_URI` is set, the dashboard shows a red **“Database not connected”** banner and sending is blocked — this is intentional, because history and duplicate protection live in the database.

### 2. Run the app

```bash
cd my-app
npm install
cp .env.example .env       # fill in SMTP + MongoDB + auth values
npm run dev
```

Open <http://localhost:3000>. You will be redirected to `/login` and must sign in with `AUTH_USERNAME` / `AUTH_PASSWORD` from your env file.

## Authentication

The dashboard uses a single-account login configured entirely from the environment:

| Variable | Purpose |
| --- | --- |
| `AUTH_USERNAME` | Login username |
| `AUTH_PASSWORD` | Login password |
| `JWT_SECRET` | HMAC-SHA256 signing secret — generate with `openssl rand -base64 48` |

- `POST /api/auth/login` checks the credentials in constant time, then sets a signed HS256 JWT in an `httpOnly`, `SameSite=Lax` cookie (7-day expiry, `Secure` in production).
- `proxy.ts` redirects unauthenticated page requests to `/login?next=…` and returns `401` for protected API routes.
- `app/page.tsx` verifies the session again on the server before rendering the dashboard, and `/api/auth/logout` clears the cookie.
- Repeated failed sign-ins are throttled per IP (8 attempts / 10 minutes).
- Change the credentials and `JWT_SECRET` before deploying, and restart the server after editing `.env`.

### Option A — use `.env` credentials

1. Copy `.env.example` to `.env` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM_EMAIL`.
2. Restart `npm run dev`.
3. The SMTP panel will show **Env ready** and the "Use .env credentials" toggle stays on.

### Option B — enter credentials in the dashboard

1. Switch off **Use .env credentials**.
2. Pick a preset (Gmail, Brevo, Zoho, Outlook) or enter host/port/SSL manually.
3. Enter the username and app password, plus the sender name/email.
4. Click **Test SMTP connection** before sending.

Credentials are only held in React state and sent to your own backend per request. They are never written to disk, `localStorage`, or a database.

### Provider notes

| Provider | Host | Port | TLS | Notes |
| --- | --- | --- | --- | --- |
| Gmail | `smtp.gmail.com` | 587 (STARTTLS) or 465 (SSL) | per port | Requires 2-Step Verification and a 16-character **App Password**; normal passwords are rejected. |
| Brevo | `smtp-relay.brevo.com` | 587 | STARTTLS | Use the SMTP login and SMTP key from Brevo → SMTP & API. |
| Zoho | `smtp.zoho.com` | 465 | SSL | App-specific password may be required. |
| Outlook | `smtp-mail.outlook.com` | 587 | STARTTLS | Use an app password if MFA is enabled. |
| Mailtrap | `sandbox.smtp.mailtrap.io` | 2525 | none | Great for safe local testing. |

## CSV format

The email column is detected by header name or by sampling the data, so column order does not matter.

```csv
email,name,company,role
alex.morgan@example.com,Alex Morgan,Northwind Labs,Head of Growth
priya.shah@example.com,Priya Shah,Brightline Studio,Founder
```

- `email` is required. `name` and `company` are optional and are the only fields used for personalization.
- Extra columns (like `role` above) are parsed for reference but ignored — a `{{role}}` token is removed rather than sent blank.
- Duplicates (case-insensitive) and invalid addresses are removed and counted in the UI.
- Quoted fields, escaped quotes, CRLF, and UTF-8 BOM are supported.

You can download a ready-to-use sample from the Recipients card or click **Load sample**.

## How the safe sending engine works

The API route (`app/api/send-bulk/route.ts`) is the only place that talks to SMTP. It hands the run to the shared engine (`lib/campaign-runner.ts`), which is also used to resume interrupted campaigns:

1. **Validate** the payload, resolve credentials (panel or env), and sanitize recipients.
2. **Duplicate guard** — emails already contacted in a previous campaign are skipped unless the sender ticks "re-send to already-contacted leads".
3. **Persist** the campaign and every recipient document in MongoDB *before* the first send, so a crash can never lose the queue.
4. **Verify** the SMTP connection once, then stream a `start` event and begin the queue.
5. For each recipient: render the subject/HTML/text, mark the row `sending`, send with Nodemailer, then mark it `sent`/`failed`.
6. **Throttle**: wait `delayMs` between messages. Every `batchSize` messages, pause `cooldownMs` and emit a cooldown countdown.
7. **Daily cap**: before every send the engine counts successful sends today across all campaigns and stops at `DAILY_SEND_CAP` (rows are marked skipped with "resume tomorrow").
8. **Retry** transient SMTP errors (421/450/451/452, timeouts, resets) up to 3 attempts with 4s/10s backoff.
9. **Cap**: only the first `sessionCap` valid recipients of a run are sent; the rest are marked `skipped`.
10. **Background mode**: the send loop is owned by the server process, not the HTTP response. The SSE stream is only a live view; when the client disconnects the loop keeps going. **Stop** sets `cancelRequested` in MongoDB, which the loop checks between messages, and the in-flight row becomes `unconfirmed` (outcome unknown) instead of pretending it failed.
11. Emit a final `done` (or `cancelled`) event with duration and totals. If nobody is watching, the result is still in MongoDB and the dashboard reads it on the next visit.

SSE events: `start`, `verified`, `notice`, `warning`, `cooldown`, `log`, `progress`, `paused`, `done`, `cancelled`, `fatal`.

### Serverless chunking (Vercel free plan)

A serverless function cannot run for the ~3 hours a 300-email campaign needs, so the engine detects the host (`lib/runtime.ts`) and sets a deadline of `SERVERLESS_CHUNK_MS` (230 s by default) per run:

1. The loop never starts a message after the deadline, so no email is cut off mid-send.
2. If the next batch cooldown would cross the deadline, the run pauses instead and reports how long to wait.
3. The campaign is marked **interrupted** with accurate counters and a `paused` event.
4. The dashboard waits out the cooldown and calls `/resume` automatically, repeating until the campaign is done.

Keep the dashboard tab open for this. If the tab or laptop sleeps the campaign simply pauses; reopen the dashboard and press **Resume**. A VPS/Railway/Render host has no deadline, so the whole campaign streams in one request and none of this applies.

### History, duplicates & crash recovery

- History lives in MongoDB (`MONGODB_DB`, default `bulk_email`): a `campaigns` collection and a `messages` collection (one document per recipient).
- When a campaign is sending with no dashboard attached, the dashboard shows a **“Campaign running in the background”** banner with **Attach** and **Stop**. Attaching polls `/api/campaigns/[id]/status`; it does not restart or disturb the run.
- On startup (or after a serverless timeout), any campaign still marked `running` whose heartbeat has stopped for 60 seconds is marked **interrupted**, and rows stuck in `sending` become **unconfirmed**. A live campaign refreshes that heartbeat every 15 seconds, so another instance or a cold start never mistakes it for a crash.
- The dashboard then shows a banner: *Resume N remaining*. Resuming re-sends only `pending` rows; `unconfirmed` rows need an explicit checkbox because they may already be delivered.
- "Duplicate leads" (Audience tab tags, Overview report, CSV export) comes from the same history: an address is a duplicate when it has 2+ successful sends.
- Campaign history and per-campaign CSV exports are available in Overview.
- Backups: use Atlas automated backups or `mongodump`/`mongoexport`. Treat the database as personal data — it contains recipient addresses.

### Safety defaults

| Setting | Default | Allowed | Why |
| --- | --- | --- | --- |
| Per-email delay | 6s | 1–120s | Avoid burst detection and provider rate limits |
| Batch size | 10 | 1–200 | Stay around ~100 emails/hour |
| Cooldown | 5min | 0–900s | Let the provider reset counters between batches |
| Session cap | 300 | 1–10,000 | Hard stop per campaign |
| Daily cap | 300 | 1–10,000 (`DAILY_SEND_CAP`) | Free Gmail allows ~500/day — 300 stays under it and spreads over ~3 hours |

The dashboard also requires an explicit opt-in confirmation before each campaign. **Only email people who have consented**, and follow your provider's terms and local anti-spam law (CAN-SPAM, GDPR, PECR, etc.).

## Testing safely

1. **Use a sandbox SMTP server first.** Create a free [Mailtrap](https://mailtrap.io) or [Ethereal](https://ethereal.email) account and put those credentials in `.env`. Both capture mail instead of delivering it to real inboxes.
2. **Load the sample CSV**, preview the message, add your own address as the first row, and start a small campaign (5 recipients, delay 2s, batch size 5, cooldown 10s).
3. Watch the progress bar and delivery log. Then open the CSV export and verify the statuses and timestamps.
4. **Test the stop button** mid-campaign and confirm the remaining rows stay pending while the in-flight row is marked skipped. Then reload the page and confirm the background banner can **Attach** to the same run.
5. **Test background sending**: start a campaign with a long delay, close the tab, wait, and reopen the dashboard — the banner should show progress that kept increasing. Confirm the final status in Overview.
6. **Test failure handling** by temporarily using a wrong password: the connection check fails cleanly instead of crashing. With a valid connection, an invalid recipient produces a `failed` row and the loop continues.
7. Only after the sandbox tests pass should you switch to a real provider and send a single message to yourself before any external campaign.

> Never test with a purchased or scraped list. Every address should be a real opt-in contact.

## Production deployment notes

- Set all SMTP and safety variables in your hosting provider's environment (not in a committed file).
- **MongoDB**: use Atlas (free M0 works) or a self-hosted instance. Set `MONGODB_URI` and optionally `MONGODB_DB`. No persistent disk is needed on the app server now.
- **Background sending needs a long-running Node process for truly unattended campaigns.** Use a VPS, Railway, Render (with a persistent web service) or Docker. On Vercel, both send routes export `maxDuration = 300` and the engine pauses cleanly at ~230 s, then the open dashboard continues the campaign chunk by chunk (waiting out each batch cooldown). That keeps a 300-email campaign safe on the free plan, but it pauses if the tab or laptop sleeps, so a VPS is still better for running while nobody is watching. The dashboard shows a banner explaining which mode it is in.
- The route uses Node.js (`runtime = "nodejs"`) and streaming. Run **one app instance per database**; the interrupted-campaign detector assumes the send loop and the dashboard share a process. Running two replicas against the same DB can make each replica mark the other's campaign as interrupted.
- Keep `AUTH_USERNAME`, `AUTH_PASSWORD` and `JWT_SECRET` in your hosting provider's environment (not a committed file). Use a long random secret and change the default password. The app ships a single-account JWT login; add a real user store or an auth provider if you need multiple accounts.
- The **daily cap** is enforced from MongoDB and survives restarts; the **session cap** applies per run. Both are server-side and cannot be bypassed from the browser.
- SMTP providers have their own daily/hourly quotas. The app cannot exceed them, but you should still choose conservative throttling.
- The email HTML is scrubbed of scripts/frames/event handlers. The preview iframe is sandboxed. URLs in personalization values are HTML-escaped.

## Scripts

```bash
npm run dev     # start the development server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint
```

## License

MIT — use it, adapt it, and send responsibly.
