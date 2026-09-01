# Home Dashboard — working notes for Claude

Touch-first family dashboard for a **1920×1080 wall-mounted Linux kiosk**. pnpm
monorepo, Node 20+, Python 3.11+ for the voice service.

```
apps/dashboard-web      React 18 + Vite + TanStack Query + Zustand + Tailwind v4
services/api            Fastify 5 + SQLite (node:sqlite)
services/voice          FastAPI — STT/intent/TTS, provider-neutral
packages/contracts      Zod schemas + types shared by web and API
packages/design-tokens   CSS + TS tokens (spacing, radii, touch, type, motion)
```

## Move fast here

The whole verification loop is **under 30 seconds**. There is no excuse for a
long grind on a small task. Measured on this machine:

| Command | Time |
|---|---|
| `pnpm typecheck` (whole repo) | ~11s |
| `pnpm --filter @home-dashboard/api test` | ~3s (149 tests) |
| `pnpm --filter @home-dashboard/web test` | ~6s (140 tests) |
| `pnpm test` (all workspaces) | ~15s |
| `pnpm test:e2e` | minutes — boots API + Vite |

Rules that follow from that:

- **Run the real check instead of reasoning about whether it would pass.**
  Typecheck is cheaper than a paragraph of speculation.
- **Scope the check to what you touched.** Filter to one workspace; run one test
  file with `pnpm --filter @home-dashboard/web test -- Nav.test`. Save the full
  sweep for the end.
- **Do not run e2e to validate a unit-level change.** It costs minutes and boots
  two servers. Run it when you touched layout, nav structure, or the design
  contract (see below) — that's what it guards.
- **Don't re-run a check that passed** until you've changed code again.
- **Batch independent reads/searches into one message.** Most exploration here
  is 3-5 greps that don't depend on each other.
- Read the specific file you need. This repo is small and well-named — `find`
  and `grep` beat spawning a search agent almost every time.

### Don't over-tool a small task

A one-line fix needs an edit and a typecheck, not a plan document, a subagent, or
a checklist. Match ceremony to actual scope. Skip subagents unless the user asks
or the task genuinely fans out across many unrelated areas.

## The design system is machine-enforced — read this before restyling

Visual decisions are **tests**, not conventions. A "just visual" tweak can break
the suite or, worse, make it pass vacuously.

- `e2e/layout.spec.ts` selects panels with **`section.rounded-xl`**. If `Panel`
  stops using that exact class, the audits match zero elements and pass while
  checking nothing. `components/Panel.tsx` keeps `rounded-xl`, not the
  equivalent `rounded-panel` token, for this reason. **Count matches before
  trusting a green run.**
- Type sizes are an **allowlist** (`ON_SCALE` in `layout.spec.ts`):
  16/18/20/22/24/28/32/40/48/64. **16px is a hard floor** — a kiosk is viewed
  from across a room, so secondary emphasis comes from color and weight, never
  from smaller text. Adding a size means editing **five** places:
  `packages/design-tokens/src/tokens.css`, `tokens.ts`, the `@theme inline`
  block in `src/styles/app.css`, `src/test/tokens.test.ts`, and that allowlist.
- Every visible button/input/select must be **≥56px** tall (`--touch-target`);
  hero actions 72px. `[data-calendar-day]` cells are the only 44px exemption.
- `main` padding, primary grid gap, and panel body inset are hard-asserted at
  **24px**.
- **"Today fits"** fails on 1px of tile overflow at 1920×1080, in both themes. A
  tile that scrolls internally still fails: put `overflow-y-auto` on an inner
  child, never on the Panel body the audit measures (`header + div`).
- `e2e/nav.spec.ts` pins the exact nav tab count and labels. `src/app/Nav.test.tsx`
  and `src/App.test.tsx` duplicate those assertions — **update all three together.**

Before changing a radius, spacing value, or type size: `grep` for it in
`e2e/layout.spec.ts` and update the contract deliberately. Never loosen an
assertion to make a regression go green — if the design genuinely changed, change
the spec in the same commit and say so.

## Visual direction

The backdrop is a **mesh network seen through frosted glass** —
`components/MeshBackground.tsx` (canvas) plus `.mesh-bg*` in `styles/app.css`.
It is deliberate; extend it rather than inventing a new direction. Asks like
"make it cooler" mean deepening this, not replacing it.

- **No animation library.** Hand-written CSS keyframes; anything needing
  per-frame logic across many elements goes to canvas.
- Keep effects on `transform`/`opacity` so they composite.
- **Canvas must honor `prefers-reduced-motion` itself** — the global CSS
  reduced-motion block only reaches CSS animations.
- Colors come from `--mesh-*` tokens, per theme. Dark needs far more alpha than
  light to register against `#05060c`.
