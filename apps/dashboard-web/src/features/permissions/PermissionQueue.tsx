import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Plus, RotateCcw, ScrollText, X } from "lucide-react";
import type {
  PermissionCategory,
  PermissionDecision,
  PermissionRequest,
  PermissionRequestWithDecisions,
  PermissionStatus,
} from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatEventTime } from "../../lib/format";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { PermissionRequestSheet } from "./PermissionRequestSheet";
import { StandingRulesSheet } from "./StandingRulesSheet";

export const CATEGORY_LABEL: Record<PermissionCategory, string> = {
  sleepover: "Sleepover",
  "screen-time": "Screen time",
  ride: "Ride",
  purchase: "Purchase",
  outing: "Outing",
  school: "School",
  other: "Other",
};

const OUTCOME_LABEL: Record<PermissionDecision["outcome"], string> = {
  approved: "Approved",
  denied: "Denied",
  reopened: "Reopened",
};

const STATUS_LABEL: Record<PermissionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired",
};

const STATUS_CHIP: Record<PermissionStatus, string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  approved: "border-success/40 bg-success/10 text-success",
  denied: "border-danger/40 bg-danger/10 text-danger",
  expired: "border-line bg-surface text-ink-3",
};

/** Resolves member names for decision lines ("Approved by You, 6:12 PM"). */
type NameOf = (id?: string | null) => string | undefined;

/**
 * One decision as a readable line: "Approved by You, 6:12 PM". Decisions made
 * by the rules engine carry no member id, so they read "Approved automatically".
 */
export function decisionLine(decision: PermissionDecision, nameOf: NameOf): string {
  const label = OUTCOME_LABEL[decision.outcome];
  const time = formatEventTime(decision.decidedAt);
  const name = nameOf(decision.decidedBy);
  if (name) return `${label} by ${name}, ${time}`;
  if (decision.source === "standing-rule") return `${label} automatically, ${time}`;
  return `${label}, ${time}`;
}

/** Small labeled chip — color + text together, never color alone. */
export function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-meta font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}

interface PendingCardProps {
  request: PermissionRequest;
  memberById: (id?: string | null) => { displayName: string } | undefined;
  isAdult: boolean;
  decidePending: boolean;
  onDecide: (request: PermissionRequest, outcome: "approved" | "denied") => void;
}

function PendingCard({ request, memberById, isAdult, decidePending, onDecide }: PendingCardProps) {
  const child = memberById(request.childId)?.displayName ?? "Child";
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body-lg font-semibold text-ink">{request.question}</h3>
          <p className="text-body text-ink-3">
            {child}
            {request.occursAt ? ` · ${formatEventTime(request.occursAt)}` : ""}
          </p>
        </div>
        <Chip label={CATEGORY_LABEL[request.category]} className="border-line bg-panel text-ink-3" />
      </div>

      {request.ruleConflict && (
        <div
          data-conflict
          className="flex items-start gap-2 rounded-inner border border-warning/30 bg-warning/10 p-2.5 text-body text-warning"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{request.ruleConflict}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isAdult ? (
          <>
            <TouchButton
              variant="primary"
              icon={Check}
              disabled={decidePending}
              onClick={() => onDecide(request, "approved")}
            >
              Approve
            </TouchButton>
            <TouchButton
              variant="danger"
              icon={X}
              disabled={decidePending}
              onClick={() => onDecide(request, "denied")}
            >
              Deny
            </TouchButton>
          </>
        ) : (
          <span className="text-meta text-ink-3">Adults only</span>
        )}
      </div>
    </article>
  );
}

interface RecentCardProps {
  request: PermissionRequestWithDecisions;
  nameOf: NameOf;
  ruleById: (id?: string | null) => { name: string } | undefined;
}

