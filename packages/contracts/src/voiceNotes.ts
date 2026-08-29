import { z } from "zod";
import { IsoDate } from "./core";

/** A recorded voice message between household members. */
export const VoiceNote = z.object({
  id: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  inReplyToId: z.string().optional(),
  /** Relative path served by the API. */
  audioUrl: z.string(),
  mimeType: z.enum(["audio/webm", "audio/ogg", "audio/mp4"]),
  durationMs: z.number().int().min(0).max(60000),
  sizeBytes: z.number().int().min(0),
  transcript: z.string().optional(),
  createdAt: IsoDate,
  readAt: IsoDate.nullable().optional(),
});
export type VoiceNote = z.infer<typeof VoiceNote>;

/** Metadata part of the multipart upload (the audio file travels alongside). */
export const VoiceNoteInput = z.object({
  senderId: z.string(),
  recipientId: z.string(),
  inReplyToId: z.string().optional(),
  mimeType: z.enum(["audio/webm", "audio/ogg", "audio/mp4"]),
  durationMs: z.number().int().min(0).max(60000),
  transcript: z.string().max(2000).optional(),
});
export type VoiceNoteInput = z.input<typeof VoiceNoteInput>;

export const VoiceNoteListResponse = z.object({
  notes: z.array(VoiceNote),
});
export type VoiceNoteListResponse = z.infer<typeof VoiceNoteListResponse>;
