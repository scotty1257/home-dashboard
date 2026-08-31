import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Mic } from "lucide-react";
import type { VoiceNote, VoiceNoteInput, VoiceNoteListResponse } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Panel } from "../../components/Panel";
import { Select } from "../../components/Select";
import { TouchButton } from "../../components/TouchButton";
import { memberIcon, useActiveActor } from "../household/ActorSwitcher";
import { useHoldToRecord } from "./useHoldToRecord";
import { VoiceNotePlayer } from "./VoiceNotePlayer";

/** Short local time like "4:15 PM"; the <time> element title carries the ISO. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Today-column voice note drop. Adults pick a recipient and hold-to-record;
 * a child actor sees the notes addressed to them plus a single 88px round
 * hold-to-reply button that answers the latest note.
 */
export function VoiceNoteTile() {
  const { members, actor } = useActiveActor();
  const queryClient = useQueryClient();

  const isChild = actor?.role === "child";
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  // Collapsed by default: the tile is a recorder first, an inbox second.
  const [expanded, setExpanded] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const justSentTimer = useRef<number | null>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const sendableMembers = useMemo(
    () => members.filter((m) => m.active && m.id !== actor?.id),
    [members, actor?.id],
  );
  const adultRecipientId = selectedRecipientId || sendableMembers[0]?.id || "";

  const notesQuery = useQuery<VoiceNoteListResponse>({
    queryKey: ["voice-notes", isChild ? actor?.id : adultRecipientId],
    queryFn: () => api.voiceNotes.list(isChild ? actor!.id : adultRecipientId),
    enabled: !!actor && (isChild || !!adultRecipientId),
  });
  const notes = notesQuery.data?.notes ?? [];

  // Always-latest ref so a reply taken after a refetch targets the newest note.
  const latestNoteRef = useRef<VoiceNote | undefined>(undefined);
  latestNoteRef.current = notes[0];

  const upload = useCallback(
    async (blob: Blob, mime: string, durationMs: number, transcript?: string) => {
      if (!actor) return;
      const replyTo = isChild ? latestNoteRef.current : undefined;
      const recipientId = isChild ? replyTo?.senderId : adultRecipientId;
      if (!recipientId) return;
      await api.voiceNotes.upload(
        {
          senderId: actor.id,
          recipientId,
          inReplyToId: replyTo?.id,
          mimeType: mime as VoiceNoteInput["mimeType"],
          durationMs,
          transcript,
        },
        blob,
      );
      await queryClient.invalidateQueries({ queryKey: ["voice-notes"] });
      setJustSent(true);
      if (justSentTimer.current) window.clearTimeout(justSentTimer.current);
      justSentTimer.current = window.setTimeout(() => setJustSent(false), 2500);
    },
    [actor, adultRecipientId, isChild, queryClient],
  );

  const markRead = useMutation({
    mutationFn: (id: string) => api.voiceNotes.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["voice-notes"] });
    },
  });

  const recorder = useHoldToRecord({ upload });

  const recording = recorder.status === "recording";
  const holding = recorder.status === "requesting" || recording;

  const statusText =
    recorder.status === "uploading"
      ? "Sending…"
      : recording
        ? `${(recorder.durationMs / 1000).toFixed(1)}s`
        : holding
          ? "Listening…"
          : justSent
            ? "Sent"
            : null;

  const unread = notes.filter((n) => !n.readAt).length;

  return (
    <Panel
      title="Voice notes"
      icon={Mic}
      density="compact"
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
      actions={
        notes.length > 0 ? (
          <TouchButton
            variant="ghost"
            icon={expanded ? ChevronUp : ChevronDown}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide voice notes" : "Show voice notes"}
          >
            {expanded ? "Hide" : `${notes.length}${unread > 0 ? ` · ${unread} new` : ""}`}
          </TouchButton>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        {!actor ? (
          <p className="text-body text-ink-3">Loading…</p>
        ) : (
          <>
            {!isChild && (
              <div className="flex items-center gap-3 text-body text-ink-2">
                <span className="shrink-0">Send to</span>
                <Select
                  label="Recipient"
                  className="min-w-0 flex-1"
                  value={adultRecipientId}
                  onChange={setSelectedRecipientId}
                  options={sendableMembers.map((member) => ({
                    value: member.id,
                    label: member.displayName,
                  }))}
                />
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {/* Expanding rings while recording: obvious from across the room
                    that the mic is live. Decorative — the status line below
                    carries the same information as text. */}
                {recording && (
                  <>
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-pill bg-accent/30 animate-[recordPulse_1.8s_ease-out_infinite]"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-pill bg-accent/30 animate-[recordPulse_1.8s_ease-out_infinite] [animation-delay:0.6s]"
                    />
                  </>
                )}
                <button
                  type="button"
                  aria-label={isChild ? "Hold to reply" : "Hold to record"}
                  disabled={recorder.status === "uploading" || (isChild && !latestNoteRef.current)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    void recorder.start();
                  }}
                  onPointerUp={() => recorder.stop()}
                  onPointerCancel={() => recorder.cancel()}
                  onPointerLeave={() => recorder.cancel()}
                  className={cn(
                    "relative h-16 w-16 touch-none select-none rounded-pill",
                    "flex items-center justify-center border-2 border-accent-2/50",
                    "bg-accent text-white shadow-panel transition-transform active:scale-95",
                    "disabled:pointer-events-none disabled:opacity-40",
                    recording && "scale-105 ring-8 ring-accent-2/20",
                  )}
                >
                  <Mic size={28} strokeWidth={2} aria-hidden />
                </button>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {!statusText && (
                  <p className="text-body font-medium text-ink">
                    {isChild ? "Hold to reply" : "Hold to record"}
                  </p>
                )}
                {statusText && (
                  <p
                    aria-live="polite"
                    className={cn(
                      "font-medium text-ink",
                      recording ? "text-countdown tabular-nums" : "text-body",
                    )}
                  >
                    {statusText}
                  </p>
                )}
                {isChild &&
                  (latestNoteRef.current ? (
                    <p className="text-meta text-ink-3">
                      Replying to{" "}
                      {memberById.get(latestNoteRef.current.senderId)?.displayName ?? "Unknown"}
                    </p>
                  ) : (
                    <p className="text-meta text-ink-3">No voice notes yet</p>
                  ))}
              </div>
            </div>

            {recorder.status === "error" && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-body text-danger">
                  {recorder.error === "mic-denied"
                    ? "Microphone blocked — tap Settings to allow"
                    : recorder.error === "unsupported"
                      ? "Recording not supported on this device"
                      : "Couldn't send the note — try again"}
                </p>
                {recorder.error === "mic-denied" && (
                  <TouchButton variant="soft" onClick={() => void recorder.start()}>
                    Retry
                  </TouchButton>
                )}
              </div>
            )}

            {notes.length > 0 && expanded ? (
              <ul
                aria-label="Voice notes"
                className="flex max-h-[13rem] flex-col gap-2 overflow-y-auto pr-1"
              >
                {notes.map((note) => {
                  const sender = memberById.get(note.senderId);
                  const SenderIcon = memberIcon(sender?.icon ?? "user");
                  return (
                    <li
                      key={note.id}
                      className={cn(
                        "relative flex shrink-0 flex-col gap-2 overflow-hidden rounded-inner border bg-surface py-2.5 pl-4 pr-3",
                        note.readAt ? "border-line" : "border-accent/40 bg-accent-soft/40",
                      )}
                    >
                      {/* Sender colour as a left edge — who it's from, at a glance. */}
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-1"
                        style={{ backgroundColor: `var(--color-${sender?.color ?? "coral"})` }}
                      />
                      <div className="flex items-center gap-2">
                        <SenderIcon
                          size={18}
                          strokeWidth={2}
                          aria-hidden
                          className="shrink-0"
                          style={{ color: `var(--color-${sender?.color ?? "coral"})` }}
                        />
                        <span className="truncate text-body font-semibold text-ink">
                          {sender?.displayName ?? "Unknown"}
                        </span>
                        {!note.readAt && (
                          <span
                            aria-label="Unread"
                            title="Unread"
                            className="shrink-0 rounded-pill bg-accent px-2 py-0.5 text-meta font-semibold leading-none text-white"
                          >
                            New
                          </span>
                        )}
                        <time
                          dateTime={note.createdAt}
                          title={note.createdAt}
                          className="ml-auto shrink-0 text-meta tabular-nums text-ink-3"
                        >
                          {formatTime(note.createdAt)}
                        </time>
                      </div>

                      {note.transcript && (
                        <p className="line-clamp-2 text-meta text-ink-2">{note.transcript}</p>
                      )}

                      <VoiceNotePlayer
                        audioUrl={note.audioUrl}
                        seed={note.id}
                        durationMs={note.durationMs}
                        onStarted={() => {
                          if (!note.readAt) markRead.mutate(note.id);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              notes.length === 0 &&
              !notesQuery.isPending && (
                <div className="flex flex-col items-center gap-1.5 rounded-inner border border-dashed border-line py-5 text-center">
                  <p className="text-body text-ink-3">No voice notes yet</p>
                  <p className="text-meta text-ink-4">
                    {isChild ? "Hold the button to reply" : "Hold the button to record one"}
                  </p>
                </div>
              )
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
