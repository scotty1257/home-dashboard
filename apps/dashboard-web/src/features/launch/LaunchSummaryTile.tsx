import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import { api } from "../../lib/api";
import { useNavStore } from "../../lib/store";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";

/** Shared 1s "now" ticker so countdowns stay live without prop plumbing. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 'Bus in 6 min' countdown label from a departure instant ('Now' once due). */
export function launchCountdown(departureAt: string, now: number): string {
  const msLeft = new Date(departureAt).getTime() - now;
  if (msLeft <= 0) return "Now";
  const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
  return `Bus in ${minutes} min`;
}

/**
 * Today-row tile for the launch sequence. While a run is active it shows the
 * child/template, the live departure countdown, step progress, and a big
 * 'Start launch' button into the full-screen checklist. Outside any active
 * window it stays quiet: 'No launch today' plus the next template, if any.
 */
export function LaunchSummaryTile() {
  const setView = useNavStore((s) => s.setView);
  const { members } = useActiveActor();
  const { data: current } = useQuery({ queryKey: ["launch"], queryFn: () => api.launch.current() });
  const { data: templatesData } = useQuery({
    queryKey: ["launch", "templates"],
    queryFn: () => api.launch.templates(),
  });
  const now = useNow();

  const run = current?.run ?? null;
  const template = current?.template ?? null;
  const activeSteps = (current?.steps ?? []).filter((s) => s.active);
  const completed = run
    ? activeSteps.filter((s) => run.completedStepIds.includes(s.id)).length
    : 0;

  // Quiet hint for the next active template when nothing is running.
  const nextTemplate = (templatesData?.templates ?? [])
    .filter((t) => t.active)
    .sort((a, b) => (a.departureLocalTime < b.departureLocalTime ? -1 : 1))[0];

  const childName = template
    ? (members.find((m) => m.id === template.childId)?.displayName ?? null)
    : null;

  return (
    <Panel
      title="Launch"
      icon={Rocket}
      actions={
        run ? (
          <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-ink-2">
            {completed}/{activeSteps.length}
          </span>
        ) : undefined
      }
    >
      {run && template ? (
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {childName ? `${childName} · ${template.name}` : template.name}
            </p>
            <p className="text-2xl font-semibold text-ink">
              {launchCountdown(run.departureAt, now)}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${activeSteps.length > 0 ? (completed / activeSteps.length) * 100 : 0}%` }}
            />
          </div>
          <TouchButton variant="primary" className="w-full" onClick={() => setView("launch")}>
            Start launch
          </TouchButton>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-3">No launch today</p>
          {nextTemplate && (
            <p className="text-xs text-ink-3">
              Next: {nextTemplate.name} · {nextTemplate.departureLocalTime}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
