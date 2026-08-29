# Family Coordination Dashboard Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task, with strict RED → GREEN → REFACTOR cycles and one useful commit after each task.

**Goal:** Turn the existing single-child home dashboard into a family coordination surface with a handoff board, immutable permission queue, adult duty ledger, hold-to-record voice-note drop, full-screen launch sequence, and a consistent touch-first visual system.

**Architecture:** Keep the current React/Vite + Fastify/SQLite monorepo and add bounded feature modules with shared Zod contracts. Family state remains local-first in SQLite; writes emit the existing SSE domain events so every open dashboard updates immediately. Derived behavior—schedule conflicts, standing permission rules, duty streaks, and active launch runs—lives in pure, clock-injected domain functions so time-zone and boundary behavior can be tested without waiting for real time.

**Tech Stack:** React 18, Vite, Tailwind v4, Lucide, TanStack Query, Zustand, Fastify 5, `node:sqlite`, Zod, `date-fns` + `@date-fns/tz`, `@fastify/multipart`, Vitest, Testing Library, Playwright, browser `MediaRecorder`, Web Audio, and the existing SSE event hub.

---

## 1. Current Context and Audit

### Existing architecture to preserve

- Web app: `apps/dashboard-web`
- API: `services/api`
- Voice/assistant service: `services/voice`
- Shared contracts: `packages/contracts`
- Design tokens: `packages/design-tokens`
- Existing local persistence: SQLite through `services/api/src/platform/database.ts`
- Existing live refresh: `/api/events` + `eventHub` + `useLiveEvents`
- Existing integrations: local calendar, weather, Spotify, Home Assistant, assistant voice overlay
- Primary deployment: 1920×1080 Chromium kiosk on Linux; 1280×720 is the secondary supported viewport
- Current git branch was clean when this plan was written.

### Measured 1920×1080 layout defects

These are real measurements from the running app, not inferred from source alone.

1. **The overview rail overflows its allocated height.**
   - Main content is 952 px high with 20 px top/bottom padding, leaving 912 px.
   - Right cards render at 394.5 + 335 + 168 px with two 20 px gaps: 937.5 px total.
   - The final panel ends at y=1021.5 while the main region ends at y=1016, so the bottom is clipped by about 5.5 px.
   - **Fix:** replace the natural-height flex rail with explicit `minmax(0, …)` grid tracks, `min-h-0`, `h-full`, and inner overflow rules. The redesigned overview must fit completely at 1920×1080.

2. **Spacing uses multiple unrelated systems.**
   - Main gutter: 24 px horizontal but 20 px vertical.
   - Inter-panel gap: 20 px.
   - `Panel` header: 20 px horizontal, 16 px top, 12 px bottom.
   - `Panel` body: 20 px horizontal/bottom and 4 px top.
   - Other features use 2, 4, 6, 10, 12, 14, 16, 20, and 24 px ad hoc values.
   - **Fix:** use an 8 px layout grid: page gutter 24 px, panel-to-panel gap 24 px, standard panel padding 24 px, compact panel padding 16 px, section spacing 16/24 px, and 8 px icon/text gaps. Allow 4 px only for micro-layout such as a status dot or two-line metadata.

3. **The design-token package is stale and not actually driving the web UI.**
   - `packages/design-tokens/src/tokens.css` still declares Inter, 10–32 px radii, 12 px spacing steps, and old colors.
   - `apps/dashboard-web/src/styles/app.css` separately declares Space Grotesk, 6–8 px visual radii, and the current light/dark space theme.
   - The web app depends on the token package but never imports it.
   - **Fix:** make `packages/design-tokens` the canonical source for non-color primitives (spacing, radii, touch sizes, type scale, motion), import it from `app.css`, and keep only semantic light/dark color variables and space-background rules in `app.css`. Remove the obsolete duplicate theme definitions.

4. **Typography is too fragmented and several labels are undersized.**
   - Current leaf text sizes include 11, 12, 13, 14, 18, and 20 px.
   - Calendar weekday labels, event chips, nav labels, media timestamps, device tags, and forecast times use 11 px.
   - **Fix:** standardize to 12 px metadata, 14 px body, 16 px emphasized body, 20 px section metric, 28/32 px prominent clock/countdown, and 40 px hero metric. Eliminate 11 and 13 px UI text.

5. **Range controls are not touch controls.**
   - Current visual and actual range-input height is 4 px with an 18 px thumb.
   - **Fix:** keep a 6 px visual track but provide a 48 px hit box and 24 px thumb; keyboard and pointer behavior must both remain available.

6. **Panel density and proportions are inconsistent.**
   - Weather is 394.5 px tall, Now Playing is 335 px, and Now & Upcoming is 168 px without an explicit hierarchy.
   - Settings is constrained to `max-w-2xl`, leaving most of a 1920 px kiosk unused.
   - **Fix:** introduce explicit `Panel` density variants and intentional grid tracks. Settings becomes a two-column, max-1280 px layout at 1920 and one column below 1280.

7. **The 720p support claim is not currently true.**
   - At a narrow viewport, the fixed 12-column overview keeps the same rail and hides content below the fixed main viewport.
   - **Fix:** at widths below Tailwind `2xl`, switch Today and Family screens to a two-column/one-column scrollable layout inside `main`; never hide overflow that the user needs to reach.

8. **Calendar chips collapse badly at narrow widths.**
   - At 780 px, the event title measured zero usable width because time and title share one horizontal row.
   - **Fix:** at compact breakpoints hide the inline time or place time above title; use 12 px text and a minimum 24 px chip height. At 1920 the chip may truncate horizontally, but no text may be vertically clipped.

9. **Card and control radii need one definition.**
   - Current source mixes `rounded`, `rounded-md`, `rounded-lg`, and a stale token package with 16–32 px card radii.
   - **Fix:** 8 px panels, 6 px controls, square-ish icon tiles, and pills only for small statuses. No emoji; use Lucide vector icons throughout.

---

## 2. Product Decisions and Assumptions

These remove ambiguity for implementation. They can be changed later without replacing the core data model.