- Theme flips by time of day (`lib/theme.ts`); force it in tests with
  `?theme=light|dark`.
- Body font is **Figtree**, declared in `tokens.css`, `app.css`, and the
  `index.html` font link — **all three change together.**
- Icon sizes come from `ICON` in `src/lib/icons.tsx`. Controls use
  `rounded-pill`; cards use `rounded-xl`.
- Tailwind **v4**, CSS-first (`@theme inline`) — there is no `tailwind.config.js`.
- Don't reintroduce the scrapped orbiting-planets/starfield backdrop. The
  `twinkle` keyframe survives only for `WeatherScene.tsx`'s clear-night sky.

## Where things go

**API module** (`services/api/src/modules/<feature>/`): `repository.ts` owns
SQLite access and business rules; `routes.ts` is the thin HTTP surface. Both get
a co-located `*.test.ts`. Wire new modules into `src/app.ts` and, if they hold
state, into `AppContext`.

Route conventions, worth matching exactly:

- Parse every body/query with a Zod schema from `@home-dashboard/contracts` via
  `safeParse` → `400 { error, details: err.flatten() }` on failure.
- Repositories throw typed errors (`RoleError`, `ConflictError`); routes catch
  them and map to status codes — `403` role violations, `409` conflicts,
  `404` unknown ids, `201` on create.
- Reject before writing any row, not after.
- Note `.js` extensions on relative imports — ESM, required.

**Web feature** (`apps/dashboard-web/src/features/<feature>/`): the screen or
panel component, its editor `Sheet` if it has one, co-located tests. Shared
primitives live in `src/components/`, cross-cutting helpers in `src/lib/`.

**Contracts** (`packages/contracts`): the shared Zod schemas. When a payload
shape changes, change it here — web and API both import it, so a mismatch is a
typecheck failure rather than a runtime surprise.

## Security posture — keep it

- The dashboard **never** holds provider secrets. The API owns credentials,
  caching, and the activity feed.
- The voice service **proposes** tool calls; only the API's validated tool
  registry executes them. Do not add a path that lets voice reach a device
  directly.
- High-risk actions (locks, security-sensitive devices) require an on-screen tap
  to confirm. Keep that gate on anything new in that class.
- Adult/child roles are enforced in repositories, server-side. UI gating is a
  convenience, never the enforcement point.
- Demo mode must keep working with no credentials — that's how the app runs by
  default.

## Testing

- **Write the test with the change.** Every module here has co-located tests;
  match that.
- Web tests: Testing Library + `src/test/renderWithProviders.tsx`. Query by role
  and accessible name, the way the a11y specs do.
- API tests: build the app against a throwaway SQLite path; `src/test/testClock.ts`
  exists so time-dependent logic is deterministic — use it instead of real dates.
- Python: `cd services/voice && .venv/bin/python -m pytest -q`.
- **Known flake:** `VoiceNoteTile.test.tsx` can exit non-zero on an unhandled
  `HTMLMediaElement.prototype.play` rejection from jsdom while all 140 tests
  still report passing. If the summary says all green but the exit code is 1,
  that's this — not your change.
- A TanStack Query "No queryFn was passed" warning in `TodayOverview.test.tsx` is
  likewise pre-existing noise.

## Verify before claiming

Run the command and read the output before saying something works. "Should be
fixed" after an edit with no run is the failure mode to avoid — and it's a
15-second check here. If tests fail, say so and paste the relevant output. If you
skipped a step, say which.

## Commits

Conventional commits, scoped to the workspace, lowercase, imperative:

```
feat(web): rebalance the header and size the primary action
fix(api): start the hourly forecast at the current hour
style(web): put fully-rounded elements on the pill token
refactor(web): delete tiles orphaned by the Family-screen refactor
docs: log the palette consolidation and dead-code removal
```

Scopes in use: `web`, `api`, `voice`, `tokens`, `design`, `ops`, plus bare
`docs`/`chore`. One focused change per commit. `CHANGELOG.md` tracks the visual
design pass, newest first, one entry per commit — add to it when a commit changes
the look. Commit or push only when asked; branch first if on `main`.

## Gotchas

- `pnpm dev` starts web (5173), api (8787), voice (8788) together. The Vite dev
  server proxies `/api` and `/voice`, so use relative URLs in the client.
- `eslint .` only lints plain JS — there's no typescript-eslint installed.
  **`pnpm typecheck` is the real check for TS/TSX.**
- e2e uses the **system Chrome** (`channel: "chrome"`); there's no downloaded
  Playwright browser cache. It points at throwaway state under `/tmp`.
- `next_task.md` holds the user's current bug/task list — check it when asked
  what's next.
- `docs/operations.md` and `docs/linux-installation.md` cover deployment; `infra/`
  holds docker, nginx, and systemd units.
