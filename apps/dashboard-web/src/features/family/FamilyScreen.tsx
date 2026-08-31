import { HandoffBoard } from "../handoffs/HandoffBoard";
import { PermissionQueue } from "../permissions/PermissionQueue";
import { DutyLedger } from "../duties/DutyLedger";
import { LaunchScreen } from "../launch/LaunchScreen";

/**
 * The Family screen: every family-coordination module, and the only place they
 * live. The launch sequence takes a full-width row up top — it is the most
 * time-critical thing here and needs the room for its step cards — with the
 * handoff board, permission queue, and duty ledger as equal columns beneath it.
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
        <LaunchScreen />
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