1. **Household shape:** exactly one child is optimized in the UI, with two adult profiles by default: `You`, `Partner`, and `Kid`. Names, colors, and icons are editable.
2. **Local trust model:** this is a shared LAN kiosk, not an authenticated family SaaS app. The active person is selected deliberately in the header and stored per browser. The API still enforces role constraints: only adults may approve/deny permissions, claim adult handoffs, or receive duty credit.
3. **Attribution:** all consequential writes send `actorId`; the server provides the authoritative timestamp. Do not trust a client-supplied approval time.
4. **Calendar scope:** the first release compares events already stored in the dashboard calendar. External Google/CalDAV ingestion is not part of this plan, but calendar ownership fields are designed so an adapter can be added later.
5. **Time:** store timestamps in UTC ISO format and evaluate local-day rules using `DashboardSettings.timezone`. Change the default from hard-coded UTC to the configured local IANA zone during setup. DST behavior must be tested.
6. **Handoff alert time:** an unresolved next-day handoff becomes a visible warning at 18:00 local time the preceding day. It may appear in the board before then, but is not in the alert state yet.
7. **Conflict buffers:** default travel/setup buffer is 15 minutes before a handoff and default overrun buffer is 15 minutes after an adult event. Both are editable settings.
8. **Permission decisions are durable:** an approved/denied request cannot be overwritten. Reopening creates a new audit event, requires an adult and a reason, and preserves the prior decision.
9. **Standing rules are structured, not free-form AI:** category, allowed weekdays, optional time window, active date range, outcome, and priority. If equally ranked matching rules conflict, the request remains pending.
10. **Duty reporting:** no overall “winner.” Show per-duty counts for a selected window (default 30 days) and explicitly mention an adult’s consecutive streak when it reaches three or more.
11. **Voice notes:** audio is the source of truth. A transcript is optional/best-effort metadata captured when browser speech recognition is available; lack of a transcript must never block recording, playback, or replying.
12. **Launch mode:** Launch is a first-class full-screen view. During its configured active window, Today shows a prominent launch tile but does not unexpectedly steal navigation focus. The chime sounds once per run at the configured threshold.
13. **Backup contacts:** the tile displays names and phone numbers and can open a `tel:` action or assign a contact. Automated SMS/calling is explicitly out of scope.
14. **Accessibility:** every action works without hover, touch targets are at least 48×48 px, hold-to-record has pointer-cancel handling, and visual states are not conveyed by color alone.

### Explicit non-goals for this delivery

- Parent accounts, passwords, remote access, or per-user authorization
- Google Calendar/Apple Calendar/CalDAV synchronization
- Automated SMS, calls, or push notifications to backup contacts
- Cloud media storage or long-term voice-note archival policies beyond local retention
- AI-generated permission decisions
- Multi-child roster UI
- Replacing Home Assistant, Spotify, weather, or the assistant overlay

---

## 3. Information Architecture and Screen Layout

### Bottom navigation

Replace the current five tabs with six equally sized touch tabs:

1. **Today** — the new coordination overview
2. **Calendar** — existing full calendar
3. **Family** — full Handoffs + Permissions + Duties workspace
4. **Launch** — full-screen launch sequence
5. **Home** — existing Home Assistant controls
6. **Music** — existing full-screen player

Move Settings to a 48×48 gear button in the header. The settings view can remain a route in Zustand but is not a seventh bottom tab.

### Header

- Keep 64 px height.
- Left: Home mark and compact active-person switcher.
- Center: 32 px clock + 14 px date.
- Right: service status, Settings icon button, Assistant button.
- At widths below 1280, collapse service status text to icons with accessible labels; never shrink the person switcher or action buttons below 48 px.

### Today at 1920×1080

Use a 12-column, two-row grid with 24 px gaps and `minmax(0, 1fr)` rows:

- **Handoff summary:** 5 columns, top row
- **Permission queue:** 4 columns, top row
- **Voice-note drop:** 3 columns, top row; entire tile is intentionally large and simple
- **Launch summary:** 5 columns, bottom row
- **Duty ledger:** 4 columns, bottom row
- **Context rail:** 3 columns, bottom row, with compact weather and compact media blocks using a fixed internal grid

Calendar, Home, and Music remain one tap away rather than competing for overview space. “Now & Upcoming” is replaced on Today by directly actionable family cards; its generic data remains available to the API and can be reused in alerts.

### Family screen

At 1920×1080, three equal-height columns:

- Handoffs, including conflicts and backup contacts
- Permission queue, including pending and recent decisions
- Duty ledger, including quick-log duties and recent history

At widths below 1536, use two columns and allow the Family screen itself to scroll. At widths below 900, one column.

### Launch screen

- Occupies all of `main`; no nested panel chrome.
- Top: child icon/name, launch title, and large departure countdown.
- Center: 2–4 large picture/icon cards per row.
- Bottom: progress, reset/exit controls, and chime status.
- Completed steps remain visible, become grayscale/35% opacity, show a check indicator, and remain tappable to undo.

---

## 4. Shared Domain Model

Create focused contract files rather than one oversized family schema.

### `packages/contracts/src/household.ts`

`HouseholdMember`
- `id: string`
- `displayName: string`
- `role: "adult" | "child"`
- `color: ColorToken`
- `icon: "user" | "user-round" | "baby" | "heart" | "star"`
- `sortOrder: number`
- `active: boolean`
- `createdAt`, `updatedAt`

### Calendar additions in `packages/contracts/src/calendar.ts`

Add optional fields to event and input schemas:
- `ownerId?: string` — whose schedule this event belongs to
- `scheduleKind: "general" | "adult-commitment" | "child-commitment"`
- `requiresHandoff: boolean`

Do not put assignment or conflict state directly on a calendar event; those belong to the handoff module.

### `packages/contracts/src/handoffs.ts`

`HandoffObligation`
- `id`, `eventId`
- `startsAt`, `endsAt`
- `status: "unclaimed" | "claimed" | "backup-requested" | "resolved"`
- `assigneeMemberId?: string`
- `backupContactId?: string`
- `note?: string`
- `updatedBy`, `createdAt`, `updatedAt`

`BackupContact`
- `id`, `name`, `relationship`, `phone`, `priority`, `active`, `notes?`

`HandoffBoardItem` additionally includes:
- calendar event summary
- child member
- current assignee/contact
- `attentionState: "planned" | "night-before" | "urgent" | "resolved"`
- per-adult availability: `available | conflict`, plus conflicting events and buffered intervals
- recommended available adult, if one exists

### `packages/contracts/src/permissions.ts`

`PermissionCategory`: `sleepover | screen-time | ride | purchase | outing | school | other`

`PermissionRequest`
- `id`, `childId`, `category`, `question`
- `occursAt?: string`, `expiresAt?: string`
- `status: "pending" | "approved" | "denied" | "expired"`
- `createdBy`, `createdAt`, `updatedAt`

`PermissionDecision`
- `id`, `requestId`, `outcome: "approved" | "denied" | "reopened"`
- `decidedBy`, `decidedAt`
- `source: "manual" | "standing-rule"`
- `ruleId?: string`, `note?: string`

