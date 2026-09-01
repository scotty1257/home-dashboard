import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import type {
  CalendarEvent,
  ColorToken,
  RecurrenceRule,
} from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Sheet } from "../../components/Sheet";
import { Select } from "../../components/Select";
import { TouchButton } from "../../components/TouchButton";
import { Toggle } from "../../components/Toggle";
import { colorList, colorOf } from "../../lib/colors";
import { cn } from "../../lib/cn";
import { WEEKDAY_LONG } from "./calendarUtils";

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

const FREQUENCIES: { value: RecurrenceRule["frequency"]; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

/** The reminder offsets worth one tap; anything else is a rare enough case. */
const REMINDER_CHOICES = [
  { minutes: 0, label: "At start" },
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 1440, label: "1 day" },
];

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

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
  const [frequency, setFrequency] = useState<RecurrenceRule["frequency"]>("none");
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [until, setUntil] = useState("");
  const [reminders, setReminders] = useState<number[]>([]);

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
      const rule = existing.recurrence ?? { frequency: "none", interval: 1 };
      setFrequency(rule.frequency);
      setRepeatEvery(rule.interval || 1);
      setDaysOfWeek(rule.daysOfWeek ?? []);
      setUntil(rule.until ? rule.until.slice(0, 10) : "");
      setReminders((existing.reminders ?? []).map((r) => r.minutesBefore));
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
      setFrequency("none");
      setRepeatEvery(1);
      // Seed the weekly picker with the day being created on, so choosing
      // "every week" already means "every week on this day".
      setDaysOfWeek([initial.date.getDay()]);
      setUntil("");
      setReminders([]);
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
      recurrence: {
        frequency,
        interval: Math.max(1, repeatEvery),
        // Only the weekly rule reads daysOfWeek; sending it for the others
        // would persist state the UI never shows again.
        daysOfWeek: frequency === "weekly" && daysOfWeek.length > 0 ? daysOfWeek : undefined,
        until: until ? new Date(`${until}T23:59:59`).toISOString() : undefined,
      },
      reminders: reminders
        .slice()
        .sort((a, b) => a - b)
        .map((minutesBefore) => ({ minutesBefore, delivered: false })),
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

        <div className="flex flex-col gap-1.5">
          <span className={label}>Repeats</span>
          <Select
            label="Repeats"
            value={frequency}
            onChange={(v) => setFrequency(v as RecurrenceRule["frequency"])}
            options={FREQUENCIES}
          />
        </div>

        {frequency !== "none" && (
          <div className="flex flex-col gap-3 rounded-inner border border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <span className="text-body text-ink-2">Every</span>
              <input
                type="number"
                min={1}
                max={99}
                aria-label="Repeat interval"
                value={repeatEvery}
                onChange={(e) => setRepeatEvery(Math.max(1, Number(e.target.value) || 1))}
                className={cn(field, "w-24 text-center tabular-nums")}
              />
              <span className="text-body text-ink-2">
                {frequency === "daily" && (repeatEvery === 1 ? "day" : "days")}
                {frequency === "weekly" && (repeatEvery === 1 ? "week" : "weeks")}
                {frequency === "monthly" && (repeatEvery === 1 ? "month" : "months")}
                {frequency === "yearly" && (repeatEvery === 1 ? "year" : "years")}
              </span>
            </div>

            {frequency === "weekly" && (
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_INITIALS.map((initial, day) => {
                  const on = daysOfWeek.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-label={WEEKDAY_LONG[day]}
                      aria-pressed={on}
                      onClick={() =>
                        setDaysOfWeek((current) =>
                          current.includes(day)
                            ? current.filter((d) => d !== day)
                            : [...current, day].sort((a, b) => a - b),
                        )
                      }
                      className={cn(
                        "h-touch w-touch rounded-pill border text-body font-semibold transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
                        on
                          ? "border-transparent bg-accent text-white"
                          : "border-line bg-panel text-ink-3 hover:bg-raised",
                      )}
                    >
                      {initial}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className={label}>Until (optional)</span>
              <input
                className={field}
                type="date"
                aria-label="Repeat until"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className={label}>Reminders</span>
          <div className="flex flex-wrap gap-2">
            {REMINDER_CHOICES.map(({ minutes, label: text }) => {
              const on = reminders.includes(minutes);
              return (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setReminders((current) =>
                      current.includes(minutes)
                        ? current.filter((m) => m !== minutes)
                        : [...current, minutes],
                    )
                  }
                  className={cn(
                    "flex min-h-touch items-center gap-2 rounded-pill border px-4 text-body transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
                    on
                      ? "border-transparent bg-accent text-white"
                      : "border-line bg-surface text-ink-2 hover:bg-raised",
                  )}
                >
                  <Bell size={18} aria-hidden />
                  {text}
                </button>
              );
            })}
          </div>
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
