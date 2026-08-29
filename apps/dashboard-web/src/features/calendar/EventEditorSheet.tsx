import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CalendarEvent, ColorToken } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Sheet } from "../../components/Sheet";
import { TouchButton } from "../../components/TouchButton";
import { Toggle } from "../../components/Toggle";
import { colors, colorOf } from "../../lib/format";
import "./EventEditorSheet.css";

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

const COLOR_OPTIONS: ColorToken[] = ["coral", "amber", "lime", "teal", "sky", "indigo", "violet", "rose"];

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
    const startIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();
    mutation.mutate({
      title: title.trim(),
      allDay,
      start: startIso,
      end: endIso,
      location: location || undefined,
      notes: notes || undefined,
      color,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? "Edit event" : "New event"} size="lg">
      <div className="event-editor">
        <label className="field">
          <span className="field__label">Title</span>
          <input
            className="field__input field__input--title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's happening?"
            autoFocus
          />
        </label>

        <div className="field-row">
          <div className="field field--grow">
            <span className="field__label">All day</span>
            <Toggle checked={allDay} onChange={setAllDay} label="All day" accent="coral" />
          </div>
        </div>

        <div className="field-row">
          <label className="field field--grow">
            <span className="field__label">{allDay ? "Date" : "Starts"}</span>
            <input
              className="field__input"
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? start.slice(0, 10) : start}
              onChange={(e) => setStart(allDay ? `${e.target.value}T09:00` : e.target.value)}
            />
          </label>
          <label className="field field--grow">
            <span className="field__label">{allDay ? "Date" : "Ends"}</span>
            <input
              className="field__input"
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? end.slice(0, 10) : end}
              onChange={(e) => setEnd(allDay ? `${e.target.value}T10:00` : e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Location</span>
          <input
            className="field__input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where?"
          />
        </label>

        <label className="field">
          <span className="field__label">Notes</span>
          <textarea
            className="field__input field__input--area"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details…"
            rows={2}
          />
        </label>

        <div className="field">
          <span className="field__label">Color</span>
          <div className="color-swatches">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${color === c ? "color-swatch--active" : ""}`}
                style={{ background: colorOf(c) }}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="event-editor__actions">
          {isEdit && (
            <TouchButton
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm("Delete this event?")) remove.mutate();
              }}
            >
              Delete
            </TouchButton>
          )}
          <div className="spacer" />
          <TouchButton variant="ghost" onClick={onClose}>Cancel</TouchButton>
          <TouchButton variant="primary" disabled={!canSave || mutation.isPending} onClick={save}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </TouchButton>
        </div>
        {mutation.isError && <p className="field__error">Couldn't save. Try again.</p>}
      </div>
    </Sheet>
  );
}
