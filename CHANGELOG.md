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

### Fixed: hourly forecast started at midnight
- `openMeteo.ts` sliced the hourly series from index 0, which is midnight local
  time, so the strip showed 1 AM–5 AM at lunchtime. It now starts at the hour
  containing "now".

### Fixed: calendar event chips clipped mid-glyph
- Day cells are flex containers whose chip list could not shrink, so chips
  overflowed and were sliced by the cell edge on rows 28–31. The list is now a
  `min-h-0` shrinkable child with non-shrinking chips, so a chip is either fully
  visible or cleanly hidden behind the existing "+N" affordance.
