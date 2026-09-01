# Changelog

Visual design pass on the wall-mounted family dashboard. Entries are newest
first; each corresponds to one focused commit.

## Unreleased

### Launch gets its own tab
- Rendered in full on Family, the launch sequence took a full-width row of large
  step cards and squeezed the board, queue and ledger into the bottom half.
  It is now a sixth nav tab; Family keeps a summary card that links through.
- Tab count and labels are pinned in **three** places — `e2e/nav.spec.ts`,
  `Nav.test.tsx`, `App.test.tsx` — updated together.

### Gradient mesh replaces the starfield backdrop
- `SpaceBackground` is gone; `GradientBackground` paints from the `--mesh-*`
  tokens so both themes stay on the shared palette.
- Dark's secondary ink is raised (`--ink-3`/`-4` → `#d4dae3`/`#d2d8e1`,
  `--accent-2` → `#b4bcff`). Those sit on a translucent panel over the gradient,
  which composites much lighter than `--bg` alone; the old values measured
  ~2.9:1 against the real painted backdrop.

### Type scale filled in, body font now Figtree
- Added `title` 22, `heading` 28, `display` 48. The scale jumped 20 → 24 → 32 →
  40 → 64, leaving dense tiles nowhere to step a heading down without dropping
  below the floor. **16px remains the hard kiosk floor.**
- Five places changed together: `tokens.css`, `tokens.ts`, the `@theme inline`
  block in `app.css`, `tokens.test.ts`, and `ON_SCALE` in `e2e/layout.spec.ts`.
- Body font moved to Figtree in all three declarations (`tokens.css`, `app.css`,
  the `index.html` font link). `--radius-pill` corrected to `9999px`.

### Calendar gains week, day and agenda views
- Month/Week/Day/Agenda toggle with keyboard shortcuts, a filter rail whose
  subset survives a view switch, ICS import/export, and a current-time marker.

### Contrast audit added — known flaky
- `e2e/contrast.spec.ts` photographs each screen and checks text against the
  real painted backdrop. Transitions are frozen alongside animations, since the
  injected `color:transparent` is itself animated.
- **Not yet a reliable gate.** A label with no background of its own, or a row
  clipped by an internally scrolling panel, samples the wrong surface and
  reports a false failure. Verify a violation directly before changing a token.

### Token scale raised for distance viewing
- Touch targets: minimum 48px → **56px**, hero controls 64px → **72px**. Nothing
  interactive on a finger-driven kiosk should be smaller than a fingertip.
- Type scale: floor 14px → **16px**, every step up one notch
  (16/18/20/24/32/40/64). Secondary emphasis now comes from color and weight
  rather than from smaller text.
- Added `--radius-inner` (6px) to the radius scale. Nested elements take a
  smaller step than their container.
- `tokens.test.ts` and `e2e/layout.spec.ts` updated to assert the new floors.
  These are design contracts — they change with the design, never to paper over
  a regression.

### Radius and touch tokens reach Tailwind
- Registered the radius and touch scales in `@theme inline`, giving
  `rounded-inner|control|panel|pill` and `min-h-touch` / `h-touch` / `w-touch`.
  Their absence is why `rounded-md` (6px, off-scale) had spread to 41 call sites.
- Replaced all 41 `rounded-md` and every hardcoded `h-12`/`min-h-12` with tokens.

### Removed ALL-CAPS eyebrow labels
- `Panel` titles are sentence case at body size instead of tracked-out
  uppercase micro-type. A card showing 74° and a sun icon does not need a sign
  reading WEATHER above it.
- Converted the remaining uppercase labels in editor sheets, section headings,
  and status chips. Calendar weekday headers (SUN/MON) stay uppercase — that is
  conventional calendar notation, not decoration.

### Rebuilt "Now & Upcoming"
- Relative time now sits with its event instead of stranded in a far-right
  column several hundred pixels away, and reads as a countdown ("in 25m") for
  imminent items, clock time further out.
- Icons differentiate by event type (call, pickup, school, appointment, meal)
  instead of one sparkle for everything. The activity contract has no category
  field, so the type is inferred from the words the family actually uses.
- Day dividers (Today / Tomorrow / weekday) so a multi-day list reads as a
  schedule, and a real all-clear empty state rather than a bare shrug.
- Drops the API's subtitle when it is just the formatted start date, which the
  countdown already says better.

### Replaced every native `<select>` with a touch picker
- New `components/Select.tsx`: listbox pattern, trigger and options on the
  56px touch target, full keyboard support, closes on outside pointerdown.
- Swapped all 11 native selects across 7 files. Zero native select, range,
  checkbox, or radio styling remains anywhere in the app.
- Registered the z-index and elevation scales in Tailwind, so `shadow-raised`
  and `shadow-floating` resolve to the real tokens rather than Tailwind's
  built-in shadow defaults.

### Header rebalanced
- Three status clusters (a dot, a 14px icon, and a word each, capitalised
  inconsistently as "Demo" beside "demo") collapse into one badge that appears
  only when something is running on demo data and says so in plain language.
  The weather dot was hardcoded to "ok" and told the reader nothing; it is gone.
- The Assistant button is the primary action on the screen and is now sized
  like one: 72px, on the hero touch target rather than the 56px floor.

### Tab bar constrained to a centered cluster
- Five tabs stretched edge to edge across 1920px, leaving the targets hundreds
  of pixels apart. They now sit in a centered cluster with a maximum width, and
  icons grew from 24px to 28px for distance viewing.
- The active state is one indicator that slides between tabs on a transform
  (compositor-friendly, honours `prefers-reduced-motion`) instead of an element
  appearing and disappearing per tab.

### Density fallout from the larger type, resolved
- The weather card shows four forecast days rather than five: at the 16px floor
  a fifth row overflowed its cell. Content gave way, not the type scale.
- Calendar day cells are the one documented exemption from the 56px control
  floor. A month grid is six rows of squares sized by the grid; forcing 56px
  each stretches the calendar into mostly-empty space with clipped chips (tried,
  looked worse, reverted). They carry a 44px floor, marked with
  `data-calendar-day` in the component and asserted separately in the contract.

### Consolidated the drifted accent palette
- The semantic palette was defined in three places. `packages/design-tokens`
  disagreed with the app on amber, lime, and teal, so runtime code and rendered
  utilities reported different colors and nothing failed.
- The package is now the single source; `lib/colors.ts` re-exports it, and a
  test pins the TS palette to the CSS `--color-*` entries so the two cannot
  drift apart again. (Verified by deliberately reintroducing the drift and
  watching the test fail.)

### Removed dead code and fixed a media inconsistency
- Deleted three tiles left unmounted by an earlier refactor:
  `HandoffSummaryTile`, `PermissionQueueTile`, `DutyLedgerTile`. Their tests
  now exercise `DutyLedger`, which is what actually ships.
- `MediaScreen` read raw `progressMs` while the compact tile smoothed it, so
  the full-screen scrubber jumped a tenth of a track every 10s poll. Both now
  share `useSmoothProgress`.

### Fixed: hourly forecast started at midnight
- `openMeteo.ts` sliced the hourly series from index 0, which is midnight local
  time, so the strip showed 1 AM–5 AM at lunchtime. It now starts at the hour
  containing "now".

### Fixed: calendar event chips clipped mid-glyph
- Day cells are flex containers whose chip list could not shrink, so chips
  overflowed and were sliced by the cell edge on rows 28–31. The list is now a
  `min-h-0` shrinkable child with non-shrinking chips, so a chip is either fully
  visible or cleanly hidden behind the existing "+N" affordance.
