import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type {
  PermissionCategory,
  PermissionRule,
  PermissionRuleInput,
} from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Sheet } from "../../components/Sheet";
import { TouchButton } from "../../components/TouchButton";
import { Toggle } from "../../components/Toggle";
import { useActiveActor } from "../household/ActorSwitcher";
import { CATEGORY_LABEL, Chip } from "./PermissionQueue";

const field =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink " +
  "placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent-2/50";

const label = "text-xs font-semibold uppercase tracking-wide text-ink-3";

/** Literal list (a derived one would touch the circularly-imported label map at module scope). */
const CATEGORIES: PermissionCategory[] = [
  "sleepover",
  "screen-time",
  "ride",
  "purchase",
  "outing",
  "school",
  "other",
];

/** 0 = Sunday … 6 = Saturday, matching the contract's weekday numbering. */
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Standing-rule manager. Adults browse, create, and edit the rules that can
 * auto-decide matching requests; kids see the list read-only with a hint.
 * The list and the form swap places inside one sheet.
 */
export function StandingRulesSheet({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { actor } = useActiveActor();
  const isAdult = actor?.role === "adult";

  const { data: rulesData } = useQuery({
    queryKey: ["permission-rules"],
    queryFn: () => api.permissionRules.list(),
  });
  const rules = rulesData?.rules ?? [];

  const [editing, setEditing] = useState<PermissionRule | "new" | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PermissionCategory>("other");
  const [outcome, setOutcome] = useState<"approved" | "denied">("approved");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeUntil, setActiveUntil] = useState("");
  const [priority, setPriority] = useState("1");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      return;
    }
  }, [open]);

  // Load the form from the rule being edited (or blank for a new one).
  useEffect(() => {
    if (editing === null) return;
    const rule = editing === "new" ? null : editing;
    setName(rule?.name ?? "");
    setCategory(rule?.category ?? "other");
    setOutcome(rule?.outcome ?? "approved");
    setWeekdays(rule?.weekdays ?? []);
    setStartTime(rule?.localStartTime ?? "");
    setEndTime(rule?.localEndTime ?? "");
    setActiveFrom(rule?.activeFrom ? rule.activeFrom.slice(0, 10) : "");
    setActiveUntil(rule?.activeUntil ? rule.activeUntil.slice(0, 10) : "");
    setPriority(String(rule?.priority ?? 1));
    setActive(rule?.active ?? true);
  }, [editing]);

  const save = useMutation({
    mutationFn: ({ rule, input }: { rule: PermissionRule | null; input: PermissionRuleInput }) =>
      rule ? api.permissionRules.update(rule.id, input) : api.permissionRules.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-rules"] });
      setEditing(null);
    },
  });

  const toggleWeekday = (day: number) => {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  };

  const ruleBeingEdited = editing === "new" || editing === null ? null : editing;

  const canSave =
    isAdult &&
    actor !== null &&
    name.trim().length > 0 &&
    weekdays.length > 0 &&
    !save.isPending;

  const submit = () => {
    if (!canSave || actor === null) return;
    save.mutate({
      rule: ruleBeingEdited,
      input: {
        name: name.trim(),
        category,
        outcome,
        weekdays: [...weekdays].sort((a, b) => a - b),
        localStartTime: startTime || undefined,
        localEndTime: endTime || undefined,
        activeFrom: activeFrom ? new Date(activeFrom).toISOString() : undefined,
        activeUntil: activeUntil ? new Date(activeUntil).toISOString() : undefined,
        priority: Number(priority) || 0,
        active,
        actorId: actor.id,
      },
    });
  };

  if (editing !== null) {
    return (
      <Sheet
        open={open}
        onClose={() => setEditing(null)}
        title={ruleBeingEdited ? "Edit standing rule" : "New standing rule"}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Name</span>
            <input
              className={field}
              aria-label="Rule name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Friday sleepovers"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className={label}>Category</span>
              <select
                className={field}
                aria-label="Rule category"
                value={category}
                onChange={(e) => setCategory(e.target.value as PermissionCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={label}>Auto decision</span>
              <select
                className={field}
                aria-label="Rule outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as "approved" | "denied")}
              >
                <option value="approved">Approve</option>
                <option value="denied">Deny</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={label}>Weekdays</span>
            <div className="flex flex-wrap gap-2">
              {DAY_INITIALS.map((initial, day) => {
                const selected = weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    aria-label={DAY_NAMES[day]}
                    onClick={() => toggleWeekday(day)}
                    className={cn(
                      "min-h-12 min-w-12 rounded-md border text-sm font-medium transition-colors",
                      selected
                        ? "border-transparent bg-accent text-white"
                        : "border-line bg-surface text-ink-3 hover:bg-raised",
                    )}
                  >
                    {initial}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className={label}>Starts (optional)</span>
              <input
                className={field}
                aria-label="Rule starts at"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={label}>Ends (optional)</span>
              <input
                className={field}
                aria-label="Rule ends at"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className={label}>Active from (optional)</span>
              <input
                className={field}
                aria-label="Rule active from"
                type="date"
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={label}>Active until (optional)</span>
              <input
                className={field}
                aria-label="Rule active until"
                type="date"
                value={activeUntil}
                onChange={(e) => setActiveUntil(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm text-ink-2">Priority</span>
              <span className="text-xs text-ink-3">Higher wins ties</span>
            </div>
            <input
              className={cn(field, "w-20 text-center")}
              aria-label="Rule priority"
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2">
            <span className="text-sm text-ink-2">Active</span>
            <Toggle checked={active} onChange={setActive} label="Rule active" />
          </div>

          <div className="flex items-center gap-2 border-t border-line pt-4">
            <TouchButton variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </TouchButton>
            <div className="flex-1" />
            <TouchButton variant="primary" disabled={!canSave} onClick={submit}>
              {save.isPending ? "Saving…" : "Save rule"}
            </TouchButton>
          </div>
          {save.isError && (
            <p className="text-sm text-danger" role="alert">
              {save.error instanceof Error && save.error.message
                ? `Couldn't save the rule — ${save.error.message}`
                : "Couldn't save the rule. Try again."}
            </p>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Standing rules" size="lg">
      <div className="flex flex-col gap-3">
        {rules.length === 0 && <p className="text-sm text-ink-3">No standing rules yet.</p>}
        {rules.map((rule) => (
          <button
            key={rule.id}
            type="button"
            disabled={!isAdult}
            onClick={() => setEditing(rule)}
            className="flex min-h-12 w-full flex-col gap-1.5 rounded-md border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-raised disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-ink">{rule.name}</span>
              <Chip
                label={rule.outcome === "approved" ? "Approve" : "Deny"}
                className={
                  rule.outcome === "approved"
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-danger/40 bg-danger/10 text-danger"
                }
              />
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              <span>{CATEGORY_LABEL[rule.category]}</span>
              <span className="flex gap-1" aria-label="Active weekdays">
                {rule.weekdays.map((day) => (
                  <span
                    key={day}
                    className="rounded border border-line bg-panel px-1 font-semibold text-ink-2"
                  >
                    {DAY_INITIALS[day]}
                  </span>
                ))}
              </span>
              {(rule.localStartTime !== undefined || rule.localEndTime !== undefined) && (
                <span>
                  {rule.localStartTime ?? "…"}–{rule.localEndTime ?? "…"}
                </span>
              )}
              <span>Priority {rule.priority}</span>
              <span className={rule.active ? "text-success" : undefined}>
                {rule.active ? "Active" : "Paused"}
              </span>
            </span>
          </button>
        ))}

        {isAdult ? (
          <TouchButton variant="soft" icon={Plus} onClick={() => setEditing("new")}>
            Add rule
          </TouchButton>
        ) : (
          <p className="text-sm text-ink-3">Adults only</p>
        )}
      </div>
    </Sheet>
  );
}