`PermissionRule`
- `id`, `name`, `category`, `outcome`
- `weekdays: number[]` using 0=Sunday … 6=Saturday
- optional `localStartTime`, `localEndTime`, `activeFrom`, `activeUntil`
- `priority`, `active`, `createdBy`, `createdAt`, `updatedAt`

### `packages/contracts/src/duties.ts`

`DutyDefinition`
- `id`, `name`, `icon`, `color`, `sortOrder`, `active`

`DutyEntry`
- `id`, `dutyId`, `performedBy`, `occurredAt`, `note?`, `createdAt`

`DutySummary`
- selected window start/end
- per-duty counts per adult
- most recent adult
- consecutive streak adult/count
- recent entries

Seed definitions: Bedtime, School run, Dentist booking, Permission slip, Night wake-up.

### `packages/contracts/src/voiceNotes.ts`

`VoiceNote`
- `id`, `senderId`, `recipientId`, `inReplyToId?`
- `audioUrl`, `mimeType`, `durationMs`, `sizeBytes`
- `transcript?`, `createdAt`, `readAt?`

Input metadata limits:
- duration ≤ 60,000 ms
- payload ≤ 8 MiB
- allow `audio/webm`, `audio/ogg`, and `audio/mp4`

### `packages/contracts/src/launch.ts`

`LaunchTemplate`
- `id`, `childId`, `name`, `weekdays`
- `departureLocalTime: "HH:mm"`
- `activeWindowMinutes` default 45
- `chimeBeforeMinutes` default 3
- `active`

`LaunchStep`
- `id`, `templateId`, `label`, `icon`, `sortOrder`, `active`

`LaunchRun`
- `id`, `templateId`, `serviceDate`, `departureAt`
- `status: "active" | "complete" | "expired"`
- `completedStepIds`, `chimePlayedAt?`, `completedAt?`

Seed weekday steps: Shoes, Bag, Snack.

---

## 5. Persistence and Migration Strategy

Refactor the single inline migration into idempotent versioned migrations.

### New tables

- `schema_migrations`
- `household_members`
- `backup_contacts`
- `handoff_obligations`
- `permission_requests`
- `permission_decisions` (append-only)
- `permission_rules`
- `duty_definitions`
- `duty_entries`
- `voice_notes`
- `launch_templates`
- `launch_steps`
- `launch_runs`
- `launch_step_completions`

### Existing table changes

Add to `calendar_events`:
- `owner_id TEXT NULL REFERENCES household_members(id)`
- `schedule_kind TEXT NOT NULL DEFAULT 'general'`
- `requires_handoff INTEGER NOT NULL DEFAULT 0`

### Required constraints and indexes

- Foreign keys enabled and tested.
- Unique `handoff_obligations.event_id`.
- Unique permission decision guard so only one current approve/deny decision exists until a reopen event.
- Duty index on `(duty_id, occurred_at DESC)`.
- Voice-note indexes on recipient and creation time.
- Unique launch run on `(template_id, service_date)`.
- Unique launch completion on `(run_id, step_id)`.
- Calendar index on `(owner_id, start_at, end_at)`.

### Upgrade safety

- Test migration against both a fresh in-memory database and a temporary file containing the current schema.
- Query `PRAGMA table_info(calendar_events)` before adding columns so re-running is safe.
- Seed default people/duties/launch template only when their tables are empty.
- Never drop or rewrite existing calendar, settings, activity, or audit rows.

---

## 6. Domain Rules

### Handoff conflict calculation

For each handoff and adult:

1. Expand the handoff need to `[startsAt - travelBuffer, endsAt)`.
2. Expand each adult commitment to `[event.start, event.end + overrunBuffer)`.
3. Intervals conflict when `adultStart < needEnd && adultEnd > needStart`.
4. Ignore the child event backing the handoff itself.
5. All-day adult events conflict for the full local day.
6. Return every conflicting event, not only a boolean, so the tile can explain the flag.
7. For an unclaimed item, recommend the first available adult by household sort order; never silently assign.
8. Night-before state begins at 18:00 local on the calendar day before `startsAt`; urgent begins two hours before the handoff.

Required scenario: a 16:00–16:15 adult call with a 15-minute overrun buffer conflicts with a 16:15 pickup. A Thursday 11:30 handoff without an assignee displays “Unclaimed.”

### Standing permission rules

1. Consider only active rules for the request category.
2. Convert `occursAt` to the dashboard timezone.
3. Match active date range, weekday, and optional local time window.
4. Sort by priority descending, then creation time ascending.
5. If the highest-priority matches agree, create a server-authored decision with source `standing-rule`.
6. If highest-priority rules disagree, leave pending and return a rule-conflict warning.
7. Manual approval/denial is append-only and returns 409 if the request is already decided.
8. Reopen requires a non-empty reason and adds a `reopened` decision event before returning the request to pending.

### Duty streak calculation

1. Filter entries to the selected period for counts.
2. For streaks, order that duty’s entries newest-first.
3. Count consecutive entries by the same adult until a different adult appears.
4. Display the streak only at 3+; example: “Partner — last 4 in a row.”
5. Keep counts per duty. Do not calculate a household-wide score or winner.

### Launch-run calculation

1. Select the active template whose weekday matches the local service date.
2. Build the local departure time with DST-aware timezone conversion.
3. Create/find one run per template + service date.
4. The run is active from `departureAt - activeWindowMinutes` until 15 minutes after departure.
5. Complete when all active steps have completion rows; undo reopens it.
6. Chime when countdown crosses `chimeBeforeMinutes` and `chimePlayedAt` is null.
7. A successful chime immediately records its acknowledgment; reloads and second clients must not chime again.
8. If audio is blocked, show a visible “Tap to enable chime” control and do not falsely acknowledge playback.

---

## 7. API Surface

All mutation bodies include `actorId`; all times returned by the server are ISO strings.

### Household

- `GET /api/household`
- `PATCH /api/household/members/:id`

### Handoffs

- `GET /api/handoffs?from=<iso>&to=<iso>`
- `POST /api/handoffs`
- `PATCH /api/handoffs/:id/claim`
- `PATCH /api/handoffs/:id/request-backup`
- `PATCH /api/handoffs/:id/resolve`
- `GET /api/backup-contacts`
- `POST /api/backup-contacts`
- `PUT /api/backup-contacts/:id`

### Permissions

- `GET /api/permissions?status=pending&includeRecent=true`
- `POST /api/permissions`
- `POST /api/permissions/:id/decision`
- `POST /api/permissions/:id/reopen`
- `GET /api/permission-rules`
- `POST /api/permission-rules`
- `PUT /api/permission-rules/:id`
- `DELETE /api/permission-rules/:id` (soft-disable)

