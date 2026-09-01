import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { LaunchIconKey, LaunchStep } from "@home-dashboard/contracts";
import { api, type LaunchTemplateWithSteps } from "../../lib/api";
import { Sheet } from "../../components/Sheet";
import { Select } from "../../components/Select";
import { Toggle } from "../../components/Toggle";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { cn } from "../../lib/cn";
import { ICON } from "../../lib/icons";

const field =
  "min-h-touch w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink " +
  "placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent-2/50";

const label = "text-meta font-medium text-ink-3";

/** Sunday-first, matching LaunchTemplate.weekdays (0 = Sunday). */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ICON_OPTIONS: { value: LaunchIconKey; label: string }[] = [
  { value: "shoes", label: "Shoes" },
  { value: "bag", label: "Bag" },
  { value: "snack", label: "Snack" },
  { value: "water", label: "Water" },
  { value: "jacket", label: "Jacket" },
  { value: "toilet", label: "Bathroom" },
  { value: "custom", label: "Other" },
];

interface DraftStep {
  label: string;
  icon: LaunchIconKey;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing template to edit; omit to create a new one. */
  template?: LaunchTemplateWithSteps;
  /** Children who can own a template. */
  children: { id: string; displayName: string }[];
}

/**
 * Create/edit a launch template: which child, which weekdays, the departure
 * time, the chime lead, and the checklist steps.
 *
 * The API has supported template CRUD all along; there was simply no way to
 * reach it from the app, so weekdays and steps could only be changed by seeding
 * the database. Saving replaces the whole step set, which is what
 * PUT /api/launch/templates/:id does server-side.
 */
export function LaunchTemplateSheet({ open, onClose, template, children }: Props) {
  const queryClient = useQueryClient();
  const { actor } = useActiveActor();
  const isAdult = actor?.role === "adult";

  const [childId, setChildId] = useState("");
  const [name, setName] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [departure, setDeparture] = useState("07:45");
  const [windowMinutes, setWindowMinutes] = useState("45");
  const [chimeMinutes, setChimeMinutes] = useState("3");
  const [active, setActive] = useState(true);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const firstChildId = children[0]?.id ?? "";

  useEffect(() => {
    if (!open) return;
    setError(null);
    setChildId(template?.childId ?? firstChildId);
    setName(template?.name ?? "School run");
    setWeekdays(template?.weekdays ?? [1, 2, 3, 4, 5]);
    setDeparture(template?.departureLocalTime ?? "07:45");
    setWindowMinutes(String(template?.activeWindowMinutes ?? 45));
    setChimeMinutes(String(template?.chimeBeforeMinutes ?? 3));
    setActive(template?.active ?? true);
    setSteps(
      (template?.steps ?? [])
        .slice()
        .sort((a: LaunchStep, b: LaunchStep) => a.sortOrder - b.sortOrder)
        .map((s) => ({ label: s.label, icon: s.icon })),
    );
    // Deliberately keyed on identity, not the whole template object: the
    // parent rebuilds its props each render, and depending on those reset the
    // form on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, firstChildId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("No active member");
      const input = {
        childId,
        name: name.trim(),
        weekdays: [...weekdays].sort((a, b) => a - b),
        departureLocalTime: departure,
        activeWindowMinutes: Number(windowMinutes),
        chimeBeforeMinutes: Number(chimeMinutes),
        active,
        steps: steps
          .filter((s) => s.label.trim())
          .map((s, i) => ({ label: s.label.trim(), icon: s.icon, sortOrder: i, active: true })),
      };
      return template
        ? api.launch.updateTemplate(template.id, input, actor.id)
        : api.launch.createTemplate(input, actor.id);
    },
    onSuccess: async () => {
      // Await the refetch, not just the invalidation: the parent prefills this
      // sheet from the templates list, so closing while that query is still in
      // flight makes a reopen show the pre-save values.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["launch"] }),
        queryClient.refetchQueries({ queryKey: ["launch-templates"] }),
      ]);
      onClose();
    },
    onError: (err: Error) => setError(err.message || "Couldn't save the launch"),
  });

  const toggleDay = (day: number) =>
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );

  const valid =
    childId !== "" && name.trim() !== "" && weekdays.length > 0 && /^\d{2}:\d{2}$/.test(departure);

  return (
    <Sheet open={open} onClose={onClose} size="lg" title={template ? "Edit launch" : "New launch"}>
      <div className="flex flex-col gap-4">
        {!isAdult && (
          <p className="rounded-inner bg-warning/15 px-4 py-2.5 text-body font-medium text-warning">
            Only an adult can change the launch.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className={label}>Who</span>
          <Select
            label="Child"
            value={childId}
            onChange={setChildId}
            options={children.map((c) => ({ value: c.id, label: c.displayName }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Name</span>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="School run"
            aria-label="Launch name"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Days</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day, index) => {
              const on = weekdays.includes(index);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(index)}
                  aria-pressed={on}
                  className={cn(
                    "min-h-touch min-w-touch rounded-pill px-4 text-body font-medium transition-colors",
                    on
                      ? "bg-accent text-white"
                      : "border border-line bg-surface text-ink-3 hover:text-ink",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Leaves at</span>
            <input
              className={field}
              type="time"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              aria-label="Departure time"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Starts (min before)</span>
            <input
              className={field}
              type="number"
              min={5}
              max={120}
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(e.target.value)}
              aria-label="Active window minutes"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Chime (min before)</span>
            <input
              className={field}
              type="number"
              min={1}
              max={30}
              value={chimeMinutes}
              onChange={(e) => setChimeMinutes(e.target.value)}
              aria-label="Chime lead minutes"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>Steps</span>
          {steps.length === 0 && (
            <p className="text-meta text-ink-4">No steps yet — add the first one below.</p>
          )}
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-2">
              <GripVertical size={ICON.sm} className="shrink-0 text-ink-4" aria-hidden />
              <input
                className={cn(field, "flex-1")}
                value={step.label}
                onChange={(e) =>
                  setSteps((current) =>
                    current.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)),
                  )
                }
                placeholder="Shoes"
                aria-label={`Step ${index + 1} label`}
              />
              <div className="w-40 shrink-0">
                <Select
                  label="Icon"
                  value={step.icon}
                  onChange={(v) =>
                    setSteps((current) =>
                      current.map((s, i) =>
                        i === index ? { ...s, icon: v as LaunchIconKey } : s,
                      ),
                    )
                  }
                  options={ICON_OPTIONS}
                />
              </div>
              <TouchButton
                variant="ghost"
                icon={Trash2}
                iconOnly
                aria-label={`Remove step ${index + 1}`}
                onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
              />
            </div>
          ))}
          <TouchButton
            variant="soft"
            icon={Plus}
            onClick={() => setSteps((current) => [...current, { label: "", icon: "custom" }])}
          >
            Add step
          </TouchButton>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={label}>Active</span>
          <Toggle checked={active} onChange={setActive} label="Launch active" />
        </div>

        {error && <p className="text-body text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <TouchButton variant="ghost" onClick={onClose}>
            Cancel
          </TouchButton>
          <TouchButton
            variant="primary"
            disabled={!valid || !isAdult || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save launch"}
          </TouchButton>
        </div>
      </div>
    </Sheet>
  );
}
