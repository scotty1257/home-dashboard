import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, FileText, Moon, MoonStar, Plus, Shirt, Star, Stethoscope, Trash2, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DutyIconKey, DutySummary, DutyTally, HouseholdMember } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatEventTime } from "../../lib/format";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { DutyEditorSheet } from "./DutyEditorSheet";

/** Lucide icon rendered for each DutyIconKey. */
export const DUTY_ICONS: Record<DutyIconKey, LucideIcon> = {
  bedtime: Moon,
  "school-run": Bus,
  dentist: Stethoscope,
  "permission-slip": FileText,
  "night-wake": MoonStar,
  trash: Trash2,
  dishes: Utensils,
  laundry: Shirt,
  custom: Star,
};

/** Human labels for the icon picker (and anywhere a key needs rendering). */
export const DUTY_ICON_LABELS: Record<DutyIconKey, string> = {
  bedtime: "Bedtime",
  "school-run": "School run",
  dentist: "Dentist",
  "permission-slip": "Permission slip",
  "night-wake": "Night wake-up",
  trash: "Trash",
  dishes: "Dishes",
  laundry: "Laundry",
  custom: "Custom",
};

/** 'You 3 · Partner 5' — per-adult counts inside the selected window. */
export function dutyCountsLabel(tally: DutyTally): string {
  return tally.counts.map((c) => `${c.displayName} ${c.count}`).join(" · ");
}

/** 'Partner — last 4 in a row', shown only from a streak of 3 upward. */
export function dutyStreakLabel(tally: DutyTally): string | null {
  if (!tally.streak || tally.streak.count < 3) return null;
  return `${tally.streak.displayName} — last ${tally.streak.count} in a row`;
}

/** How long the undo toast sticks around after a quick-log. */
const UNDO_WINDOW_MS = 10_000;

interface DutyGridProps {
  summary: DutySummary | undefined;
  actor: HouseholdMember | null;
}

/**
 * The shared quick-log grid. Tapping a card logs the duty as the ACTIVE ADULT
 * (children see read-only cards plus a hint), then offers a 10-second undo
 * toast for fat-fingered taps. Per-duty facts only — no totals, no winner.
 */
export function DutyGrid({ summary, actor }: DutyGridProps) {
  const queryClient = useQueryClient();
  const isAdult = actor?.role === "adult";
  const [toast, setToast] = useState<{ dutyName: string; entryId: string } | null>(null);

  // The toast auto-dismisses; the timer is cleared on unmount or replacement.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const log = useMutation({
    mutationFn: (tally: DutyTally) =>
      api.duties.logEntry({ dutyId: tally.dutyId, performedBy: actor!.id }),
    onSuccess: (entry, tally) => {
      queryClient.invalidateQueries({ queryKey: ["duties"] });
      setToast({ dutyName: tally.name, entryId: entry.id });
    },
  });

  const undo = useMutation({
    mutationFn: (entryId: string) => api.duties.undoEntry(entryId, actor!.id),
    onSuccess: () => {
      setToast(null);
      queryClient.invalidateQueries({ queryKey: ["duties"] });
    },
  });

  const duties = summary?.duties ?? [];

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3" aria-label="Duty quick-log">
        {duties.map((tally) => {
          const Icon = DUTY_ICONS[tally.icon] ?? Star;
          const counts = dutyCountsLabel(tally);
          const streak = dutyStreakLabel(tally);
          const cardBody = (
            <>
              <Icon size={20} strokeWidth={2} aria-hidden style={{ color: `var(--color-${tally.color})` }} />
              <span className="w-full truncate text-sm font-semibold text-ink">{tally.name}</span>
              {counts && <span className="w-full truncate text-xs text-ink-3">{counts}</span>}
              {streak && <span className="w-full truncate text-xs font-medium text-accent-2">{streak}</span>}
            </>
          );
          const cardClass =
            "flex min-h-12 w-full flex-col items-start gap-1 rounded-lg border border-line bg-surface p-3 text-left";
          return (
            <li key={tally.dutyId}>
              {isAdult ? (
                <button
                  type="button"
                  disabled={log.isPending}
                  className={cn(cardClass, "transition-colors hover:bg-raised active:translate-y-px")}
                  onClick={() => log.mutate(tally)}
                >
                  {cardBody}
                </button>
              ) : (
                <div className={cn(cardClass, "opacity-80")}>{cardBody}</div>
              )}
            </li>
          );
        })}
      </ul>

      {!isAdult && <p className="text-xs text-ink-3">Adults only</p>}

      {toast && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-2"
        >
          <p className="min-w-0 truncate text-sm text-ink">Logged {toast.dutyName}</p>
          <TouchButton
            variant="soft"
            disabled={undo.isPending}
            onClick={() => undo.mutate(toast.entryId)}
          >
            Undo
          </TouchButton>
        </div>
      )}
    </div>
  );
}

/**
 * The Family column's duty ledger: the same quick-log grid as the Today tile,
 * the recent history list, and (for adults) duty management via the editor
 * sheet. Per-duty facts only — deliberately no household total or winner.
 */
export function DutyLedger() {
  const { actor } = useActiveActor();
  const isAdult = actor?.role === "adult";
  const [editorOpen, setEditorOpen] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["duties", 30],
    queryFn: () => api.duties.summary(30),
  });

  const recent = summary?.recentEntries ?? [];

  return (
    <Panel
      title="Duties"
      actions={
        <TouchButton
          variant="soft"
          icon={Plus}
          disabled={!isAdult}
          onClick={() => setEditorOpen(true)}
        >
          Add duty
        </TouchButton>
      }
    >
      <div className="flex flex-col gap-4">
        <DutyGrid summary={summary} actor={actor} />

        <section className="flex flex-col gap-1.5" aria-label="Recent duty log">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">Recent</h3>
          {recent.length === 0 && <p className="text-sm text-ink-3">No duties logged yet.</p>}
          <ul className="flex flex-col gap-1">
            {recent.map((entry) => (
              <li key={entry.id} className="flex min-h-12 items-center rounded-md px-2 text-sm">
                {/* One readable line: "<Performer> logged <Duty> at <time>". */}
                <span className="min-w-0 truncate text-ink-2">
                  {`${entry.performerName} logged ${entry.dutyName} at ${formatEventTime(entry.occurredAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <DutyEditorSheet open={editorOpen} onClose={() => setEditorOpen(false)} />
    </Panel>
  );
}
