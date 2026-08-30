import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import type { HandoffBoardItem } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { formatEventTime } from "../../lib/format";
import { useNavStore } from "../../lib/store";
import { TouchButton } from "../../components/TouchButton";
import { cn } from "../../lib/cn";

/** Attention states that need an adult's decision to appear in the banner. */
const ATTENTIVE: readonly HandoffBoardItem["attentionState"][] = ["night-before", "urgent"];

/** Urgent rows list above night-before rows. */
function attentionRank(item: HandoffBoardItem): number {
  return item.attentionState === "urgent" ? 0 : 1;
}

/** One sentence per attention state: what is still unclaimed, and when. */
function message(item: HandoffBoardItem): string {
  const title = item.eventSummary?.title ?? "Handoff";
  if (item.attentionState === "urgent") return `Now: ${title} unclaimed`;
  return `Tomorrow's ${formatEventTime(item.startsAt)} ${title} is still unclaimed`;
}

/**
 * The Today screen's top banner: unclaimed handoffs that need an adult
 * tonight or right now. Renders nothing when the household is on top of
 * things; pushes the Today grid down (no overlay) when it has something
 * to say. Rows dismiss individually until new items arrive.
 */
export function FamilyAlertBanner() {
  const setView = useNavStore((s) => s.setView);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const { data: board } = useQuery({ queryKey: ["handoffs"], queryFn: () => api.handoffs.board() });

  const alerts = (board?.items ?? [])
    .filter(
      (item) =>
        item.status === "unclaimed" &&
        ATTENTIVE.includes(item.attentionState) &&
        !dismissed.has(item.id),
    )
    .sort((a, b) => attentionRank(a) - attentionRank(b));

  if (alerts.length === 0) return null;

  return (
    <section aria-label="Family alerts" className="flex flex-col gap-2">
      {alerts.map((item) => {
        const urgent = item.attentionState === "urgent";
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              "flex items-center gap-3 rounded-md border px-4 py-2",
              urgent ? "border-danger/50 bg-danger/10" : "border-warning/50 bg-warning/10",
            )}
          >
            <AlertTriangle
              size={18}
              className={cn("shrink-0", urgent ? "text-danger" : "text-warning")}
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{message(item)}</p>
            <TouchButton variant="primary" onClick={() => setView("family")}>
              Go to Family
            </TouchButton>
            <TouchButton
              variant="ghost"
              icon={X}
              iconOnly
              aria-label="Dismiss"
              onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
            />
          </div>
        );
      })}
    </section>
  );
}