### Duties

- `GET /api/duties?windowDays=30`
- `POST /api/duties/entries`
- `DELETE /api/duties/entries/:id` (undo latest accidental tap only)
- `POST /api/duties`
- `PUT /api/duties/:id`

### Voice notes

- `GET /api/voice-notes?recipientId=<id>&limit=20`
- `POST /api/voice-notes` as multipart audio + metadata
- `GET /api/voice-notes/:id/audio` with range-request support
- `POST /api/voice-notes/:id/read`
- `DELETE /api/voice-notes/:id`

### Launch

- `GET /api/launch/current?at=<iso>`
- `POST /api/launch/runs/:runId/steps/:stepId/toggle`
- `POST /api/launch/runs/:runId/chime-played`
- `POST /api/launch/runs/:runId/reset`
- `GET /api/launch/templates`
- `POST /api/launch/templates`
- `PUT /api/launch/templates/:id`

### Error semantics

- 400: malformed schema/time range/mime type
- 403: actor role cannot perform action
- 404: resource not found
- 409: already decided, stale handoff state, duplicate completion, or standing-rule conflict requiring review
- 413: voice note exceeds size limit

---

## 8. Implementation Tasks

Each task below is one useful commit. For every production behavior: write the named test first, run it and confirm the expected failure, add only enough implementation to pass, run the focused test again, then run the affected package suite before committing.

### Task 1: Establish deterministic family-feature test support

**Objective:** Add reusable clock, member, and API render fixtures before adding feature behavior.

**Files:**
- Create: `services/api/src/test/factories.ts`
- Create: `services/api/src/test/testClock.ts`
- Create: `apps/dashboard-web/src/test/renderWithProviders.tsx`
- Create: `apps/dashboard-web/playwright.config.ts`
- Create: `apps/dashboard-web/e2e/smoke.spec.ts`
- Modify: `apps/dashboard-web/package.json`
- Modify: `pnpm-lock.yaml`

**RED:** Add a smoke test that opens Today at 1920×1080, verifies header/main/nav exist, and fails because Playwright/config is absent.

**GREEN:** Add `@playwright/test`, web-server configuration, query-client render helper, and an injectable fixed clock fixture. Do not change application behavior.

**Verify:**
- `pnpm --filter @home-dashboard/web test`
- `pnpm --filter @home-dashboard/web test:e2e -- --project=chromium`
- Expected: existing unit tests and one smoke test pass.

**Commit:** `test: add deterministic dashboard feature fixtures`

### Task 2: Canonicalize spacing, type, radius, and touch primitives

**Objective:** Fix the underlying size inconsistency before new components copy it.

**Files:**
- Modify: `packages/design-tokens/src/tokens.css`
- Modify: `packages/design-tokens/src/tokens.ts`
- Modify: `apps/dashboard-web/src/styles/app.css`
- Modify: `apps/dashboard-web/src/components/Panel.tsx`
- Modify: `apps/dashboard-web/src/components/TouchButton.tsx`
- Modify: `apps/dashboard-web/src/components/TouchButton.test.tsx`
- Create: `apps/dashboard-web/src/components/Panel.test.tsx`
- Create: `apps/dashboard-web/src/components/RangeControl.tsx`
- Create: `apps/dashboard-web/src/components/RangeControl.test.tsx`

**RED:** Tests require:
- standard panel padding token = 24 px and compact = 16 px
- `Panel density="default|compact"` produces the intended variant
- all TouchButton size variants have at least a 48 px target
- RangeControl has a 48 px accessible hit area

**GREEN:**
- Primitive scale: 8, 16, 24, 32, 40, 48, 56, 64; one named 4 px micro token only.
- Radii: 6 px control, 8 px panel.
- Type: 12, 14, 16, 20, 28, 32, 40.
- Import primitives into `app.css`; remove stale Inter, old large radii, and duplicate theme colors from the package.
- Refactor `Panel` so callers choose density rather than overriding four padding values.
- Refactor slider CSS to use a 6 px track, 24 px thumb, and 48 px hit box.

**Verify:**
- `pnpm --filter @home-dashboard/design-tokens typecheck`
- `pnpm --filter @home-dashboard/web test`
- Screenshot both themes at 1920×1080 to ensure colors did not regress.

**Commit:** `refactor(web): unify dashboard layout primitives`

### Task 3: Add shared family contracts

**Objective:** Define all request/response types and validation boundaries before repositories and UI.

