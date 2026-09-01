import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  LifeBuoy,
  MoonStar,
  Phone,
  Plus,
  UserCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  BackupContact,
  HandoffBoardItem,
  HandoffStatus,
  HouseholdMember,
} from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatEventTime } from "../../lib/format";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { HandoffEditorSheet } from "./HandoffEditorSheet";

const STATUS_LABEL: Record<HandoffStatus, string> = {
  unclaimed: "Unclaimed",
  claimed: "Claimed",
  "backup-requested": "Backup",
  resolved: "Resolved",
};

const STATUS_CHIP: Record<HandoffStatus, { icon: LucideIcon; className: string }> = {
  unclaimed: { icon: HelpCircle, className: "border-warning/40 bg-warning/10 text-warning" },
  claimed: { icon: UserCheck, className: "border-accent-2/40 bg-accent-soft text-accent-2" },
  "backup-requested": { icon: LifeBuoy, className: "border-violet/40 bg-violet/10 text-violet" },
  resolved: { icon: CheckCircle2, className: "border-success/40 bg-success/10 text-success" },
};

/**
 * Attention states are conveyed by icon + text + color together — never color
 * alone — so each chip carries its own label.
 */
const ATTENTION_CHIP: Record<HandoffBoardItem["attentionState"], { icon: LucideIcon; label: string; className: string }> = {
  planned: { icon: CircleDashed, label: "Planned", className: "border-line bg-surface text-ink-3" },
  "night-before": { icon: MoonStar, label: "Night before", className: "border-warning/40 bg-warning/10 text-warning" },
  urgent: { icon: AlertTriangle, label: "Urgent", className: "border-danger/40 bg-danger/10 text-danger" },
  resolved: { icon: CheckCircle2, label: "Resolved", className: "border-success/40 bg-success/10 text-success" },
};

function Chip({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-pill border px-2 py-0.5 text-meta font-medium",
        className,
      )}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

interface CardProps {
  item: HandoffBoardItem;
  memberById: (id?: string | null) => HouseholdMember | undefined;
  isAdult: boolean;
  claimPending: boolean;
  resolvePending: boolean;
  onClaim: (item: HandoffBoardItem) => void;
  onResolve: (item: HandoffBoardItem) => void;
  onRequestBackup: (item: HandoffBoardItem) => void;
}

