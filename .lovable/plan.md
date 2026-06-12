# Custom Live Support — Plan

A self-hosted live chat system for your existing website. Three parts ship from this Lovable project:

1. **Backend + database** (Lovable Cloud) — stores conversations, messages, visitors.
2. **Operator Dashboard** (this app, installable as a PWA) — your inbox where you read & reply, with push notifications to your phone.
3. **Embeddable widget** (`widget.js`) — a single `<script>` tag you drop into your existing website. Visitors chat with Groq AI; "Talk to Human" hands the conversation to you.

---

## What you need to provide

Only one thing now: **your Groq API key** (I'll store it as a secret). Lovable Cloud, Web Push keys (VAPID), and everything else I generate. No zip needed — we're building fresh, then you swap the embed snippet on your site.

Optional: the domain(s) of your website so I can lock CORS to them.

---

## User flows

**Visitor on your site**
- Opens widget → AI (Groq) answers instantly.
- Taps **Talk to Human** → conversation flagged `pending_human`, you get a push notification on your phone, AI stops replying.
- You reply from the dashboard → visitor sees your messages live.

**You (operator)**
- Install the dashboard as a PWA on your phone (Add to Home Screen).
- Allow notifications once.
- Push arrives the moment a visitor opens chat or hits Talk to Human (configurable).
- Tap notification → opens the conversation, you reply, assign to yourself, or close it.

---

## Architecture

```text
[Your website] ──<script src="widget.js">──┐
                                            │  (chat events, REST + realtime)
                                            ▼
                              [Lovable Cloud: Postgres + Realtime + Auth]
                                            ▲
                                            │  (server functions: Groq calls, push send)
                                            ▼
                              [Operator Dashboard PWA — only you log in]
                                            │
                                            ▼
                                  [Web Push → your phone]
```

## Technical details

**Database tables**
- `conversations` (id, visitor_id, status: `bot|pending_human|human|closed`, assigned_to, site_origin, started_at, last_message_at)
- `messages` (id, conversation_id, role: `visitor|assistant|operator|system`, content, created_at)
- `visitors` (id, fingerprint, name?, email?, user_agent, ip_country, referrer)
- `push_subscriptions` (id, user_id, endpoint, p256dh, auth)
- `operator_settings` (notify_on_visit, notify_on_human_request, away_message)

RLS: visitors access only their own conversation via a signed visitor token (stored in widget localStorage). Operator (you) reads all via authenticated session + `has_role('operator')`.

**Server functions (TanStack Start `createServerFn` + a public route for the widget)**
- `POST /api/public/widget/message` — visitor sends message; if status=`bot`, stream Groq reply back; persist both.
- `POST /api/public/widget/request-human` — flip status, trigger push.
- `POST /api/public/widget/init` — issue visitor token, create conversation.
- `operator.reply`, `operator.assign`, `operator.close` — authed server fns.
- `push.subscribe`, `push.send` — VAPID web-push (using `web-push` npm package).

**Groq integration**
- Server-side only. Key stored as `GROQ_API_KEY` secret.
- Default model: `llama-3.3-70b-versatile` (you can change). System prompt configurable in operator settings.
- Detects "talk to human / agent / person / real" intents → auto-flips conversation to `pending_human`.

**Operator dashboard (this app)**
- Auth: Lovable Cloud email/password, single user (you).
- Inbox: conversation list with unread badges, live updates via Supabase Realtime.
- Conversation view: message thread, composer, status controls (Assign to me, Close, Reopen, Block visitor).
- Settings: Groq system prompt, notification rules, away message, install-as-PWA prompt, push permission button.
- PWA: manifest + service worker (firebase-messaging-style web-push worker for background notifications).

**Widget (`/widget.js` served from this app)**
- Vanilla JS, ~15KB, no framework. Shadow DOM to avoid CSS clashes with your site.
- Floating bubble → expands to chat panel. Theming via `data-*` attributes on the script tag (color, position, greeting).
- Reconnects on tab focus; persists `visitor_token` in localStorage so returning visitors resume their thread.
- Embed snippet:
  ```html
  <script src="https://your-app.lovable.app/widget.js"
          data-site="yourdomain.com"
          data-color="#0ea5e9"
          data-greeting="Hi! How can we help?"
          defer></script>
  ```

**Push notifications**
- Web Push via VAPID (works on Android Chrome, desktop Chrome/Edge/Firefox, and iOS 16.4+ after installing the PWA to home screen — this is an iOS platform requirement, not a limitation we can bypass).
- Notification payload: visitor preview text + deep link to the conversation in the dashboard.
- Triggers: new visitor message while you're not active in that conversation, and always on `request_human`.

---

## Build order

1. Enable Lovable Cloud, create schema + RLS, seed your operator account.
2. Add `GROQ_API_KEY` secret (I'll prompt you).
3. Operator dashboard shell + auth + inbox + conversation view + realtime.
4. Public widget endpoints + Groq streaming + human-handoff logic.
5. `widget.js` build (Vite library mode, output to `public/widget.js`).
6. PWA manifest + service worker + VAPID push subscribe/send.
7. Settings page + system-prompt editor + push test button.
8. Give you the final embed snippet + install instructions for the PWA.

---

## Out of scope (ask if you want them added)

- Multi-agent / team routing (you chose just-you).
- SMS/WhatsApp/Telegram fallback notifications (you chose Web Push).
- File/image uploads in chat.
- Visitor email transcripts.
- Analytics dashboard (volume, response time, CSAT).

When you approve, I'll switch to build mode, enable Cloud, and ask for your Groq key at the right step.
