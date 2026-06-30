# Design decisions

This document records the significant engineering decisions behind the ED Tracker ↔ Patient Data Centre system, and the trade-offs behind each. The goal is to make the reasoning explicit — most of these were choices between defensible alternatives, not obvious answers.

> The system is a portfolio/demo built on **synthetic data only**. Several decisions below are deliberately scoped for that context; where a production system would differ, it's called out.

---

## 1. One shared backend, not duplicated data

**Decision.** Both apps — ED Tracker (React/Vercel) and the Patient Data Centre (single-file HTML) — read and write a single shared Supabase (Postgres) project.

**Alternatives considered.** Each app keeping its own store and syncing via exported files or an intermediate API.

**Why.** Two genuinely separate apps can only share live patient state through a common datastore. A real hosted database is the only thing that lets a patient created in one app appear in the other without a manual hand-off. This is what makes the project a *connected system* rather than two isolated demos.

---

## 2. Publish-on-transfer, not continuous sync

**Decision.** ED Tracker keeps its own fast local board (`localStorage`) and is **not** continuously mirrored to the shared database. At the moment of admission, it publishes the patient and their full ED record into the shared tables — a single, discrete event.

**Alternatives considered.** Continuously syncing ED Tracker's entire board into Supabase so both apps share all state at all times.

**Why.** This mirrors a real HL7 **ADT^A02** (transfer) event: the ED works its own board and the ward system only receives the patient at the point of transfer. It's also far lower-risk — the change is purely additive and touches none of ED Tracker's existing state logic — and it avoids forcing ED Tracker's richer model (triage, tasks, arrival timers) into the ward's leaner schema. Continuous sync would have meant a large, fragile async rewrite for no clinical benefit.

---

## 3. Authenticated shared access, not per-row ownership

**Decision.** Row Level Security allows any **authenticated** user full access to the shared tables. Access is gated on *being logged in*, not on *owning the row*.

**Alternatives considered.** Per-user/per-row RLS, where each clinician only sees records they created.

**Why.** A ward record is not private to one clinician — every clinician on the ward needs to see every patient on it. Per-row ownership is the wrong model for this domain; it would hide patients from the team caring for them. Who did what is preserved separately as clinical signing data (name + role on each entry), which is the correct place for that information. Finer-grained, role-based policies (e.g. only certain roles can delete) are a reasonable next step, but per-row isolation is not.

---

## 4. Runtime session, not a service-role proxy

**Decision.** ED Tracker writes to the shared database under a **short-lived Supabase session**, obtained when the clinician signs in at runtime. No password or privileged key is stored in the code or shipped in the bundle.

**Alternatives considered.** Moving the write behind a server function (Vercel API route or Supabase Edge Function) that holds the **service-role key** server-side.

**Why.** The service-role pattern sounds more secure but is circular here: a server function holding the service-role key becomes a public endpoint that can write to the database, so it must verify *who* is calling — and the only way to do that from a browser is for the browser to hold a real session and send its token. Once the browser is authenticated, it can write directly and RLS guards it; the function adds no security and an extra moving part. Service-role-behind-a-proxy is the right tool for *privileged admin operations*, not routine writes. The chosen approach is the idiomatic Supabase pattern: **clients authenticate, RLS authorises.** Its defining property — *no long-lived credentials in the client* — is exactly what a reviewer checks for.

> An earlier iteration stored a "ward system" account in `.env.local`, which Vite inlines into the client bundle. That was acceptable for a demo but shipped a password to the browser; the runtime-session approach removed it.

---

## 5. Identity keyed on the hospital number — with a known gap

**Decision.** Patient identity across the bridge is keyed on the **hospital number** (e.g. `H123456`), used as a stable, idempotent key (`pt_ed_<hospital-number>`) so re-sending a patient updates their record rather than duplicating it.

**Known limitation.** ED Tracker does not capture an **NHS number**, so the ward record's `nhs_number` is left blank. Patient-identity matching is *the* hard problem in health interoperability; keying on a local hospital number works within this system but would not safely match a patient across organisations.

**Next step.** Capture an NHS number in ED Tracker and key the ward identity on it, so the same patient seen twice merges into one record. This is the most clinically meaningful improvement available.

---

## 6. Staged, reversible Row Level Security rollout

**Decision.** RLS was switched on in a deliberate order: build real authentication into both apps first (with RLS still off, so nothing broke), then add the access policies, then enable RLS last — with a one-command rollback kept ready.

**Alternatives considered.** Enabling RLS up front.

**Why.** Enabling RLS denies all access by default until a policy permits it. Turning it on before both apps could authenticate would have instantly broken a working system. Sequencing the change so the apps were always functional, and making the final switch instantly reversible, meant the hardening step carried no risk of a dead end.

---

## 7. Realtime by reload-and-re-render, not per-row merging

**Decision.** When a realtime change arrives, the Patient Data Centre reloads all data and re-renders the current screen, preserving the open patient and active tab.

**Alternatives considered.** Surgically merging each individual insert/update/delete into the in-memory cache.

**Why.** For this data volume, a full reload is simpler and guarantees consistency, with none of the bugs that per-row merge logic invites (ordering, partial payloads, mapper drift). Preserving the current view means the live update never interrupts what the user is looking at — and entry/form screens are deliberately left untouched so an update can't disrupt data entry.

---

## 8. Imaging modelled as a *request*, not a result

**Decision.** When ED imaging is ordered, the ward receives an imaging study in the **"requested"** state — no image, no report — rather than a completed study.

**Why.** Ticking "imaging" in the ED is *ordering* the test; the picture and report come later. Showing a completed image (especially the synthetic demo CXR, which carries a different patient's name) would misrepresent the clinical state. "Imaging requested in ED" is the honest, accurate state to hand to the ward. A radiologist reporting it later — flipping the study to "final" with a conclusion — is a natural future extension.

---

## 9. Text IDs, not UUIDs

**Decision.** The shared tables use **text** primary keys (e.g. `pt_ed_H123456`, `ent_ednews_…`) generated by the apps, not database UUIDs.

**Why.** The apps generate stable, meaningful IDs derived from source identifiers, which makes every write an idempotent `upsert` — re-sending a patient updates their existing rows instead of creating duplicates. (An early schema used UUID columns; the app's text IDs failed to insert against them, which is why the schema was moved to text keys.)

---

## 10. Scope boundaries held deliberately

- **Synthetic data only.** RLS on a free-tier project does not meet NHS information-governance requirements (DSPT / DPIA / Caldicott). The security work makes the demo *safer to share*, not *safe for real data*.
- **FHIR is illustrative.** The `DiagnosticReport` / `Observation` / `ImagingStudy` resources are generated client-side to show how the data maps to interoperability standards — they are not served from a conformant FHIR server.
- **Clinical signing ≠ database auth.** Who wrote a note (name, role) is domain data carried in each entry; whether you may touch the database is access control. These are kept as separate concerns, which is why ED Tracker keeps its own clinician login *and* a ward database session.

---

## Summary of trade-off philosophy

The recurring theme is **choosing the simplest design that is correct for the domain**, and being explicit about where the demo stops short of production. The harder problems in health-tech systems — patient identity, transfer events, shared access control, secret handling — were treated as first-class, and the limitations (NHS-number matching, role-based policies, FHIR conformance, governance) are documented rather than hidden.