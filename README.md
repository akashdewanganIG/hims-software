# HIMS Simulation — hospital information management simulation

A working simulation of a hospital information management system: 16 connected
modules over one shared patient/staff/encounter model, role-based access that
administrators manage from the app, and 30 days of realistic, fully linked
hospital activity.

It is a prototype for demonstration — fictional data, no passwords, no external
integrations — but every screen reads and writes the same records, every
change goes through the hospital's business rules, and with a database
configured every signed-in user works on the same hospital.

**Modules:** Enquiry · OPD · IPD · EHR / EMR · Pharmacy · Lab Services · Bed
Management · Operations · WFM (staff & roster) · Billing · MRD · Complaints ·
Feedback · Hospital Performance · Dashboard · Administration (User management).
**Guide:** Architecture & Flows — the module map and workflows, cut to each
login's access.

## Quick start

The app runs in one of two data modes, chosen by the server:

| Mode         | When                   | Where the hospital lives                                                                             |
| ------------ | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| **Database** | `DATABASE_URL` is set  | PostgreSQL through Drizzle ORM — Neon when hosted. Shared by every browser; validated on the server. |
| **Browser**  | no database configured | This browser (IndexedDB). Each visitor gets a private sandbox. Nothing to install.                   |

### Database mode — local PostgreSQL

```bash
npm install
cp .env.example .env
npm run db:setup     # start PostgreSQL on :5433, apply migrations, seed the hospital
npm run dev          # http://localhost:3002
```

`npm run db:up` uses `docker compose` (PostgreSQL 15 on port 5433) when Docker
is running; without Docker it creates a project-local cluster in `.pgdata/`
with your installed PostgreSQL binaries (15+). An existing PostgreSQL on 5432
is left alone. `npm run doctor` checks the setup and says what is missing.

### Database mode — Neon

1. Create a Neon project and copy two connection strings from **Connect**:
   the **pooled** one (host contains `-pooler`) and the **direct** one.
2. In `.env`: `DATABASE_URL` = pooled and `DIRECT_URL` = direct.
3. `npm run db:migrate && npm run db:seed`, then `npm run dev` (or deploy).

After pulling a change that adds a migration (such as `0001_uploaded_files`),
run `npm run db:migrate` against the database before starting the app. When
the change also raises the data version, the server replays the hospital on
first use.

The app reaches `*.neon.tech` hosts with Neon's serverless driver over
WebSockets and any other PostgreSQL with node-postgres over TCP — the same
Drizzle queries and interactive transactions either way. Migrations always use
the direct connection.

### Browser mode (no setup)

```bash
npm install
npm run dev          # http://localhost:3002 — without a .env
```

On first visit the browser replays 30 days of hospital activity (a few seconds,
in a background worker) and keeps it in IndexedDB.

### Using the app

- **Sign in:** choose a role, then one of its logins. Roles, logins and
  permissions come from Administration → User management, so an
  administrator's change shows on the sign-in screen at once. A preview shows
  what the chosen role can open and do, and where it lands. In database mode
  the choice becomes a signed, httpOnly session cookie.
- **Switch role:** profile menu → _Switch role_, or `⌘K` → "Switch role".
- **Search anything:** `⌘K` / `Ctrl K`, or the search field at the top of the
  sidebar — patient name, UHID, mobile, or APT / ADM / INV / ENQ / LAB numbers
  (limited to the modules your access covers).
- **Simulation menu** (activity icon in the header): where the data lives, the
  cross-module integrity check, and _Reset simulation_ for an Administrator
  (in database mode only while developing).

The hospital stays current: data from an earlier day is replayed fresh when
nobody has changed it, otherwise every timestamp moves forward by whole days so
today's queues, rosters and trends stay live. In database mode other users'
changes — including changes to their own access — appear within seconds.

## Roles, users and permissions

Access is data, not code. A **role** (table `roles`) grants **modules** (which
pages a login can open) and **actions** (which buttons it gets); a **login**
(table `users`) belongs to one staff member and has one role, or — for one
person — **custom access** that replaces the role's permissions. Granting an
action also opens its module, and every login keeps its dashboard.

Nine roles are seeded (Administrator, Receptionist, Doctor, Nurse, Pharmacist,
Lab Technician, Billing Executive, MRD Staff, Operations Manager), plus one the
hospital "created" (Ward In-charge), a pharmacist with custom access (pharmacy
plus the payment counter) and one disabled login, so User management has real
cases to show.

**Administration → User management** (`/admin/users`, action `users.manage`):

