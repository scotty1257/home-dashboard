# Changelog

Visual design pass on the wall-mounted family dashboard. Entries are newest
first; each corresponds to one focused commit.

## Unreleased

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

### Fixed: hourly forecast started at midnight
- `openMeteo.ts` sliced the hourly series from index 0, which is midnight local
  time, so the strip showed 1 AM–5 AM at lunchtime. It now starts at the hour
  containing "now".

### Fixed: calendar event chips clipped mid-glyph
- Day cells are flex containers whose chip list could not shrink, so chips
  overflowed and were sliced by the cell edge on rows 28–31. The list is now a
  `min-h-0` shrinkable child with non-shrinking chips, so a chip is either fully
  visible or cleanly hidden behind the existing "+N" affordance.
