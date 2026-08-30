import { HandoffBoard } from "../handoffs/HandoffBoard";
import { PermissionQueue } from "../permissions/PermissionQueue";
import { DutyLedger } from "../duties/DutyLedger";

/**
 * The Family screen: the three coordination modules as equal columns — the
 * full handoff board, the permission queue, and the duty ledger. At 2xl the
 * columns are pinned to the screen height and each scrolls internally; on
 * narrower viewports the grid reflows (two columns at md, one below) and the
 * screen scrolls inside main.
 */
export function FamilyScreen() {
  return (
    <div data-testid="family-grid" className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:h-full 2xl:grid-cols-3 2xl:grid-rows-1">
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
