
## What we're adding

1. **Live visitor context for you (the agent)** — for every conversation, see:
   - The page the visitor is currently on (updates as they navigate)
   - Their IP country + city (derived server-side from request headers)
   - Their browser + OS (parsed from user agent)
   - Their referrer and time on site
2. **Pre-chat email gate** — before the visitor can send their first message, the widget asks for their email with the line: *"So we can reach you and assist better."*

---

## 1. Visitor presence & navigation tracking

### Widget side (`/widget.js`)
- On every page load (and on SPA `history.pushState` / `popstate`), send a lightweight `presence` ping to a new endpoint `/api/public/widget/presence` with: `visitor_id`, `visitor_token`, `page_url`, `page_title`, `referrer`.
- Heartbeat every 25s while the tab is visible so you can see who's *currently* on the site, not just who messaged.
- Parse browser + OS client-side from `navigator.userAgent` and include it once on `init`.

### Server side
- New endpoint `src/routes/api/public/widget/presence.ts` — validates visitor token, updates `visitors.last_seen_at`, `visitors.current_page_url`, `visitors.current_page_title`, and inserts a row into a new `visitor_page_views` table (page_url, title, visited_at).
- On `init` and `presence`, read Cloudflare geo headers (`cf-ipcountry`, `cf-ipcity`, `cf-region`) and store onto `visitors` (`ip_country`, `ip_city`, `ip_region`, `browser`, `os`).

### Dashboard side (`_authenticated.inbox.tsx`)
- New **"Live visitors"** panel above the conversation list showing everyone seen in the last 2 minutes (even without a message yet), with: country flag, city, browser, current page, time on site.
- In the conversation detail pane, add a **Visitor info** sidebar card showing the same fields + recent page history (last 10 pages from `visitor_page_views`).
- Use Supabase Realtime on `visitors` and `visitor_page_views` so it updates live.

### Schema changes (migration)
```
ALTER TABLE visitors ADD COLUMN ip_city text, ip_region text, browser text, os text,
  current_page_url text, current_page_title text, email text;
CREATE TABLE visitor_page_views (id, visitor_id, page_url, page_title, referrer, visited_at);
-- + GRANTs + RLS (operator-only read), + add both tables to supabase_realtime publication
```

---

## 2. Pre-chat email gate

### Widget UX
- First time the visitor opens the chat (no `email` stored on their visitor record), show a small form **instead of** the message composer:
  - One email input (validated, required)
  - Caption underneath: *"So we can reach you and assist better."*
  - Single **"Start chat"** button
- After submit, the composer appears and the AI greeting is shown. Email is remembered in localStorage + on the visitor record, so returning visitors skip the form.
- Keeps the form to one field on purpose to avoid friction — exactly as you asked.

### Server
- New endpoint `/api/public/widget/identify` accepts `{ email }`, writes to `visitors.email`, returns ok.
- `message` endpoint rejects with `requires_email: true` if visitor has no email yet, as a safety net.

### Dashboard
- Visitor's email shows in the conversation header and live-visitors panel, and is included in push notifications ("New chat from jane@acme.com — Pricing page").

---

## Technical notes
- IP/country: read from request headers in the server route handler — no third-party geo API needed on Lovable Cloud.
- Browser/OS parsing: tiny inline regex in widget (no `ua-parser-js` dependency) to keep widget < 10 KB.
- Presence pings are POST with `keepalive: true` so they survive page unloads.
- All new endpoints stay under `/api/public/widget/*` (no auth, validated visitor token).
- No business-logic changes to existing AI/human handoff flow.

---

## Files touched
- **New**: `src/routes/api/public/widget/presence.ts`, `src/routes/api/public/widget/identify.ts`, migration for `visitors` columns + `visitor_page_views` + realtime.
- **Edited**: `src/routes/widget[.]js.ts` (email gate + presence + UA parsing), `src/routes/api/public/widget/init.ts` + `message.ts` (geo headers, email check), `src/lib/operator.functions.ts` (live visitors query, page history query), `src/routes/_authenticated.inbox.tsx` (Live visitors panel + Visitor info card), `src/lib/notify.server.ts` (include email + page in push title).

Confirm and I'll build it.