- **Users** — every login with its staff record, role, effective access and
  status; create a login for staff without one (a login ID and the job's
  default role are suggested), change role, login ID, status or custom access,
  delete a login (the staff record and its history stay).
- **Roles & permissions** — create, edit, duplicate, restore defaults and
  delete roles in a module-by-module permissions editor with warnings on
  sensitive actions, and the landing page members see after signing in.
- **Audit log** — every access change, who made it and when.

Safeguards, enforced on the server: there is always an active Administrator
(nobody can disable, demote or delete the last one — not from WFM either);
nobody can disable or delete their own login or remove their own access to
User management; the Administrator role always has full access and cannot be
renamed or deleted; a role in use cannot be deleted. Disabled logins cannot
sign in and are signed out on their next request.

Where the checks live: `lib/rbac.ts` (modules, actions, defaults, resolution),
`lib/domain/admin.ts` (the rules), `lib/ops/execute.ts` and
`lib/views/execute.ts` (every operation and view is checked against the
login's resolved access), `lib/views/system.ts` (sign-in directory, session).

**Each login sees only its own information:** the sidebar, pages and buttons
follow its access; the dashboard's figures, work queues and alerts are built
on the server for its modules and actions only (a nurse gets no takings, a lab
technician gets the worklist); search covers only modules it can open; the
Architecture & Flows guide shows only its modules and the workflows it takes
part in.

## Workflows

Modelled on what Indian hospital systems such as MocDoc, MediXcel, SoftClinic
GenX, Healthray and Insta by Practo do in the same modules:

- **Front office:** enquiries with follow-ups converted into bookings;
  roster-based appointment slots; walk-in registration with UHID; check-in
  with tokens; a waiting-area **token display** (`/opd/display`, token numbers
  only).
- **OPD:** triage vitals, consultation with diagnoses, allergy-checked
  e-prescriptions and lab orders, **printable prescription** (`Print Rx`),
  visit closure filing the case sheet. **Consultation validity:** a review with
  the same doctor within 7 days of a paid consultation is free; other
  follow-ups are charged at half the fee.
- **IPD:** admission to beds the ward rules allow, IP advance deposits,
  rounds and nursing notes, care orders, transfers, then discharge as a
  checklist — discharge initiated → summary finalised → **billing clearance**
  (the billing desk settles the final bill including today's room charges, or
  records who approved leaving with dues) → discharge, bed to cleaning, final
  bill, case file to MRD. Discharge stays locked until billing clears it.
- **Pharmacy:** first-expiry-first-out dispensing (partial allowed), returns
  credited to the bill, **counter (OTC) sales** on a bill of their own with
  Schedule H medicines refused, **goods receipts (GRN)** against a supplier and
  invoice number, write-offs, reorder alerts.
- **Lab:** sample IDs, results with reference ranges and critical flags,
  second-person verification, **printable lab report**.
- **Billing:** charges post themselves from every module; payments by method,
  discounts, refunds, and the **day-end collection** report by payment
  method, source and cashier, with a printable closing.
- **Records, photos and documents:** patient and staff photos (shown on the
  patient banner, the staff profile and — your own — the account menu);
  scanned documents (PDF or image) uploaded to the patient record or a case
  file, viewed in the browser, downloaded, retitled and removed (generated
  documents and reviewed case files are locked); photos attached to
  complaints as evidence. Images are reduced in the
  browser before upload; the server checks type, size (5 MB) and content.
- **Corrections:** a registration made in error is deleted (only while the
  patient has no history; the UHID is never reused), and an edit cannot turn
  one patient into a duplicate of another; complaint, staff and document
  details can be edited, a mistyped bill charge removed while the bill is
  open, a pending prescription cancelled, and formulary items added, edited
  and removed (only while never stocked or prescribed).
- **PDF downloads:** the patient record, prescription, lab report, discharge
  summary, bill, day-end collection report, MRD case file (completeness,
  documents, custody trail) and complaint record (with its photos) download
  as structured A4 PDFs from their own screens — letterhead with the logo
  placeholder, sections, tables that break cleanly across pages (headings
  never end a page, the signature never stands alone), signatures and page
  numbers.
- **MRD, beds, complaints, feedback, WFM, operations, analytics** as before:
  completeness checklists and archiving, housekeeping turnaround, SLA-tracked
  complaints, feedback follow-ups, rosters that drive OPD slots and on-duty
  counts, the live command centre and 7–30-day trends.

## A ten-minute demo

| As                | Do                                                                                                  | Shows                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Receptionist      | OPD → **Walk-in** (or Enquiry → open one → **Book appointment**)                                    | Token issued, OPD visit opened, consultation bill raised; enquiry linked to the appointment            |
| Nurse             | OPD → _Waiting_ → **Record vitals**; open **Token display**                                         | Vitals on the visit and in the patient record; the waiting-area screen                                 |
| Doctor            | OPD → **Start consultation** → diagnosis, **Prescribe**, **Order tests** → **Print Rx** → **Close** | Rx in the pharmacy queue, tests in the lab worklist, charges on the bill, case sheet in MRD            |
| Pharmacist        | Pharmacy → **Dispense**; **Counter sale**; Inventory → **Receive stock**                            | FEFO draw onto the bill; an OTC bill paid at the counter; a GRN with supplier invoice                  |
| Lab Technician    | Lab → collect → process → enter results → **Verify & release** → **Print report**                   | Abnormal/critical flags; report in the EHR and on the visit                                            |
| Billing Executive | Billing → open the bill → **Collect**; Billing → **Day-end collection** → **Print closing**         | One bill for consultation, lab and pharmacy; the day's takings by method, source and cashier           |
| Doctor → Billing  | Admission → **Initiate discharge** → summary; then as Billing: checklist → **Clear billing**        | Discharge locked until clearance; then bed to cleaning, final bill, discharge summary with MRD         |
| Administrator     | Administration → **User management** → **New role** / **New login**; then sign in as it             | The new role on the sign-in screen, its landing page, "No access" everywhere else                      |
| Receptionist      | Patient record → camera badge → **Save photo**; **Upload document**; **Download record**            | The photo across the record; the scan in Documents (view, download, retitle, remove); a multi-page PDF |
| Any role          | Guide → **Architecture & Flows**                                                                    | The module map and workflows for that role only; administrators also see the system layers             |

## Architecture

One Next.js 16 app (App Router, React 19, TypeScript, Tailwind 4) — a modular
monolith. The API lives in the same app (`app/api`), so there is nothing to
host separately.

```
app/                 pages, one folder per module (+ /login, /admin, /architecture, print views)
app/api/             route handlers: config, health, session, views, ops, sync, admin
components/          design system (ported from Ralli Wolf @repo/ui), shell, shared UI
features/<module>/   views.ts (pure read models) · api.ts (hooks) · dialogs
lib/domain/          domain services — the hospital's business rules (incl. admin.ts)
lib/ops/             operation registry: every write, with permissions and input schemas
lib/views/           view registry: every read, with module access and parameters
lib/rbac.ts          modules, actions, default roles, access resolution
lib/architecture.ts  the map behind Architecture & Flows (modules, hand-offs, workflows)
lib/sim/             schema, seed replay, transactions, integrity rules, browser store
lib/server/          engine, persistence, sessions, env; db/ = Drizzle schema, client, migrations
drizzle/             SQL migrations generated by drizzle-kit (foreign keys made deferrable)
scripts/             database tooling, doctor, verifiers, end-to-end journeys
tests/               operation, access, view, integrity, journal, schema, map and database tests
```

**Data model.** `lib/sim/schema.ts` defines 39 relational tables (patients,
staff, roles, users, departments, enquiries, appointments, encounters,
admissions, wards, rooms, beds, bed assignments, prescriptions and items,
medicines and batches, pharmacy transactions, lab orders/items/results,
invoices/items/payments, medical records, documents, complaints, feedback,
shifts, roster, activity, uploaded files). `lib/server/db/schema.ts` mirrors
it in Drizzle table for table with real foreign keys (102), unique natural
keys, enums for every controlled value, `DATE` columns for calendar dates and
`NUMERIC(12,2)` for money. Values that can be derived — invoice totals, bed
occupancy, stock on hand, MRD completeness, "on duty now" — are always
computed, never stored.

**Writes** are named operations (`lib/ops/registry.ts`, 93 of them). Each one
declares the actions that may run it, a zod schema for its input (unknown keys
are stripped) and the domain service call. `prepareOperation` resolves the
signed-in login, its role and its access, checks the action, validates the
input and runs the service inside a transaction (`lib/sim/journal.ts`) that
records every write: if any rule refuses, nothing changes.

**Reads** are named views (`lib/views/registry.ts`, 53 of them): pure
functions of the database, the clock, validated parameters and the signed-in
actor. Each declares the modules that may open it — the same access that gates
navigation — so a login cannot read what its screens would not show.

**Database mode.** PostgreSQL is the system of record. The server engine
(`lib/server/engine.ts`) keeps the committed data in memory so views and domain
services run exactly as in the browser, and never holds anything PostgreSQL has
not committed: an operation runs, its changed rows are captured and rolled
back, then committed together with a version bump and an entry in the
`change_log` (the audit trail of every operation) in one Drizzle transaction,
and only then applied to the working copy. Foreign keys are
`DEFERRABLE INITIALLY DEFERRED` (drizzle-kit has no syntax for it, so
`npm run db:generate` post-processes each migration), so one operation can
insert rows that point at each other. Several server processes can share the
database: each replays the change log of the others before every operation,
and a version conflict re-runs the operation on fresh data. Browsers poll
`/api/sync/version` and refetch what they show — and their session's access —
when the version moves.

**Browser mode** runs the very same registries against IndexedDB, so both modes
enforce identical rules.

**Seed data** is not written table by table: `lib/sim/seed.ts` replays 30 days
of bookings, check-ins, consultations, lab work, dispensing and counter sales,
payments, admissions, transfers, billing clearances, discharges, enquiries,
complaints and feedback on an event clock _through the same domain services_,
stopping at "now". Bed management keeps about 15% of each general ward free
for emergencies. The server seeds an empty database on first use;
`npm run db:seed` does it ahead of time.

**Time.** "Today", clinic hours and rosters follow the hospital's time zone
(`Asia/Kolkata`); the server process and CLI tools pin it consistently.

### Reuse from Ralli Wolf

Taken from the sibling `ralli-wolf` repository and kept consistent with it:

- **Database conventions:** PostgreSQL 15 in `docker-compose.yml` on port 5433,
  one database client per process, `DATABASE_URL` plus a direct URL for
  migrations, snake_case columns, committed migrations, a sectioned
  `.env.example`, and the same two-key guard for destructive commands
  (`ALLOW_DESTRUCTIVE_SEED` + `DESTRUCTIVE_DATABASE_CONFIRM`). The ORM is
  Drizzle and the hosted database Neon.
- **Access patterns:** permission groups with hints, a permissions editor, user
  management with a protected administrator, and an Architecture & User Flow
  page filtered by permission — rebuilt for hospital modules and workflows.
- **UI:** the `@repo/ui` token system and `globals.css` (only the brand ramp
  differs: a clinical teal, so "primary" never competes with the red that
  marks abnormal results), its components and app patterns (sidebar + header,
  ⌘K palette, sonner toasts, page primitives, Phosphor duotone icons, Inter +
  Plus Jakarta Sans + Geist Mono, React Query, zod).

The app uses the light theme only. The logo slot on the sidebar, the sign-in
screen, the token display and printed documents is a "Your logo here"
placeholder — replace `components/layout/logo-placeholder.tsx` to brand them
all at once.

## Commands

| Command                                   | Does                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`         | Next.js on port 3002                                                                                        |
| `npm run doctor`                          | Checks Node, dependencies, `.env`, the database driver, PostgreSQL, migrations and seed                     |
| `npm run db:up` / `db:down` / `db:status` | Local PostgreSQL on :5433 (Docker, or your installed binaries)                                              |
| `npm run db:setup`                        | `db:up` + `db:migrate` + `db:seed` — a working local database in one step                                   |
| `npm run db:migrate`                      | Applies pending migrations over the direct connection (creates a missing local database)                    |
| `npm run db:generate -- --name <change>`  | After editing `lib/server/db/schema.ts`: writes the migration (foreign keys made deferrable)                |
| `npm run db:check`                        | `drizzle-kit check` — migration snapshots are consistent                                                    |
| `npm run db:seed`                         | Seeds an empty database (`-- --force` replaces existing data; guarded)                                      |
| `npm run db:reset`                        | Drops the schema, re-migrates and reseeds (guarded, see `.env.example`); also rebuilds a Prisma-era DB      |
| `npm run db:verify`                       | Migrations applied, foreign keys deferrable, change log contiguous, stored data passes every integrity rule |
| `npm run db:studio`                       | Drizzle Studio                                                                                              |
| `npm run db:proxy`                        | Local WebSocket proxy so the Neon driver can reach a local PostgreSQL (development and tests)               |
| `npm run check`                           | Types, lint, formatting, tests and the simulation verifier                                                  |

## Tests and checks

```bash
npm run check-types      # TypeScript
npm run lint             # ESLint (Ralli Wolf preset)
npm test                 # 69 tests, no database needed
npm run test:db          # 12 tests against PostgreSQL with node-postgres (uses <database>_test)
npm run test:db:neon     # the same 12 through Neon's serverless driver, via a local proxy
npm run verify:sim       # seed a fresh hospital and check every integrity rule
npm run build            # production build
npm run e2e              # UI journeys (app must be running)
```

- **Operations** (`tests/operations.test.ts`): every registered operation runs
  successfully in module journeys (OPD, consultation validity, appointments,
  enquiry, IPD with billing clearance, billing, pharmacy stock and counter
  sales, beds, complaints and feedback, workforce, user management, photos,
  documents and corrections), every
  domain rule that must refuse does so — and leaves the data byte-for-byte
  unchanged — and every journey ends with all integrity rules holding. Each
  operation's change set is replayed onto a shadow copy that must equal the
  database.
- **Access** (`tests/access.test.ts`): every operation and view × every
  default role against its stored permissions; custom access, custom roles and
  disabled logins; a permission removed from a role is refused at once; every
  view a page reads is open to every role that can open the page.
- **Views, integrity, journal, schema, map**: every view returns plain JSON and
  each dashboard carries only its login's areas; the sign-in directory mirrors
  User management; the integrity checker catches 24 kinds of injected
  corruption; the transaction journal rolls back and reports changes exactly;
  the Drizzle schema matches the application model column for column, key for
  key, and every migration's foreign keys are deferrable; the architecture map
  uses real routes, modules, actions and steps.
- **PDFs** (`tests/pdf.test.ts`): all eight downloadable records are built
  from the same views the screens read and rendered by pdfmake's Node build;
  a long patient record breaks across pages and carries its photo.
- **Database** (`tests/db/server.test.ts`): the test database is rebuilt from
  the migrations on every run; seeding, round trip, atomic commits and the
  change log, refusals, catching up with another server process, a commit
  PostgreSQL rejects, restart, reset, day re-anchoring, and the HTTP routes
  (session cookie, same-origin check, 401/403/400/404 answers) — with each
  driver.
- **End-to-end** (`scripts/e2e`): sign in as each default role (through the
  sign-in screen) and open every page, with the API's own 403s probed; the OPD
  journey (register → walk-in → vitals → consult → prescribe → labs → close
  and download the prescription → dispense → verify → pay → EHR → integrity);
  the IPD journey (register → admit → note → transfer → summary → billing
  clearance → discharge and download the summary → beds to cleaning → final
  bill); the access journey (create a role and a login →
  sign in on it → refused elsewhere → disable it → gone from sign-in → counter
  sale → day-end collection → token display → a nurse's architecture map →
  printed prescription and lab report); and the records journey (register with
  a photo → upload, view, retitle and remove a document → replace and remove
  the photo → download the record → delete a registration made in error →
  edit your own staff record and photo, shown in the header → correct a
  complaint, attach and remove a photo, download it → download a case file →
  remove a charge and download the bill → add, edit and remove a formulary
  item). Each run creates its own records, so
  it works against a persistent database. Needs a local Chrome or Edge
  (`E2E_BROWSER`, `E2E_BASE_URL`, `E2E_SHOTS` to override).

CI (`.github/workflows/ci.yml`) runs the checks and a migration-drift check,
the database job (migrations, seed, `db:verify`, `test:db` with both drivers)
and the end-to-end journeys against a production build with PostgreSQL.

## Configuration

See `.env.example`. The persistent keys are `DATABASE_URL` (pooled on Neon),
`DIRECT_URL` (direct, for migrations), and `SESSION_SECRET` (required in
production). Data mode, database driver, and hospital timezone are derived.
Destructive database commands require two one-shot confirmation variables shown
in `.env.example`; do not store those confirmations in `.env`.

`GET /api/health` reports the mode, the driver, database reachability, applied
and pending migrations and the data version — 200 when the app can serve, 503
when its database cannot be used.

**Upgrading a database built by the earlier Prisma version:** its tables are
not tracked by the Drizzle migrations. `npm run db:migrate`, `db:verify`,
`doctor` and `/api/health` say so; rebuild it with `npm run db:reset` (guarded
— the simulation data is replayed fresh).

## Scope and limits

- Simulation only: fictional people and organisations, no passwords (pick a
  login), no payment gateway, analyser, PACS, ABDM, HL7 or FHIR integration.
- Deliberately out of scope (per the brief): Emergency, OT, ICU, Blood Bank,
  CSSD, Insurance/TPA processing, Procurement, Finance ERP, HRMS/Payroll,
  patient app, telemedicine, AI features. Small supporting pieces exist only
  where a module needs them (inpatient notes and care orders for IPD,
  approved dues at billing clearance, procedure charges on the bill).
- Uploaded files are stored in the database (`files`, base64), up to 5 MB
  each — enough for photos and scanned pages, not for imaging studies.
- In database mode the server keeps the hospital in memory (tens of MB) next
  to PostgreSQL; that suits a hospital of this size, not a national registry.
