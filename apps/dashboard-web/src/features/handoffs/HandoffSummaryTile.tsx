import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  LifeBuoy,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HandoffBoardItem, HandoffStatus } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { formatEventTime } from "../../lib/format";
import { Panel } from "../../components/Panel";

const STATUS_LABEL: Record<HandoffStatus, string> = {
  unclaimed: "Unclaimed",
  claimed: "Claimed",
  "backup-requested": "Backup",
  resolved: "Resolved",
};

const ATTENTION_LABEL: Record<HandoffBoardItem["attentionState"], string> = {
  planned: "Planned",
  "night-before": "Night before",
  urgent: "Urgent",
  resolved: "Resolved",
};

const STATUS_ICON: Record<HandoffStatus, LucideIcon> = {
  unclaimed: HelpCircle,
  claimed: UserCheck,
  "backup-requested": LifeBuoy,
  resolved: CheckCircle2,
};

/** Row icon: conflicts warn, unclaimed items ask, the rest confirm. */
function rowIcon(item: HandoffBoardItem): { icon: LucideIcon; className: string } {
  if (item.conflictReason) return { icon: AlertTriangle, className: "text-warning shrink-0" };
  if (item.status === "unclaimed") return { icon: HelpCircle, className: "text-warning shrink-0" };
  if (item.status === "resolved") return { icon: CheckCircle2, className: "text-success shrink-0" };
  return { icon: STATUS_ICON[item.status], className: "text-ink-3 shrink-0" };
}

interface Props {
  /** Taps navigate to the Family screen; the parent wires this in a later task. */
  onOpen?: () => void;
}

/** Today column summary: the three most pressing handoffs at a glance. */
export function HandoffSummaryTile({ onOpen }: Props) {
  const { data: board } = useQuery({ queryKey: ["handoffs"], queryFn: () => api.handoffs.board() });
  const items = board?.items ?? [];
  const top = items.slice(0, 3);

  return (
    <Panel
      title="Handoffs"
      actions={
        <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-ink-2">
          {items.length}
        </span>
      }
    >
      {top.length === 0 ? (
        <p className="text-sm text-ink-3">No handoffs coming up.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {top.map((item) => {
            const { icon: Icon, className } = rowIcon(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={onOpen}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-raised"
                >
                  <Icon size={16} className={className} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {item.eventSummary?.title ?? "Handoff"}
                      </span>
                      <span className="shrink-0 text-xs text-ink-3">
                        {formatEventTime(item.startsAt, item.eventSummary?.allDay ?? false)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-ink-3">
                      <span className="shrink-0 font-medium">{STATUS_LABEL[item.status]}</span>
                      {item.attentionState !== "planned" && (
                        <span className="shrink-0 font-medium text-warning">
                          {ATTENTION_LABEL[item.attentionState]}
                        </span>
                      )}
                      {item.conflictReason && (
                        <span className="truncate">{item.conflictReason}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