function ObligationCard({
  item,
  memberById,
  isAdult,
  claimPending,
  resolvePending,
  onClaim,
  onResolve,
  onRequestBackup,
}: CardProps) {
  const weekday = new Date(item.startsAt).toLocaleDateString(undefined, { weekday: "long" });
  const time = formatEventTime(item.startsAt, item.eventSummary?.allDay ?? false);
  const status = STATUS_LABEL[item.status];
  const statusChip = STATUS_CHIP[item.status];
  const attention = ATTENTION_CHIP[item.attentionState];

  const subtitle =
    item.status === "unclaimed"
      ? `Unclaimed · ${weekday} · ${time}`
      : item.status === "claimed" && item.assignee
        ? `Claimed by ${item.assignee.displayName} · ${weekday} · ${time}`
        : `${status} · ${weekday} · ${time}`;

  const showClaim = item.status === "unclaimed";
  const showResolve = item.status === "claimed" || item.status === "backup-requested";
  const showBackup = item.status !== "resolved";

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-body-lg font-semibold text-ink">
            {item.eventSummary?.title ?? "Handoff"}
          </h3>
          <p className="text-body text-ink-3">{subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Chip icon={statusChip.icon} label={status} className={statusChip.className} />
          {item.attentionState !== "planned" && (
            <Chip icon={attention.icon} label={attention.label} className={attention.className} />
          )}
        </div>
      </div>

      {item.conflictReason && (
        <div
          data-conflict
          className="flex items-start gap-2 rounded-inner border border-danger/30 bg-danger/10 p-2.5 text-body text-danger"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{item.conflictReason}</p>
        </div>
      )}

      {item.availability.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {item.availability.map((a) => (
            <li key={a.memberId} className="flex items-start gap-2 text-body">
              {a.state === "available" ? (
                <Check size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
              ) : (
                <X size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              )}
              <span>
                <span className="font-medium text-ink">
                  {memberById(a.memberId)?.displayName ?? "Adult"}
                </span>
                {a.state === "available" ? (
                  <span className="text-ink-3"> · available</span>
                ) : (
                  <span className="text-ink-3">
                    {" · conflicts with "}
                    {a.conflicts.map((c) => c.title).join(", ")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {item.recommendedMemberId && item.status !== "resolved" && (
        <p className="text-body font-medium text-accent-2">
          Suggest: {memberById(item.recommendedMemberId)?.displayName ?? "an adult"}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showClaim && (
          <>
            <TouchButton
              variant="primary"
              disabled={claimPending || !isAdult}
              onClick={() => onClaim(item)}
            >
              Claim
            </TouchButton>
            {!isAdult && <span className="text-meta text-ink-3">Adults only</span>}
          </>
        )}
        {showResolve && (
          <TouchButton
            variant="soft"
            icon={CheckCircle2}
            disabled={resolvePending || !isAdult}
            onClick={() => onResolve(item)}
          >
            Resolve
          </TouchButton>
        )}
        {showBackup && (
          <TouchButton
            variant="ghost"
            icon={LifeBuoy}
            disabled={!isAdult}
            onClick={() => onRequestBackup(item)}
          >
            Request backup
          </TouchButton>
        )}
      </div>
    </article>
  );
}

interface ContactRowProps {
  contact: BackupContact;
}

function ContactRow({ contact }: ContactRowProps) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-3 rounded-inner border border-line bg-surface px-4">
      <div className="min-w-0 py-1.5">
        <p className="truncate text-body font-medium text-ink">
          {contact.name} · {contact.relationship}
        </p>
        <p className="text-meta text-ink-3">
          {contact.phone}
          {contact.active ? "" : " · inactive"}
        </p>
      </div>
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          aria-label={`Call ${contact.name}`}
          className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-inner text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          <Phone size={18} aria-hidden />
        </a>
      )}
    </div>
  );
}

/**
 * The Family column's full handoff board: every obligation in the window as an
 * actionable card (claim / resolve / request backup), plus the backup contact
 * roster with direct tel: links.
 */
export function HandoffBoard() {
  const queryClient = useQueryClient();
  const { members, actor } = useActiveActor();
  const isAdult = actor?.role === "adult";

  const { data: board } = useQuery({ queryKey: ["handoffs"], queryFn: () => api.handoffs.board() });
  const { data: contactsData } = useQuery({
    queryKey: ["backup-contacts"],
    queryFn: () => api.backupContacts.list(),
  });

  const [backupFor, setBackupFor] = useState<HandoffBoardItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [contactEditor, setContactEditor] = useState<{ open: boolean; contact?: BackupContact }>({
    open: false,
  });

  const claim = useMutation({
    mutationFn: (item: HandoffBoardItem) => api.handoffs.claim(item.id, actor!.id),
    onSuccess: () => {
      // Attribution and times refresh via the board refetch.
      queryClient.invalidateQueries({ queryKey: ["handoffs"] });
    },
  });

  const resolve = useMutation({
    mutationFn: (item: HandoffBoardItem) => api.handoffs.resolve(item.id, actor!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["handoffs"] });
    },
  });

  const items = board?.items ?? [];
  const contacts = contactsData?.contacts ?? [];
  const memberById = (id?: string | null) => members.find((m) => m.id === id);

  return (
    <Panel
      title="Handoffs"
      actions={
        <TouchButton
          variant="soft"
          icon={Plus}
          disabled={!isAdult}
          onClick={() => setCreating(true)}
        >
          New handoff
        </TouchButton>
      }
    >
      <div className="flex flex-col gap-4">
        {items.length === 0 && (
          <p className="text-body text-ink-3">No handoffs in the next two weeks.</p>
        )}
        {items.map((item) => (
          <ObligationCard
            key={item.id}
            item={item}
            memberById={memberById}
            isAdult={isAdult}
            claimPending={claim.isPending}
            resolvePending={resolve.isPending}
            onClaim={(it) => claim.mutate(it)}
            onResolve={(it) => resolve.mutate(it)}
            onRequestBackup={setBackupFor}
          />
        ))}

        <section className="flex flex-col gap-2" aria-label="Backup contacts">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-body font-semibold text-ink-2">
              Backup contacts
            </h3>
            <TouchButton
              variant="soft"
              icon={Plus}
              disabled={!isAdult}
              onClick={() => setContactEditor({ open: true })}
            >
              Add contact
            </TouchButton>
          </div>
          {contacts.length === 0 && (
            <p className="text-body text-ink-3">No backup contacts yet.</p>
          )}
          {contacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} />
          ))}
        </section>
      </div>

      <HandoffEditorSheet
        open={creating}
        mode="create"
        onClose={() => setCreating(false)}
      />
      <HandoffEditorSheet
        open={backupFor !== null}
        mode="request-backup"
        obligation={backupFor ?? undefined}
        onClose={() => setBackupFor(null)}
      />
      <HandoffEditorSheet
        open={contactEditor.open}
        mode="contact"
        contact={contactEditor.contact}
        onClose={() => setContactEditor({ open: false })}
      />
    </Panel>
  );
}