**Files:**
- Create: `packages/contracts/src/household.ts`
- Create: `packages/contracts/src/handoffs.ts`
- Create: `packages/contracts/src/permissions.ts`
- Create: `packages/contracts/src/duties.ts`
- Create: `packages/contracts/src/voiceNotes.ts`
- Create: `packages/contracts/src/launch.ts`
- Modify: `packages/contracts/src/calendar.ts`
- Modify: `packages/contracts/src/settings.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

**RED:** Add schema tests for valid examples and rejection of:
- child actors making adult decisions
- invalid weekday/time strings
- voice notes over 60 seconds
- unknown launch icon keys
- calendar event ownership with malformed IDs

**GREEN:** Implement Zod schemas and inferred types. Add family settings: local timezone, handoff alert time, travel buffer, event overrun buffer, default duty window.

**Verify:** `pnpm --filter @home-dashboard/contracts test && pnpm --filter @home-dashboard/contracts typecheck`

**Commit:** `feat(contracts): define family coordination schemas`

### Task 4: Introduce versioned migrations and household repositories

**Objective:** Upgrade existing SQLite files safely and seed one-child household defaults.

**Files:**
- Create: `services/api/src/platform/migrations.ts`
- Create: `services/api/src/platform/migrations.test.ts`
- Create: `services/api/src/modules/household/repository.ts`
- Create: `services/api/src/modules/household/repository.test.ts`
- Create: `services/api/src/modules/household/routes.ts`
- Modify: `services/api/src/platform/database.ts`
- Modify: `services/api/src/app.ts`
- Modify: `services/api/src/app.test.ts`

**RED:**
- Fresh database has all new tables and indexes.
- A file built with the old schema upgrades without losing a calendar event.
- Running migrations twice is a no-op.
- Empty household seeds You, Partner, Kid in deterministic order.
- Child actor fails adult-role guard.

**GREEN:** Move schema creation into ordered migrations, add household repository/role guard/routes, and expose it through `AppContext`.

**Verify:** `pnpm --filter @home-dashboard/api test`

**Commit:** `feat(api): add household profiles and safe schema migrations`

### Task 5: Add the active-person switcher

**Objective:** Give every write a visible, deliberate actor without adding authentication.

**Files:**
- Modify: `apps/dashboard-web/src/lib/store.ts`
- Modify: `apps/dashboard-web/src/lib/api.ts`
- Create: `apps/dashboard-web/src/features/household/ActorSwitcher.tsx`
- Create: `apps/dashboard-web/src/features/household/ActorSwitcher.test.tsx`
- Modify: `apps/dashboard-web/src/app/Header.tsx`
- Modify: `apps/dashboard-web/src/features/settings/SettingsScreen.tsx`

**RED:** Test default selection, persistence to localStorage, switching adults/child, 48 px controls, and fallback when a saved member becomes inactive.

**GREEN:** Query `/api/household`, render icon/color/name, persist only the member ID locally, and expose `useActiveActor()` for mutation hooks. Add editable member names/icons to Settings.

**Verify:** web unit tests + manual switch in the running kiosk.

**Commit:** `feat(web): add household actor attribution`

### Task 6: Add calendar ownership and handoff creation fields

**Objective:** Mark whose schedule an event belongs to and create a handoff need from a child event.

**Files:**
- Modify: `services/api/src/modules/calendar/repository.ts`
- Modify: `services/api/src/modules/calendar/repository.test.ts`
- Modify: `services/api/src/modules/calendar/routes.ts`
- Modify: `apps/dashboard-web/src/features/calendar/EventEditorSheet.tsx`
- Create: `apps/dashboard-web/src/features/calendar/EventEditorSheet.test.tsx`
- Modify: `apps/dashboard-web/src/features/calendar/CalendarPanel.tsx`

**RED:**
- Calendar round-trips owner/scheduleKind/requiresHandoff.
- Legacy events parse with safe defaults.
- Event editor only offers “Needs handoff” for child commitments.
- Saving a child event with handoff enabled creates or updates one obligation atomically.

**GREEN:** Extend SQL mapping and editor controls. Use a transaction for event + obligation. Show a small vector handoff marker on calendar chips.

**Verify:** focused repository/editor tests, then API and web suites.

**Commit:** `feat(calendar): add schedule ownership and handoff metadata`

### Task 7: Implement the handoff conflict engine

**Objective:** Produce explainable, timezone-correct conflict and attention states.

**Files:**
- Create: `services/api/src/modules/handoffs/conflicts.ts`
- Create: `services/api/src/modules/handoffs/conflicts.test.ts`
- Create: `services/api/src/modules/handoffs/repository.ts`
- Create: `services/api/src/modules/handoffs/repository.test.ts`

**RED:** Cover:
- 16:00–16:15 call + overrun vs 16:15 pickup
- adjacent intervals with zero buffers do not conflict
- all-day commitment conflicts
- DST transition service date
- unclaimed Thursday 11:30
- night-before changes exactly at 18:00 local
- urgent threshold at two hours
- recommendation selects an available adult but does not assign

**GREEN:** Implement pure interval/attention functions with injected `now`, timezone, and settings; then repository CRUD and board assembly.

**Verify:** `pnpm --filter @home-dashboard/api test -- conflicts`

**Commit:** `feat(api): calculate handoff gaps and schedule conflicts`

### Task 8: Expose and render the Handoff Board

**Objective:** Put conflicts, unclaimed events, and backup contacts directly on the actionable tile.

**Files:**
- Create: `services/api/src/modules/handoffs/routes.ts`
- Create: `services/api/src/modules/handoffs/routes.test.ts`
- Create: `apps/dashboard-web/src/features/handoffs/HandoffSummaryTile.tsx`
- Create: `apps/dashboard-web/src/features/handoffs/HandoffBoard.tsx`
- Create: `apps/dashboard-web/src/features/handoffs/HandoffBoard.test.tsx`
- Create: `apps/dashboard-web/src/features/handoffs/HandoffEditorSheet.tsx`
- Modify: `apps/dashboard-web/src/lib/api.ts`
- Modify: `services/api/src/app.ts`

**RED:** UI/API tests require:
- “Pickup at 4:15 conflicts with Your call at 4:00” explanation
- “Unclaimed · Thursday · 11:30 AM” state
- Grandma, Neighbor, and After-care contact rows visible without opening Settings
- claiming as an adult updates attribution/time
- child claim returns 403
- stale concurrent claim returns 409 and refreshes the tile

**GREEN:** Add validated routes and mutation hooks; use warning icon + text + color, not color alone. Contact buttons are at least 48 px and expose phone number/`tel:` where available.

**Verify:** API tests, web tests, and two-browser SSE/manual claim test.

**Commit:** `feat: add actionable handoff board`

### Task 9: Implement immutable permission decisions and standing rules

**Objective:** Prevent parent-to-parent relitigation and automate repeated decisions safely.

**Files:**
- Create: `services/api/src/modules/permissions/rules.ts`
- Create: `services/api/src/modules/permissions/rules.test.ts`
- Create: `services/api/src/modules/permissions/repository.ts`
- Create: `services/api/src/modules/permissions/repository.test.ts`
- Create: `services/api/src/modules/permissions/routes.ts`
- Create: `services/api/src/modules/permissions/routes.test.ts`
- Modify: `services/api/src/app.ts`

**RED:** Cover:
- Friday sleepover auto-approves from a Friday standing rule
- Thursday sleepover remains pending
- manual approval stores adult and server time
- a second decision returns 409 and does not rewrite the first
- reopening requires reason and preserves history
- conflicting top-priority rules do not auto-decide
- expired request cannot be approved without reopening

**GREEN:** Implement request creation, deterministic rule evaluation, append-only decisions, and route role checks.

**Verify:** `pnpm --filter @home-dashboard/api test -- permissions`

**Commit:** `feat(api): add permission queue and standing rules`

### Task 10: Build the Permission Queue UI

**Objective:** Make the answer and its provenance obvious at a glance.

**Files:**
- Create: `apps/dashboard-web/src/features/permissions/PermissionQueueTile.tsx`
- Create: `apps/dashboard-web/src/features/permissions/PermissionQueue.tsx`
- Create: `apps/dashboard-web/src/features/permissions/PermissionQueue.test.tsx`
- Create: `apps/dashboard-web/src/features/permissions/PermissionRequestSheet.tsx`
- Create: `apps/dashboard-web/src/features/permissions/StandingRulesSheet.tsx`
- Modify: `apps/dashboard-web/src/lib/api.ts`

**RED:** Require:
- pending card has Approve/Deny only for an adult actor
- decided card reads “Approved by You, 6:12 PM”
- recent decisions remain visible after pending queue empties
- automatic result names its standing rule
- double tap cannot submit twice
- reopened request shows prior decision history

**GREEN:** Build queue, request form, rule editor, mutation-disabled states, and exact timestamp/provenance labels.

**Verify:** web tests + Playwright approval flow.

**Commit:** `feat(web): add permission decision queue`

### Task 11: Implement the adult Duty Ledger

**Objective:** Log recurring and invisible work with one tap and expose per-duty counts/streaks.

**Files:**
- Create: `services/api/src/modules/duties/repository.ts`
- Create: `services/api/src/modules/duties/repository.test.ts`
- Create: `services/api/src/modules/duties/routes.ts`
- Create: `services/api/src/modules/duties/routes.test.ts`
- Create: `apps/dashboard-web/src/features/duties/DutyLedgerTile.tsx`
- Create: `apps/dashboard-web/src/features/duties/DutyLedger.tsx`
- Create: `apps/dashboard-web/src/features/duties/DutyLedger.test.tsx`
- Create: `apps/dashboard-web/src/features/duties/DutyEditorSheet.tsx`
- Modify: `apps/dashboard-web/src/lib/api.ts`
- Modify: `services/api/src/app.ts`

**RED:** Cover:
- Bedtime counts You 3 / Partner 5
- School run reports Partner’s last four in a row
- streak below three is omitted
- dentist booking, permission slip, and 2 AM wake-up retain actual timestamps
- child actor cannot receive duty credit
- latest accidental entry can be undone; older/non-latest entries cannot use quick undo
- period switching changes counts but not corrupt entries

**GREEN:** Add repository aggregation, role-checked routes, quick-log icon cards, recent history, 10-second UI undo, and custom duty editor. Do not add a total household score.

**Verify:** API + web tests and rapid-tap manual test.

**Commit:** `feat: add adult duty ledger`

### Task 12: Add secure local voice-note storage and streaming

**Objective:** Store actual voice notes locally and stream them back reliably.

**Files:**
- Modify: `services/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `services/api/src/config.ts`
- Create: `services/api/src/modules/voice-notes/storage.ts`
- Create: `services/api/src/modules/voice-notes/storage.test.ts`
- Create: `services/api/src/modules/voice-notes/repository.ts`
- Create: `services/api/src/modules/voice-notes/routes.ts`
- Create: `services/api/src/modules/voice-notes/routes.test.ts`
- Modify: `services/api/src/app.ts`
- Modify: `.env.example`

