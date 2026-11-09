# ProfMailer — Setup Guide

## What this app does

Enter only a **professor's name** and **university**. The app automatically:

1. Finds their official faculty profile using Gemini + Google Search
2. Verifies their publications from Scholar, DBLP, ResearchGate, etc.
3. Identifies current research projects and lab activity
4. Discovers their email address from official sources (never guessed)
5. Personalizes your email template with verified facts only
6. Validates every factual claim in the email before showing it
7. Sends or schedules the email via your Gmail account automatically

---

## Step 1 — Add API keys

```
copy .env.local.example .env.local
```

Open `.env.local` and fill in:

```env
GEMINI_API_KEY=your_key_here
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/gmail/callback
APP_SECRET=any_random_string
```

**Get Gemini API key:** https://aistudio.google.com/app/apikey

---

## Step 2 — Set up Gmail OAuth

1. Go to https://console.cloud.google.com/
2. Create/select a project → Enable the **Gmail API**
3. APIs & Services → Credentials → **Create OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:3000/api/auth/gmail/callback`
4. Copy Client ID and Secret into `.env.local`
5. OAuth consent screen → add your Gmail as a **Test user**

---

## Step 3 — Run

```
npm run dev
```

Open **http://localhost:3000**

---

## Step 4 — Connect Gmail

Go to **Profile** → **Connect Gmail Account** → authorize → redirects back automatically.

---

## How to use

1. Enter professor name + university on the home page
2. Click **Research Professor & Prepare Email**
3. Watch the 7-stage progress tracker (takes 30–90 seconds)
4. Review the email, verification evidence, and sources
5. Click **Approve & Send Now** or **Approve & Schedule**
6. Done — close your browser, the backend handles the rest

---

## What it will NEVER do

- Guess email addresses from naming patterns
- Invent publication titles or research topics
- Claim the professor accepts students without explicit evidence
- Invent your qualifications
- Send without your explicit approval
- Modify the approved email after approval

---

## Status lifecycle

| Status | Meaning |
|--------|---------|
| `researching` | Pipeline running (stages 1–7) |
| `needs_clarification` | Professor identity ambiguous |
| `awaiting_approval` | Ready for your review |
| `sending` | Being submitted to Gmail now |
| `sent` | Gmail confirmed |
| `approved_scheduled` | Queued, will send automatically |
| `failed` | Send failed after 3 retries |
| `cancelled` | Cancelled by user |

---

## File structure

```
app/
  page.js                    Dashboard (2-field form + progress tracker)
  campaign/[id]/page.js      Review page (email + evidence + approve)
  history/page.js            All campaigns
  profile/page.js            Your profile + Gmail connection
  api/
    campaigns/route.js       POST: start research pipeline
    campaigns/[id]/route.js  GET: poll campaign status
    campaigns/[id]/approve/  POST: approve + send/schedule
    campaigns/[id]/cancel/   POST: cancel campaign
    parse-schedule/route.js  POST: natural-language schedule parser
    auth/gmail/              Gmail OAuth redirect
    auth/gmail/callback/     OAuth token exchange
    auth/status/             Gmail connection check
    profile/                 User profile CRUD

lib/
  db.js         SQLite via sql.js (pure JS, no build needed)
  research.js   Gemini 2.0 Flash + Google Search grounding
  gmail.js      Gmail OAuth2 + email sending
  scheduler.js  node-cron persistent job runner

data/
  app.db        Auto-created SQLite database
```

---

## Troubleshooting

**"Gmail not connected"** → Profile → Connect Gmail Account

**"Could not identify professor"** → Add department/research area in Additional Instructions

**Research takes long** → Normal. Each step calls Gemini with Google Search (30–90s total)

**Scheduled emails not sending** → The Node.js server must be running. Scheduler checks every 60s and picks up missed jobs on restart.

**"API key should be set"** → Check `.env.local` has `GEMINI_API_KEY=` set correctly and restart the dev server
