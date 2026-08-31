import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type { CalendarEvent, ColorToken } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Sheet } from "../../components/Sheet";
import { Select } from "../../components/Select";
import { TouchButton } from "../../components/TouchButton";
import { Toggle } from "../../components/Toggle";
import { colorList, colorOf } from "../../lib/colors";
import { cn } from "../../lib/cn";

type Initial = CalendarEvent | { date: Date } | null;

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(9, 0, 0, 0);
  return d;
}

const field =
  "w-full rounded-inner border border-line-strong bg-surface px-3 py-2.5 text-body text-ink " +
  "placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-accent-2/50";

const label = "text-meta font-medium text-ink-3";

interface Props {
  open: boolean;
  initial: Initial;
  onClose: () => void;
}

export function EventEditorSheet({ open, initial, onClose }: Props) {
  const queryClient = useQueryClient();
  const existing = initial && "id" in initial ? initial : null;
  const isEdit = existing !== null;

  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState<ColorToken>("sky");
  const [ownerId, setOwnerId] = useState("");
  const [scheduleKind, setScheduleKind] = useState<CalendarEvent["scheduleKind"]>("general");
  const [requiresHandoff, setRequiresHandoff] = useState(false);

  const { data: household } = useQuery({
    queryKey: ["household"],
    queryFn: () => api.household.list(),
  });
  const members = household?.members ?? [];

  useEffect(() => {
    if (!open || !initial) return;
    if (isEdit && existing) {
      setTitle(existing.title);
      setAllDay(existing.allDay);
      setStart(toLocalInput(new Date(existing.start)));
      setEnd(toLocalInput(new Date(existing.end)));
      setLocation(existing.location ?? "");
      setNotes(existing.notes ?? "");
      setColor(existing.color);
      setOwnerId(existing.ownerId ?? "");
      setScheduleKind(existing.scheduleKind ?? "general");
      setRequiresHandoff(existing.requiresHandoff ?? false);
    } else if ("date" in initial) {
      const s = defaultStart(initial.date);
      const e = new Date(s.getTime() + 60 * 60 * 1000);
      setTitle("");
      setAllDay(false);
      setStart(toLocalInput(s));
      setEnd(toLocalInput(e));
      setLocation("");
      setNotes("");
      setColor("sky");
      setOwnerId("");
      setScheduleKind("general");
      setRequiresHandoff(false);
    }
  }, [open, initial, isEdit, existing]);

  const mutation = useMutation({
    mutationFn: async (input: Parameters<typeof api.calendar.create>[0]) => {
      if (existing) return api.calendar.update(existing.id, input);
      return api.calendar.create(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.calendar.remove(existing!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      onClose();
    },
  });

  const canSave = title.trim().length > 0 && start && end;

  const save = () => {
    if (!canSave) return;
    mutation.mutate({
      title: title.trim(),
      allDay,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      location: location || undefined,
      notes: notes || undefined,
      color,
      ownerId: ownerId || undefined,
      scheduleKind,
      requiresHandoff: scheduleKind === "child-commitment" ? requiresHandoff : false,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? "Edit event" : "New event"} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={label}>Title</span>
          <input
            className={cn(field, "text-body-lg font-medium")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's happening?"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-between rounded-inner border border-line bg-surface px-3 py-2">
          <span className="text-body text-ink-2">All day</span>
          <Toggle checked={allDay} onChange={setAllDay} label="All day" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Owner</span>
            <Select
              label="Owner"
              value={ownerId}
              onChange={setOwnerId}
              options={[
                { value: "", label: "No owner" },
                ...members.map((m) => ({ value: m.id, label: m.displayName })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Schedule kind</span>
            <Select
              label="Schedule kind"
              value={scheduleKind}
              onChange={(v) => setScheduleKind(v as CalendarEvent["scheduleKind"])}
              options={[
                { value: "general", label: "General" },
                { value: "adult-commitment", label: "Adult commitment" },
                { value: "child-commitment", label: "Child commitment" },
              ]}
            />
          </div>
        </div>

        {scheduleKind === "child-commitment" && (
          <div className="flex items-center justify-between rounded-inner border border-line bg-surface px-3 py-2">
            <span className="text-body text-ink-2">Needs handoff</span>
            <Toggle checked={requiresHandoff} onChange={setRequiresHandoff} label="Needs handoff" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={label}>{allDay ? "Date" : "Starts"}</span>
            <input
              className={field}
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? start.slice(0, 10) : start}
              onChange={(e) => setStart(allDay ? `${e.target.value}T09:00` : e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>{allDay ? "Date" : "Ends"}</span>
            <input
              className={field}
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? end.slice(0, 10) : end}
              onChange={(e) => setEnd(allDay ? `${e.target.value}T10:00` : e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Location</span>
          <input
            className={field}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where?"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Notes</span>
          <textarea
            className={cn(field, "resize-none")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details…"
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>Color</span>
          <div className="flex flex-wrap gap-2.5">
            {colorList.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c as ColorToken)}
                className={cn(
                  "h-8 w-8 rounded-pill transition-transform active:scale-90",
                  color === c && "ring-2 ring-ink ring-offset-2 ring-offset-panel",
                )}
                style={{ backgroundColor: colorOf(c) }}
              />
            ))}
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2 border-t border-line pt-4">
          {isEdit && (
            <TouchButton
              variant="danger"
              icon={Trash2}
              disabled={remove.isPending}
              onClick={() => {
                if (confirm("Delete this event?")) remove.mutate();
              }}
            >
              Delete
            </TouchButton>
          )}
          <div className="flex-1" />
          <TouchButton variant="ghost" onClick={onClose}>Cancel</TouchButton>
          <TouchButton variant="primary" disabled={!canSave || mutation.isPending} onClick={save}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </TouchButton>
        </div>
        {mutation.isError && <p className="text-body text-danger">Couldn't save. Try again.</p>}
      </div>
    </Sheet>
  );
}
