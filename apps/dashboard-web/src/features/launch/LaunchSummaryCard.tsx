import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Rocket } from "lucide-react";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { useNavStore } from "../../lib/store";
import { useActiveActor } from "../household/ActorSwitcher";
import { launchCountdown, useNow } from "./launchTime";

/**
 * The Family screen's launch entry: who is launching, how long they have, and
 * how far through the checklist they are — then a way through to the Launch
 * screen itself.
 *
 * Launch used to render in full here, as a full-width row of large step cards
 * above the three coordination modules, which left the board, queue and ledger
 * fighting over the bottom half of the page.
 */
export function LaunchSummaryCard() {
  const { members } = useActiveActor();
  const setView = useNavStore((s) => s.setView);
  const { data } = useQuery({ queryKey: ["launch"], queryFn: () => api.launch.current() });
  const now = useNow();

  const run = data?.run ?? null;
  const template = data?.template ?? null;
  const activeSteps = (data?.steps ?? []).filter((s) => s.active);
  const completedIds = run?.completedStepIds ?? [];
  const completed = activeSteps.filter((s) => completedIds.includes(s.id)).length;
  const allDone =
    run != null &&
    (run.status === "complete" || (activeSteps.length > 0 && completed === activeSteps.length));

  const childName = template
    ? (members.find((m) => m.id === template.childId)?.displayName ?? null)
    : null;

  const open = (
    <TouchButton variant="ghost" icon={ChevronRight} onClick={() => setView("launch")}>
      Open
    </TouchButton>
  );

  if (!run) {
    return (
      <Panel title="Launch" icon={Rocket} actions={open}>
        <p className="py-2 text-body text-ink-3">No launch right now</p>
      </Panel>
    );
  }

  return (
    <Panel title="Launch" icon={Rocket} accent="accent" actions={open}>
      <div className="flex flex-col gap-3">
        <p className="text-body text-ink-3">
          {childName ?? "Child"} · {template?.name ?? "Launch"}
        </p>
        <p className="text-countdown font-semibold tracking-tight text-ink">
          {allDone ? "Complete" : launchCountdown(run.departureAt, now)}
        </p>
        <div className="flex items-center gap-3">
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface">
            <div
              className="h-full rounded-pill bg-accent transition-[width] duration-[var(--dur-base)]"
              style={{
                width: `${activeSteps.length > 0 ? (completed / activeSteps.length) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-body font-medium tabular-nums text-ink-2">
            {completed}/{activeSteps.length}
          </span>
        </div>
      </div>
    </Panel>
  );
}