function RecentCard({ request, nameOf, ruleById }: RecentCardProps) {
  // The server returns decisions oldest-first, so the latest is the last row.
  const latest = request.decisions[request.decisions.length - 1];
  const wasReopened = request.decisions.some((d) => d.outcome === "reopened");

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-body font-semibold text-ink">{request.question}</h3>
          <p className="text-meta text-ink-3">
            {nameOf(request.childId) ?? "Child"} · {CATEGORY_LABEL[request.category]}
          </p>
        </div>
        <Chip label={STATUS_LABEL[request.status]} className={STATUS_CHIP[request.status]} />
      </div>

      {wasReopened ? (
        // Reopened requests keep their whole history: every prior decision stays
        // visible in order, with the reopen itself marked.
        <ul aria-label="Decision history" className="flex flex-col gap-1">
          {request.decisions.map((decision) => (
            <li key={decision.id} className="flex items-center gap-1.5 text-body text-ink-3">
              {decision.outcome === "reopened" && (
                <RotateCcw size={14} className="shrink-0" aria-hidden />
              )}
              <span>{decisionLine(decision, nameOf)}</span>
            </li>
          ))}
        </ul>
      ) : (
        latest && (
          <>
            <p className="text-body text-ink-2">{decisionLine(latest, nameOf)}</p>
            {latest.source === "standing-rule" && latest.ruleId && (
              <p className="text-meta text-ink-3">
                Standing rule · {ruleById(latest.ruleId)?.name ?? "removed rule"}
              </p>
            )}
          </>
        )
      )}
    </article>
  );
}

/**
 * The Family column's permission queue: pending requests as actionable cards
 * (approve/deny, adults only), recent decisions with provenance, and the
 * sheets for filing a new request or managing standing rules.
 */
export function PermissionQueue() {
  const queryClient = useQueryClient();
  const { members, actor } = useActiveActor();
  const isAdult = actor?.role === "adult";

  const { data: queue } = useQuery({ queryKey: ["permissions"], queryFn: () => api.permissions.queue() });
  const { data: rulesData } = useQuery({
    queryKey: ["permission-rules"],
    queryFn: () => api.permissionRules.list(),
  });

  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [rulesSheetOpen, setRulesSheetOpen] = useState(false);

  const decide = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "approved" | "denied" }) =>
      api.permissions.decide(id, { actorId: actor!.id, outcome }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
  });

  const pending = queue?.pending ?? [];
  const recent = queue?.recent ?? [];
  const rules = rulesData?.rules ?? [];
  const memberById = (id?: string | null) => members.find((m) => m.id === id);
  const ruleById = (id?: string | null) => rules.find((r) => r.id === id);
  const nameOf: NameOf = (id) => memberById(id)?.displayName;

  return (
    <Panel title="Permissions">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <TouchButton variant="soft" icon={Plus} onClick={() => setRequestSheetOpen(true)}>
            New request
          </TouchButton>
          <TouchButton variant="ghost" icon={ScrollText} onClick={() => setRulesSheetOpen(true)}>
            Standing rules
          </TouchButton>
        </div>

        <section className="flex flex-col gap-3" aria-label="Pending requests">
          <h3 className="text-body font-semibold text-ink-2">Pending</h3>
          {pending.length === 0 && <p className="text-body text-ink-3">No pending requests.</p>}
          {pending.map((request) => (
            <PendingCard
              key={request.id}
              request={request}
              memberById={memberById}
              isAdult={isAdult}
              decidePending={decide.isPending}
              onDecide={(r, outcome) => decide.mutate({ id: r.id, outcome })}
            />
          ))}
        </section>

        <section className="flex flex-col gap-3" aria-label="Recent decisions">
          <h3 className="text-body font-semibold text-ink-2">
            Recent decisions
          </h3>
          {recent.length === 0 && <p className="text-body text-ink-3">No decisions yet.</p>}
          {recent.map((request) => (
            <RecentCard key={request.id} request={request} nameOf={nameOf} ruleById={ruleById} />
          ))}
        </section>
      </div>

      <PermissionRequestSheet open={requestSheetOpen} onClose={() => setRequestSheetOpen(false)} />
      <StandingRulesSheet open={rulesSheetOpen} onClose={() => setRulesSheetOpen(false)} />
    </Panel>
  );
}
