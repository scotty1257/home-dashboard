import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Apple,
  Backpack,
  Bath,
  Check,
  Footprints,
  GlassWater,
  RotateCcw,
  Shirt,
  Star,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LaunchIconKey } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useNavStore } from "../../lib/store";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { launchCountdown, useNow } from "./LaunchSummaryTile";
import { useLaunchChime } from "./useLaunchChime";

const STEP_ICONS: Record<LaunchIconKey, LucideIcon> = {
  shoes: Footprints,
  bag: Backpack,
  snack: Apple,
  water: GlassWater,
  jacket: Shirt,
  toilet: Bath,
  custom: Star,
};

/**
 * Full-screen launch sequence: hero countdown up top, large tap-to-toggle
 * step cards in the middle (completed cards grey out with a check but stay
 * tappable to undo), progress + Reset/Exit + chime status at the bottom.
 * Occupies all of main — deliberately no Panel chrome.
 */
export function LaunchScreen() {
  const queryClient = useQueryClient();
  const setView = useNavStore((s) => s.setView);
  const { members, actor } = useActiveActor();
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

  // Chime ack: persist chimePlayedAt the instant the chime starts, then
  // refresh so every kiosk sees it.
  const ack = useCallback(async () => {
    if (!run) return;
    await api.launch.chimePlayed(run.id, actor?.id);
    await queryClient.invalidateQueries({ queryKey: ["launch"] });
  }, [run, actor, queryClient]);

  const { chimeState, enableChime } = useLaunchChime({ run, template, ack });

  const toggle = useMutation({
    mutationFn: ({ stepId }: { stepId: string }) => {
      if (!run || !actor) return Promise.reject(new Error("launch not ready"));
      return api.launch.toggleStep(run.id, stepId, actor.id).then(() => undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["launch"] }),
  });

  const reset = useMutation({
    mutationFn: () => {
      if (!run || !actor) return Promise.reject(new Error("launch not ready"));
      return api.launch.reset(run.id, actor.id).then(() => undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["launch"] }),
  });

  const onReset = useCallback(() => {
    if (!run || !actor) return;
    if (!window.confirm("Reset today's launch checklist?")) return;
    reset.mutate();
  }, [run, actor, reset]);

  if (!run) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg text-ink-3">No launch right now</p>
        <TouchButton variant="soft" icon={X} onClick={() => setView("today")}>
          Exit
        </TouchButton>
      </div>
    );
  }

  const hero = allDone ? "Complete" : launchCountdown(run.departureAt, now);
  const childName = template
    ? (members.find((m) => m.id === template.childId)?.displayName ?? null)
    : null;

  return (
    <div data-testid="launch-root" className="flex h-full flex-col gap-6">
      {/* Top: who is launching + hero countdown */}
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink-3">
          {childName ?? "Child"} · {template?.name ?? "Launch"}
        </p>
        <p className="text-4xl font-semibold tracking-tight text-ink">{hero}</p>
      </header>

      {/* Center: large step cards */}
      <div className="grid flex-1 content-start gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {activeSteps.map((step) => {
          const Icon = STEP_ICONS[step.icon] ?? Star;
          const done = completedIds.includes(step.id);
          return (
            <button
              key={step.id}
              type="button"
              aria-pressed={done}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ stepId: step.id })}
              className={cn(
                "relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4",
                "select-none transition-all duration-100 active:translate-y-px focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent-2/60 disabled:pointer-events-none",
                done ? "opacity-35 grayscale" : "hover:bg-raised",
              )}
            >
              <Icon size={44} strokeWidth={1.75} aria-hidden />
              <span className="text-xl font-medium text-ink">{step.label}</span>
              {done && (
                <span
                  data-check
                  aria-hidden
                  className="absolute right-3 top-3 inline-flex rounded-full bg-accent p-1.5 text-white"
                >
                  <Check size={18} strokeWidth={2.5} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom: progress, controls, chime status */}
      <footer className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${activeSteps.length > 0 ? (completed / activeSteps.length) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-sm font-medium text-ink-2">
            {completed}/{activeSteps.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-h-12 items-center">
            {run.chimePlayedAt != null || chimeState === "played" ? (
              <p className="text-xs text-ink-3">Chime played</p>
            ) : chimeState === "blocked" ? (
              <TouchButton variant="primary" onClick={enableChime}>
                Tap to enable chime
              </TouchButton>
            ) : chimeState === "armed" ? (
              <p className="text-xs text-ink-3">Chime ready</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <TouchButton variant="danger" icon={RotateCcw} disabled={reset.isPending} onClick={onReset}>
              Reset
            </TouchButton>
            <TouchButton variant="soft" icon={X} onClick={() => setView("today")}>
              Exit
            </TouchButton>
          </div>
        </div>
      </footer>
    </div>
  );
}
