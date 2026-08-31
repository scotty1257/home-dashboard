import { cn } from "../../lib/cn";
import { VoiceNoteTile } from "../voice-notes/VoiceNoteTile";
import { WeatherPanel } from "../weather/WeatherPanel";
import { NowPlaying } from "../media/NowPlaying";
import { ActivityFeed } from "./ActivityFeed";
import { CalendarPanel } from "../calendar/CalendarPanel";

/**
 * A grid cell. Below 2xl the cell keeps a comfortable minimum height so the
 * stacked 1-col layout never collapses (main scrolls instead). At 2xl the panel
 * fills its cell exactly: the body becomes a flex column that takes the
 * remaining height, and each panel lays its own content out to fit. Nothing
 * scrolls inside a tile — a panel that needs more room gets a bigger cell, or
 * shows less. (Every tile renders a `section` at its root.)
 */
const CELL =
  "min-h-[300px] 2xl:min-h-0 " +
  "[&>section]:min-h-0 2xl:[&>section]:h-full 2xl:[&>section]:flex " +
  "2xl:[&>section]:flex-col 2xl:[&>section>header]:shrink-0 " +
  "2xl:[&>section>div]:min-h-0 2xl:[&>section>div]:flex-1";

/**
 * The Today screen — the at-a-glance surface for a wall-mounted kiosk. Family
 * coordination (handoffs, permissions, duties, launch) lives on the Family tab;
 * unclaimed-handoff alerts live in the header's notification drawer. What is
 * left is what you actually want to see walking past: weather, the calendar,
 * voice notes, what's playing, and what's next.
 *
 * At 2xl it is a 12-column, 2-row grid. Weather and voice notes sit in the top
 * row, the player and Now & Upcoming beneath them, and the compact calendar
 * runs the full height of the middle column (a month grid needs the vertical
 * room to stay readable). Below 2xl it degrades to a scrollable single-column
 * stack.
 */
export function TodayOverview() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div
        data-testid="today-grid"
        className={cn(
          "grid grid-cols-1 gap-6",
          "2xl:min-h-0 2xl:flex-1 2xl:grid-cols-12 2xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
        )}
      >
        {/* Weather — one cell, with the forecast given room to breathe. */}
        <div className={cn(CELL, "2xl:col-span-4")}>
          <WeatherPanel />
        </div>

        {/* Compact calendar — a single cell. A month grid given the full column
            height just stretches its rows into empty space; half a column with
            dense, readable cells is the better read at a glance. */}
        <div className={cn(CELL, "2xl:col-span-4")}>
          <CalendarPanel compact />
        </div>

        {/* Now & Upcoming — the schedule takes the full right column. It is the
            one tile that genuinely grows: a multi-day horizon with day
            dividers, and an explicit all-clear when there is nothing to show. */}
        <div className={cn(CELL, "2xl:col-span-4 2xl:row-span-2")}>
          <ActivityFeed />
        </div>

        {/* Voice notes — compact until expanded. */}
        <div className={cn(CELL, "min-h-0 2xl:col-span-4")}>
          <VoiceNoteTile />
        </div>

        {/* The player — one cell, sized to its content. */}
        <div className={cn(CELL, "2xl:col-span-4")}>
          <NowPlaying />
        </div>
      </div>
    </div>
  );
}
