import { cn } from "../../lib/cn";
import { VoiceNoteTile } from "../voice-notes/VoiceNoteTile";
import { WeatherPanel } from "../weather/WeatherPanel";
import { NowPlaying } from "../media/NowPlaying";
import { ActivityFeed } from "./ActivityFeed";
import { WeekAgendaPanel } from "../calendar/WeekAgendaPanel";

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
 * row, the player and Now & Upcoming beneath them, and the week agenda runs the
 * full height of the right column — a vertical list of the next seven days is
 * what actually needs that height. Below 2xl it degrades to a scrollable
 * single-column stack.
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

        {/* Now & Upcoming — a single cell. It shows what is imminent, which is
            a short list by definition; it does not need a full column. */}
        <div className={cn(CELL, "2xl:col-span-4")}>
          <ActivityFeed />
        </div>

        {/* The week ahead — takes the full right column. Seven stacked days
            with their events is the tile that genuinely uses the height. */}
        <div className={cn(CELL, "2xl:col-span-4 2xl:row-span-2")}>
          <WeekAgendaPanel />
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
