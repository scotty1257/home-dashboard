import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { api } from "../../lib/api";
import { formatEventTime } from "../../lib/format";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { CATEGORY_LABEL, Chip, decisionLine } from "./PermissionQueue";

interface Props {
  /** Taps navigate to the Family screen; the parent wires this in a later task. */
  onOpen?: () => void;
}

/**
 * Today column tile: the next pending permission request with one-tap
 * Approve/Deny for adults, the latest recent decision for context, and a
 * link through to the full queue on the Family screen.
 */
export function PermissionQueueTile({ onOpen }: Props) {
  const queryClient = useQueryClient();
  const { members, actor } = useActiveActor();
  const isAdult = actor?.role === "adult";

  const { data: queue } = useQuery({ queryKey: ["permissions"], queryFn: () => api.permissions.queue() });
  const pending = queue?.pending ?? [];
  const next = pending[0];
  const latestRecent = queue?.recent?.[0];
  // The server returns decisions oldest-first, so the latest is the last row.
  const latest = latestRecent?.decisions?.[latestRecent.decisions.length - 1];

  const decide = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "approved" | "denied" }) =>
      api.permissions.decide(id, { actorId: actor!.id, outcome }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
  });

  const memberById = (id?: string | null) => members.find((m) => m.id === id);

  return (
    <Panel
      title="Permissions"
      actions={
        <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-ink-2">
          {pending.length}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {next ? (
          <div className="flex flex-col gap-2.5 rounded-md border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{next.question}</p>
                <p className="text-xs text-ink-3">
                  {memberById(next.childId)?.displayName ?? "Child"}
                  {next.occursAt ? ` · ${formatEventTime(next.occursAt)}` : ""}
                </p>
              </div>
              <Chip label={CATEGORY_LABEL[next.category]} className="border-line bg-panel text-ink-3" />
            </div>
            {isAdult ? (
              <div className="flex flex-wrap items-center gap-2">
                <TouchButton
                  variant="primary"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: next.id, outcome: "approved" })}
                >
                  Approve
                </TouchButton>
                <TouchButton
                  variant="danger"
                  icon={X}
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: next.id, outcome: "denied" })}
                >
                  Deny
                </TouchButton>
              </div>
            ) : (
              <p className="text-xs text-ink-3">Adults only</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No pending permissions.</p>
        )}

        {latest && (
          <p className="text-xs text-ink-3">
            {decisionLine(latest, (id) => memberById(id)?.displayName)}
          </p>
        )}

        <TouchButton variant="ghost" icon={ChevronRight} onClick={onOpen} className="self-start">
          View all
        </TouchButton>
      </div>
    </Panel>
  );
}
