import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic } from "lucide-react";
import type { VoiceNote, VoiceNoteInput, VoiceNoteListResponse } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Panel } from "../../components/Panel";
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

  return (
    <Panel title="Voice notes" icon={Mic} density="compact">
      <div className="flex flex-col gap-3">
        {!actor ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : (
          <>
            {!isChild && (
              <label className="flex items-center gap-2 text-sm text-ink-2">
                Send to
                <select
                  aria-label="Recipient"
                  value={adultRecipientId}
                  onChange={(event) => setSelectedRecipientId(event.target.value)}
                  className="min-h-12 rounded-md border border-line bg-surface px-3 text-sm text-ink"
                >
                  {sendableMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex items-center gap-4">
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
                  "h-[88px] w-[88px] shrink-0 touch-none select-none rounded-full",
                  "flex items-center justify-center border-2 border-accent-2/50",
                  "bg-accent text-white shadow-panel transition-transform active:scale-95",
                  "disabled:pointer-events-none disabled:opacity-40",
                  recording && "animate-pulse ring-8 ring-accent-2/20",
                )}
              >
                <Mic size={40} strokeWidth={2} aria-hidden />
              </button>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {statusText && (
                  <p aria-live="polite" className="text-sm font-medium text-ink">
                    {statusText}
                  </p>
                )}
                {isChild &&
                  (latestNoteRef.current ? (
                    <p className="text-xs text-ink-3">
                      Replying to{" "}
                      {memberById.get(latestNoteRef.current.senderId)?.displayName ?? "Unknown"}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-3">No voice notes yet</p>
                  ))}
              </div>
            </div>

            {recorder.status === "error" && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-danger">
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

            {notes.length > 0 ? (
              <ul aria-label="Voice notes" className="flex flex-col gap-2">
                {notes.map((note) => {
                  const sender = memberById.get(note.senderId);
                  const SenderIcon = memberIcon(sender?.icon ?? "user");
                  return (
                    <li
                      key={note.id}
                      className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2"
                    >
                      <SenderIcon
                        size={20}
                        strokeWidth={2}
                        aria-hidden
                        style={{ color: `var(--color-${sender?.color ?? "coral"})` }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">
                            {sender?.displayName ?? "Unknown"}
                          </span>
                          <time
                            dateTime={note.createdAt}
                            title={note.createdAt}
                            className="text-xs text-ink-3"
                          >
                            {formatTime(note.createdAt)}
                          </time>
                          {!note.readAt && (
                            <span
                              aria-label="Unread"
                              title="Unread"
                              className="inline-block size-2 shrink-0 rounded-full bg-accent"
                            />
                          )}
                        </div>
                        {note.transcript ? (
                          <p className="truncate text-xs text-ink-2">{note.transcript}</p>
                        ) : (
                          <p className="text-xs text-ink-3">Voice note</p>
                        )}
                      </div>
                      <VoiceNotePlayer
                        audioUrl={note.audioUrl}
                        onStarted={() => {
                          if (!note.readAt) markRead.mutate(note.id);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              !notesQuery.isPending && <p className="text-sm text-ink-3">No voice notes yet</p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
