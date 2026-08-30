import { useNavStore } from "../../lib/store";
import { cn } from "../../lib/cn";
import { HandoffSummaryTile } from "../handoffs/HandoffSummaryTile";
import { PermissionQueueTile } from "../permissions/PermissionQueueTile";
import { VoiceNoteTile } from "../voice-notes/VoiceNoteTile";
import { LaunchSummaryTile } from "../launch/LaunchSummaryTile";
import { DutyLedgerTile } from "../duties/DutyLedgerTile";
import { ContextRail } from "./ContextRail";

/**
 * A grid cell. Below 2xl the cell keeps a comfortable minimum height so the
 * stacked 1-col layout never collapses (main scrolls instead). At 2xl the
 * cell is pinned to its grid row and the tile inside is pinned to the cell —
 * the panel body scrolls internally, so no panel extends below main at
 * 1920×1080. (Every tile renders a `section` at its root.)
 */
const CELL =
  "min-h-[300px] 2xl:min-h-0 " +
  "[&>section]:min-h-0 2xl:[&>section]:h-full 2xl:[&>section]:flex " +
  "2xl:[&>section]:flex-col 2xl:[&>section>header]:shrink-0 " +
  "2xl:[&>section>div]:min-h-0 2xl:[&>section>div]:flex-1 2xl:[&>section>div]:overflow-y-auto";

/**
 * The Today screen: a 12-column, 2-row grid at 2xl — handoffs, permissions,
 * and voice notes on the first row; launch, duties, and the context rail on
 * the second. Below 2xl it degrades to a scrollable single-column stack.
 */
export function TodayOverview() {
  const setView = useNavStore((s) => s.setView);

  return (
    <div className="grid grid-cols-1 gap-6 2xl:h-full 2xl:grid-cols-12 2xl:grid-rows-2">
      {/* Row 1: coordination summaries + the voice note drop. */}
      <div className={cn(CELL, "2xl:col-span-5")}>
        <HandoffSummaryTile onOpen={() => setView("family")} />
      </div>
      <div className={cn(CELL, "2xl:col-span-4")}>
        <PermissionQueueTile onOpen={() => setView("family")} />
      </div>
      <div className={cn(CELL, "2xl:col-span-3")}>
        <VoiceNoteTile />
      </div>

      {/* Row 2: launch + duties + the weather/media/activity context rail. */}
      <div className={cn(CELL, "2xl:col-span-5")}>
        <LaunchSummaryTile />
      </div>
      <div className={cn(CELL, "2xl:col-span-4")}>
        <DutyLedgerTile onOpen={() => setView("family")} />
      </div>
      <div className="min-h-[300px] 2xl:min-h-0 2xl:col-span-3">
        <ContextRail />
      </div>
    </div>
  );
}
