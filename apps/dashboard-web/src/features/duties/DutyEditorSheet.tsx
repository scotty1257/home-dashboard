import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColorToken, DutyIconKey } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Sheet } from "../../components/Sheet";
import { Select } from "../../components/Select";
import { TouchButton } from "../../components/TouchButton";
import { Toggle } from "../../components/Toggle";
import { useActiveActor } from "../household/ActorSwitcher";
import { DUTY_ICON_LABELS } from "./DutyLedger";

const field =
  "w-full rounded-inner border border-line-strong bg-surface px-3 py-2.5 text-body text-ink " +
  "placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent-2/50";

const label = "text-meta font-medium text-ink-3";

const ICON_KEYS: DutyIconKey[] = [
  "bedtime",
  "school-run",
  "dentist",
  "permission-slip",
  "night-wake",
  "trash",
  "dishes",
  "laundry",
  "custom",
];

const COLOR_TOKENS: ColorToken[] = ["coral", "amber", "lime", "teal", "sky", "indigo", "violet", "rose", "slate"];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet for adding a duty definition: name, icon, color, board order,
 * and whether it's active. Adults only — the sheet stays honest about it.
 */
export function DutyEditorSheet({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { actor } = useActiveActor();
  const isAdult = actor?.role === "adult";

  const [name, setName] = useState("");
  const [icon, setIcon] = useState<DutyIconKey>("custom");
  const [color, setColor] = useState<ColorToken>("sky");
  const [sortOrder, setSortOrder] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName("");
    setIcon("custom");
    setColor("sky");
    setSortOrder("0");
    setActive(true);
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      api.duties.createDefinition({
        actorId: actor!.id,
        name: name.trim(),
        icon,
        color,
        sortOrder: Number(sortOrder) || 0,
        active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duties"] });
      onClose();
    },
  });

  const canSave = name.trim().length > 0 && Number.isInteger(Number(sortOrder) || 0);

  return (
    <Sheet open={open} onClose={onClose} title="Add duty">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={label}>Name</span>
          <input
            className={field}
            aria-label="Duty name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Water the plants"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Icon</span>
          <Select
            label="Duty icon"
            value={icon}
            onChange={(v) => setIcon(v as DutyIconKey)}
            options={ICON_KEYS.map((key) => ({ value: key, label: DUTY_ICON_LABELS[key] }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Color</span>
          <Select
            label="Duty color"
            value={color}
            onChange={(v) => setColor(v as ColorToken)}
            options={COLOR_TOKENS.map((token) => ({
              value: token,
              label: token.charAt(0).toUpperCase() + token.slice(1),
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Board order</span>
          <input
            className={field}
            aria-label="Board order"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between rounded-inner border border-line bg-surface px-3 py-2">
          <span className="text-body text-ink-2">Active</span>
          <Toggle checked={active} onChange={setActive} label="Active" />
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-4">
          <TouchButton variant="ghost" onClick={onClose}>
            Cancel
          </TouchButton>
          <div className="flex-1" />
          <TouchButton
            variant="primary"
            disabled={!isAdult || !canSave || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Adding…" : "Add duty"}
          </TouchButton>
        </div>
        {!isAdult && <p className="text-body text-ink-3">Adults only</p>}
        {create.isError && <p className="text-body text-danger">Couldn't add the duty. Try again.</p>}
      </div>
    </Sheet>
  );
}