**RED:** Test multipart upload, MIME allowlist, 8 MiB rejection, 60-second rejection, path traversal rejection, recipient listing, read receipt, delete cleanup, and HTTP byte-range playback.

**GREEN:** Add `@fastify/multipart`; stream to a generated filename below `VOICE_NOTE_DIR`; store metadata only after a complete file write; delete partial files on error. Default directory is `./var/voice-notes` and container deployment uses `/data/voice-notes`.

**Verify:** API tests and `curl` upload/range request against the running service.

**Commit:** `feat(api): store and stream local voice notes`

### Task 13: Build hold-to-record Voice Note Drop

**Objective:** Give the child one large, literacy-independent reply control.

**Files:**
- Create: `apps/dashboard-web/src/features/voice-notes/useHoldToRecord.ts`
- Create: `apps/dashboard-web/src/features/voice-notes/useHoldToRecord.test.ts`
- Create: `apps/dashboard-web/src/features/voice-notes/VoiceNoteTile.tsx`
- Create: `apps/dashboard-web/src/features/voice-notes/VoiceNoteTile.test.tsx`
- Create: `apps/dashboard-web/src/features/voice-notes/VoiceNotePlayer.tsx`
- Modify: `apps/dashboard-web/src/lib/api.ts`

**RED:** Cover:
- pointer down starts MediaRecorder
- pointer up stops and uploads once
- pointer cancel stops/discards safely
- a press shorter than 300 ms is not uploaded as an accidental note
- 60 seconds auto-stops
- microphone denial shows a recoverable instruction
- child mode presents one 88 px hold-to-reply button
- successful playback marks the note read
- audio works without a transcript

**GREEN:** Implement recorder state machine, supported MIME selection, duration timer, optional simultaneous browser transcript capture, multipart upload, large play control, sender/time label, and reply linkage.

**Verify:** unit tests plus real Chromium microphone test on kiosk hardware; if CI has no microphone, use a fake media stream only in the automated test.

**Commit:** `feat(web): add hold-to-reply voice note drop`

### Task 14: Implement launch templates, runs, and countdown state

**Objective:** Persist a daily single-child launch run and make time behavior deterministic.

**Files:**
- Create: `services/api/src/modules/launch/schedule.ts`
- Create: `services/api/src/modules/launch/schedule.test.ts`
- Create: `services/api/src/modules/launch/repository.ts`
- Create: `services/api/src/modules/launch/repository.test.ts`
- Create: `services/api/src/modules/launch/routes.ts`
- Create: `services/api/src/modules/launch/routes.test.ts`
- Modify: `services/api/src/app.ts`

**RED:** Cover weekday selection, no weekend run, DST departure conversion, one run per date, completion/undo, reset, expiration, all-steps completion, and single chime acknowledgment.

**GREEN:** Implement schedule resolver, lazy run creation, transactional toggles, status derivation, and routes.

**Verify:** `pnpm --filter @home-dashboard/api test -- launch`

**Commit:** `feat(api): add persistent launch sequences`

### Task 15: Build the full-screen Launch Sequence and chime

**Objective:** Render shoes, bag, and snack as large pictures/icons with a one-time three-minute warning.

**Files:**
- Create: `apps/dashboard-web/src/features/launch/LaunchScreen.tsx`
- Create: `apps/dashboard-web/src/features/launch/LaunchScreen.test.tsx`
- Create: `apps/dashboard-web/src/features/launch/LaunchSummaryTile.tsx`
- Create: `apps/dashboard-web/src/features/launch/useLaunchChime.ts`
- Create: `apps/dashboard-web/src/features/launch/useLaunchChime.test.ts`
- Modify: `apps/dashboard-web/src/lib/api.ts`
- Modify: `apps/dashboard-web/src/lib/store.ts`

**RED:** Require:
- “Bus in 6 min” countdown from server departure time
- icon card greys out and gains a check after tap
- tap again undoes
- all cards complete the run
- chime attempts once when crossing three minutes
- acknowledgment occurs only after AudioContext successfully starts
- blocked audio shows “Tap to enable chime”
- reload after acknowledgment does not replay

**GREEN:** Build icon grid, countdown interval, completion mutations, progress, reset confirmation, and a short two-tone Web Audio chime. Use Lucide icons rather than emoji.

