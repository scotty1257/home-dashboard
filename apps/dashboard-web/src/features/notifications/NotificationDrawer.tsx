import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellOff, X } from "lucide-react";
import type { HandoffBoardItem } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { formatEventTime } from "../../lib/format";
import { useNavStore, useNotificationStore } from "../../lib/store";
import { TouchButton } from "../../components/TouchButton";
import { cn } from "../../lib/cn";

/** Attention states that need an adult's decision to count as a notification. */
const ATTENTIVE: readonly HandoffBoardItem["attentionState"][] = ["night-before", "urgent"];

/** Urgent rows list above night-before rows. */
function attentionRank(item: HandoffBoardItem): number {
  return item.attentionState === "urgent" ? 0 : 1;
}

/** One sentence per attention state: what is still unclaimed, and when. */
export function message(item: HandoffBoardItem): string {
  const title = item.eventSummary?.title ?? "Handoff";
  if (item.attentionState === "urgent") return `Now: ${title} unclaimed`;
  return `Tomorrow's ${formatEventTime(item.startsAt)} ${title} is still unclaimed`;
}

/** An alert plus how many identical obligations it stands for. */
export interface Notification {
  item: HandoffBoardItem;
  /** Handoffs collapsed into this row (1 when nothing was merged). */
  count: number;
}

/**
 * The unclaimed handoffs that need an adult tonight or right now. This used to
 * be a stack of full-width banners on the Today screen, which pushed the grid
 * down. Handoffs that say the same thing — the same pickup entered twice, or a
 * recurring series — collapse into one row with a count, so a single school run
 * can never fill the drawer.
 */
export function useNotifications(): Notification[] {
  const { data: board } = useQuery({ queryKey: ["handoffs"], queryFn: () => api.handoffs.board() });

  const attentive = (board?.items ?? [])
    .filter((item) => item.status === "unclaimed" && ATTENTIVE.includes(item.attentionState))
    .sort((a, b) => attentionRank(a) - attentionRank(b));

  const grouped = new Map<string, Notification>();
  for (const item of attentive) {
    const key = message(item);
    const seen = grouped.get(key);
    if (seen) seen.count += 1;
    else grouped.set(key, { item, count: 1 });
  }
  return [...grouped.values()];
}

/**
 * Slide-over notification drawer, mounted globally and toggled from the header
 * bell. Closes on backdrop tap or Escape, matching the bottom Sheet.
 */
export function NotificationDrawer() {
  const open = useNotificationStore((s) => s.open);
  const setOpen = useNotificationStore((s) => s.setOpen);
  const setView = useNavStore((s) => s.setView);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const alerts = useNotifications().filter(({ item }) => !dismissed.has(item.id));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onPointerDown={() => setOpen(false)}
      role="presentation"
    >
      <aside
        className={cn(
          "flex h-full w-full max-w-[420px] flex-col border-l border-line bg-panel shadow-2xl backdrop-blur-md",
          "animate-[slideInRight_0.22s_cubic-bezier(0.22,1,0.36,1)]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="text-metric font-semibold text-ink">Notifications</h2>
          <TouchButton
            variant="ghost"
            icon={X}
            iconOnly
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BellOff size={32} strokeWidth={1.5} className="text-ink-4" aria-hidden />
              <p className="text-body text-ink-3">Nothing needs an adult right now.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {alerts.map(({ item, count }) => {
                const urgent = item.attentionState === "urgent";
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-inner border p-4",
                      urgent ? "border-danger/50 bg-danger/10" : "border-warning/50 bg-warning/10",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        size={20}
                        className={cn("mt-0.5 shrink-0", urgent ? "text-danger" : "text-warning")}
                        aria-hidden
                      />
                      <p className="min-w-0 flex-1 text-body font-medium text-ink">
                        {message(item)}
                        {count > 1 && (
                          <span className="ml-2 rounded-pill bg-raised px-2 py-0.5 text-meta font-semibold text-ink-2">
                            ×{count}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TouchButton
                        variant="primary"
                        onClick={() => {
                          setView("family");
                          setOpen(false);
                        }}
                      >
                        Go to Family
                      </TouchButton>
                      <TouchButton
                        variant="ghost"
                        onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
                      >
                        Dismiss
                      </TouchButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
