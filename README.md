# ED Tracker

A live emergency-department tracking board with AI-assisted clerking, signed clinical entries, and a real **admit-to-ward handover** into a shared clinical record.

> ⚠️ **Synthetic data only.** This is a portfolio/demo project, not a medical device, and is not for real patient data.

---

## What it does

- **ED board** — patients with triage category (Red/Amber/Green), live time-in-department timers, and department stats.
- **NEWS2** — structured observation entry with live score, risk banding, and a trend chart (Scale 1 / Scale 2).
- **Structured bloods** — FBC, U&Es, LFTs, inflammatory markers, other markers, and blood gas, with separate sample/results timestamps.
- **Signed entries** — notes, NEWS, and bloods are committed via a password re-confirmation step and stamped with the clinician's name and role.
- **AI assist (Claude)** — auto-fill observations and presenting complaint from a free-text clerking, and generate a discharge summary.
- **Admit to ward** — publishes the patient and their full ED record into a shared **Patient Data Centre** (the ward record). This simulates an HL7 **ADT^A02** transfer.

## Ward integration (shared backend)

ED Tracker and the Patient Data Centre are two separate apps that share **one Supabase (Postgres) project**.

- ED Tracker keeps its own fast local board (`localStorage`). It is not continuously synced.
- At the moment of transfer, `src/lib/wardDb.js` publishes the patient into the shared `patients`, `entries`, `labs`, and `imaging` tables:
  - notes → timeline notes
  - NEWS history → NEWS entries
  - bloods → lab panels
  - imaging request → a "requested" imaging study
  - plus an ED → ward transfer event (which drives the ward's Journey/time-in-ED view)
- **Realtime** — the ward record updates live (no refresh) when a patient is admitted.
- **Auth + Row Level Security** — the shared tables have RLS enabled; only an authenticated session can read or write. ED Tracker signs in as a "ward system" account before publishing.

## Tech stack

React 19 · Vite · Supabase (Postgres, Auth, Realtime) · Anthropic API (Claude) · jsPDF

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env.local` file in the project root (this file is gitignored — never commit it):
   ```bash
   # Ward database sign-in (a Supabase Auth user — create one in the
   # Supabase dashboard with "Auto Confirm User" ticked)
   VITE_WARD_EMAIL=clinician@ward.local
   VITE_WARD_PASSWORD=your-password
   ```
   The AI features call the serverless functions in `api/`, which require an Anthropic API key set as an environment variable in your deployment (see the `api/*.js` files for the exact name they expect).
3. Run the dev server:
   ```bash
   npm run dev
   ```

The Supabase project URL and **publishable** key are set in `src/lib/wardDb.js`. The publishable key is safe to expose in client code by design; the secret key is never used here.

## Security & governance notes

- **Synthetic data only.** RLS on a free-tier Supabase project does not meet NHS information-governance requirements (DSPT / DPIA / Caldicott) for real patient data.
- The ward-system password is read from a `VITE_` variable, which Vite **inlines into the client bundle** — so on a deployed site it is visible in the shipped JavaScript. This is acceptable for a synthetic demo. In production the privileged write would move behind a server function (e.g. a Supabase Edge Function) so the credential never reaches the browser.
- Access control is "any authenticated clinician can access the shared ward record," which is the correct model for a shared ward. Finer-grained, role-based policies would be the next step toward production.

## Project structure

```
src/
  App.jsx              Central state and handlers
  components/          UI (PatientDetail, AddPatientModal, BloodsModal,
                       NewsChart, NotesHistory, BloodsHistory, ...)
  lib/
    auth.js            In-app clinician login / signing identity
    llm.js             Calls to the AI serverless functions
    news.js            NEWS2 scoring
    time.js            Time helpers
    wardDb.js          The ward bridge (Supabase client + sendPatientToWard)
api/                   Serverless functions for the Claude calls
```