**Verify:** unit tests, Playwright fake-clock flow, then listen once on real kiosk speakers.

**Commit:** `feat(web): add full-screen launch sequence`

### Task 16: Assemble Family and Today screens

**Objective:** Make all five new workflows first-class without overcrowding the overview.

**Files:**
- Create: `apps/dashboard-web/src/features/family/FamilyScreen.tsx`
- Create: `apps/dashboard-web/src/features/overview/TodayOverview.tsx`
- Create: `apps/dashboard-web/src/features/overview/ContextRail.tsx`
- Modify: `apps/dashboard-web/src/App.tsx`
- Modify: `apps/dashboard-web/src/app/Nav.tsx`
- Modify: `apps/dashboard-web/src/app/Header.tsx`
- Modify: `apps/dashboard-web/src/lib/store.ts`
- Modify: `apps/dashboard-web/src/features/weather/WeatherPanel.tsx`
- Modify: `apps/dashboard-web/src/features/media/NowPlaying.tsx`
- Modify: `apps/dashboard-web/src/features/overview/ActivityFeed.tsx`
- Modify: `apps/dashboard-web/src/features/settings/SettingsScreen.tsx`

**RED:** Playwright/component tests assert:
- six bottom tabs with ≥48 px targets
- Settings reachable from header
- Today has exactly the six planned grid regions
- no panel extends below main at 1920×1080
- Family screen exposes all three modules
- Launch opens full-screen
- 1280×720 layout is scrollable rather than clipped

**GREEN:** Replace the old overview, add Family/Launch routes, add compact weather/media variants, and use intentional grid tracks. Do not delete existing full Calendar/Home/Music views.

**Verify:** web unit suite + 1920×1080 and 1280×720 e2e.

**Commit:** `feat(web): reorganize dashboard around family coordination`

### Task 17: Wire live events and actionable alerts

**Objective:** Keep multiple dashboards synchronized and surface night-before problems immediately.

**Files:**
- Modify: `services/api/src/platform/events.ts`
- Modify: `services/api/src/modules/activity/routes.ts`
- Modify: `apps/dashboard-web/src/lib/useLiveEvents.ts`
- Create: `apps/dashboard-web/src/features/overview/FamilyAlertBanner.tsx`
- Create: `apps/dashboard-web/src/features/overview/FamilyAlertBanner.test.tsx`

**RED:** Test cache invalidation for `household`, `handoff`, `permission`, `duty`, `voice-note`, and `launch` event prefixes. Test that a night-before unclaimed handoff ranks above ordinary activity and the banner links to the correct screen.

**GREEN:** Add central event constants, emit after committed writes only, invalidate matching query keys, and merge urgent family items into activity output without duplicating tile content.

**Verify:** open two browser windows; mutate in one and confirm the other updates without waiting for polling.

**Commit:** `feat: add live family workflow alerts`

### Task 18: Finish exact visual-system remediation

**Objective:** Apply the audited spacing and sizing fixes to all old and new screens.

**Files:**
- Modify: `apps/dashboard-web/src/App.tsx`
- Modify: `apps/dashboard-web/src/styles/app.css`
- Modify: all existing `apps/dashboard-web/src/**/*.tsx` files still using off-scale spacing/type/radii
- Modify: `apps/dashboard-web/src/features/calendar/CalendarPanel.tsx`
- Modify: `apps/dashboard-web/src/features/home/HomeOverview.tsx`
- Modify: `apps/dashboard-web/src/features/home/EntityControl.tsx`
- Modify: `apps/dashboard-web/src/features/media/MediaScreen.tsx`
- Modify: `apps/dashboard-web/src/features/voice/VoiceOverlay.tsx`
- Modify: `apps/dashboard-web/src/components/Sheet.tsx`
- Create: `apps/dashboard-web/e2e/layout.spec.ts`
- Create: `apps/dashboard-web/e2e/accessibility.spec.ts`

**RED:** Automated assertions:
- main gutter and primary grid gap are 24 px at 1920
- standard panel content inset is 24 px
- no actionable element is below 48×48 px
- no text is 11 or 13 px
- all panels are within the main bounding box
- no unwanted horizontal body overflow
- range input hit area ≥48 px
- calendar chip has nonzero title width or intentionally hides time at compact width
- Settings uses two columns at 1920 and one at 1280

**GREEN:**
- Change `main` from `px-6 py-5` to `p-6`.
- Replace `gap-5` rails/grids with `gap-6`.
- Replace ad hoc 20/12 px Panel insets with density primitives.
- Upgrade 11 px labels to 12 px and 13 px dates to 14/16 px.
- Make Nav icon 24 px and label 12 px while retaining 64 px bar height.
- Use the new RangeControl in media and entity controls.
- Fix calendar compact-chip layout.
- Apply 8/6 px radius rules; keep pills only for statuses/range tracks.
- Keep both time-of-day themes and Space Grotesk.
- Preserve visible space background through `backdrop-blur-md`; do not increase to `xl`.

**Verify:** both e2e viewports and both forced themes; compare screenshots for alignment, not just test selectors.

**Commit:** `fix(web): normalize dashboard spacing and touch sizing`

### Task 19: Add configuration, retention, and deployment support

**Objective:** Make the features operable after kiosk/container installation.

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `infra/systemd/home-dashboard-api.service`
- Modify: `infra/nginx/home-dashboard.conf`
- Modify: `docs/linux-installation.md`
- Modify: `docs/operations.md`
- Modify: `README.md`

**Required configuration:**
- `VOICE_NOTE_DIR`
- `VOICE_NOTE_MAX_BYTES` default 8 MiB
- `VOICE_NOTE_RETENTION_DAYS` default 30
- local IANA timezone setup instructions

**RED:** Add/configure a deployment check that fails if the API cannot write its voice-note directory.

**GREEN:** Mount/use the existing data volume, add required `ReadWritePaths` for systemd, document backup/restore of SQLite + voice-note files, document microphone/speaker permission test, and update feature list/security notes.

**Verify:**
- `docker compose config`
- build images or run the existing deployment validation
- systemd unit syntax check where available

**Commit:** `docs(ops): support family data and voice note storage`

### Task 20: Final regression, kiosk verification, and cleanup

**Objective:** Prove every requested scenario works in the built application.

**Files:**
- Modify only files needed to fix failures found during this gate.
- Add regression tests before every fix.

