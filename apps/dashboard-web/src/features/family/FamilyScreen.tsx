import { HandoffBoard } from "../handoffs/HandoffBoard";
import { PermissionQueue } from "../permissions/PermissionQueue";
import { DutyLedger } from "../duties/DutyLedger";
import { LaunchSummaryCard } from "../launch/LaunchSummaryCard";

/**
 * The Family screen: the family-coordination modules. Launch has its own tab
 * now — in full it took a full-width row of large step cards and left the board,
 * queue and ledger squeezed into the bottom half — so it appears here as a
 * compact summary that links through, above the handoff board, permission
 * queue, and duty ledger as equal columns.
 * At 2xl the columns are pinned to the remaining height and each scrolls
 * internally; on narrower viewports the grid reflows (two columns at md, one
 * below) and the screen scrolls inside main.
 */
export function FamilyScreen() {
  return (
    <div
      data-testid="family-grid"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:h-full 2xl:grid-cols-3 2xl:grid-rows-[auto_minmax(0,1fr)]"
    >
      <div className="md:col-span-2 2xl:col-span-3">
        <LaunchSummaryCard />
      </div>
      <div className="2xl:min-h-0 2xl:overflow-y-auto">
        <HandoffBoard />
      </div>
      <div className="2xl:min-h-0 2xl:overflow-y-auto">
        <PermissionQueue />
      </div>
      <div className="2xl:min-h-0 2xl:overflow-y-auto">
        <DutyLedger />
      </div>
    </div>
  );
}