**Automated gate:**

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm --filter @home-dashboard/web test:e2e
```

Expected: all commands exit 0 with no new warnings.

**Visual gate:**

Capture light and dark screenshots at:
- 1920×1080 Today
- 1920×1080 Family
- 1920×1080 Launch
- 1280×720 Today
- 1280×720 Family

Use the proven Chromium pattern with a temporary profile, `--no-sandbox`, and no `--virtual-time-budget`.

**Scenario gate:**

1. Create Kid pickup at 16:15, assign You, add Your call ending 16:15, verify conflict is visible the night before with the call named.
2. Create unclaimed Thursday early dismissal at 11:30, verify “Unclaimed” and three backup contacts on the tile.
3. Submit “Sleepover Friday?”, approve as You, verify “Approved by You” with server timestamp and second decision rejection.
4. Create a Friday sleepover standing rule, submit another Friday request, verify automatic approval and rule provenance.
5. Log Bedtime 3 times as You and 5 as Partner; verify counts.
6. Log School run 4 consecutive times as Partner; verify the explicit streak text.
7. Record “Library book is by the door,” play it as Kid, hold the single reply button, and verify both audio files survive a page reload.
8. Start launch with Shoes/Bag/Snack, complete steps, verify greyed icons and persistence.
9. Set departure six minutes away with chime threshold three minutes; verify one chime and no replay after reload.
10. Repeat a write with two browser windows and verify SSE synchronization.

**Cleanup:** audit for emoji, TODO stubs, console errors, orphan files, unbounded timers, unreleased MediaRecorder tracks, and unclosed test databases.

**Commit:** `chore: finalize family dashboard workflows`

---

## 9. Files Likely to Change

### Shared contracts

- `packages/contracts/src/index.ts`
- `packages/contracts/src/calendar.ts`
- `packages/contracts/src/settings.ts`
- `packages/contracts/src/contracts.test.ts`
- New: `household.ts`, `handoffs.ts`, `permissions.ts`, `duties.ts`, `voiceNotes.ts`, `launch.ts`

### API platform/application

- `services/api/src/app.ts`
- `services/api/src/app.test.ts`
- `services/api/src/config.ts`
- `services/api/src/platform/database.ts`
- `services/api/src/platform/events.ts`
- New: `services/api/src/platform/migrations.ts`
- New modules under `services/api/src/modules/{household,handoffs,permissions,duties,voice-notes,launch}/`
- `services/api/src/modules/calendar/repository.ts`
- `services/api/src/modules/calendar/routes.ts`
- `services/api/src/modules/activity/routes.ts`
- `services/api/package.json`

### Web shell/design system

- `apps/dashboard-web/src/App.tsx`
- `apps/dashboard-web/src/app/Header.tsx`
- `apps/dashboard-web/src/app/Nav.tsx`
- `apps/dashboard-web/src/lib/api.ts`
- `apps/dashboard-web/src/lib/store.ts`
- `apps/dashboard-web/src/lib/useLiveEvents.ts`
- `apps/dashboard-web/src/styles/app.css`
- `apps/dashboard-web/src/components/Panel.tsx`
- `apps/dashboard-web/src/components/TouchButton.tsx`
- `apps/dashboard-web/src/components/Sheet.tsx`
- New: `RangeControl.tsx`

### Web features

- New directories: `features/household`, `features/handoffs`, `features/permissions`, `features/duties`, `features/voice-notes`, `features/launch`, `features/family`
- New/reworked `features/overview/TodayOverview.tsx`, `ContextRail.tsx`, `FamilyAlertBanner.tsx`
- Existing calendar, weather, media, home, voice, and settings components for visual-system alignment

### Tests and deployment

- New Playwright config and `apps/dashboard-web/e2e/*.spec.ts`
- `.env.example`
- `docker-compose.yml`
- `infra/systemd/home-dashboard-api.service`
- `infra/nginx/home-dashboard.conf`
- `README.md`
- `docs/linux-installation.md`
- `docs/operations.md`

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Calendar events lack reliable ownership, making conflict results misleading | Require owner selection for adult/child commitments; legacy events remain General and are explicitly excluded until classified. |
| DST/local-day bugs affect night-before and bus time | Use IANA timezone + `@date-fns/tz`, inject clocks, and test spring/fall transitions. |
| Shared kiosk actor is left on the wrong person | Always show actor in header, include actor in confirmation text, and server-restrict adult-only actions. |
| Two parents act at the same time | Transactional writes, current-state/version check, 409 response, SSE refresh. |
| Standing rules approve too broadly | Structured predicates only, priority rules, conflict fallback to pending, visible provenance, no AI matcher. |
| Browser microphone permission or codec is unavailable | MIME capability detection, recoverable permission state, no transcript requirement, kiosk setup test. |
| Voice-note files orphan after failed uploads | Temporary file + atomic rename; metadata transaction after successful write; cleanup on error and deletion. |
| Audio chime is blocked or repeats | Acknowledge only after AudioContext starts; visible enable control; persisted one-chime-per-run field. |
| Overview becomes crowded | Dedicated Family and Launch screens; Today only shows actionable summaries; fixed 12-column composition at target resolution. |
| Existing UI regresses while tokens are unified | Refactor primitives first, screenshot both themes, then geometry e2e at two resolutions. |
| SQLite migration damages existing data | Versioned idempotent migrations, old-schema fixture, backup documentation, no destructive migration. |
| “Fairness” presentation becomes accusatory | Keep per-duty facts and streaks; no winner, global score, moral label, or celebratory imbalance color. |

---

## 11. Definition of Done

The work is complete only when all of the following are true:

- Every requested example is reproducible in the built kiosk app.
- Handoff conflicts are explained by named events and use local-time buffers.
- Unclaimed next-day care is visibly flagged at 18:00 the night before.
- Backup contacts are visible directly on the handoff tile.
- Permission answers display outcome, adult, exact server time, and standing-rule provenance where applicable.
- A decided permission cannot be silently overwritten.
- Duty counts and 3+ streaks are correct for the selected window.
- Voice-note recording, reply, playback, read state, reload persistence, size limits, and permission errors work.
- Launch uses large vector pictures/icons, greys completed items, persists state, counts down, and chimes exactly once at three minutes.
- Today, Family, and Launch fit 1920×1080 without unintended clipping or body scrolling.
- 1280×720 exposes all content through intentional internal scrolling.
- Page gutters/gaps/padding follow the stated 8 px grid and no action is below 48×48 px.
- No UI chrome contains emoji; Lucide icons are used.
- Light and dark time-of-day themes remain legible and visually consistent.
- Existing Calendar, Home Assistant, Music, Weather, Settings, and Assistant functionality still passes regression tests.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, and Playwright all pass.
- Each useful task is committed separately with the commit messages above or equivalent conventional commits.
