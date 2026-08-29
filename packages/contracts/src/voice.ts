import { z } from "zod";
import { IsoDate } from "./core.js";

export const VoiceState = z.enum([
  "idle",
  "listening",
  "thinking",
  "confirming",
  "executing",
  "speaking",
  "cancelled",
  "error",
]);
export type VoiceState = z.infer<typeof VoiceState>;

/** A proposed tool call from the assistant, validated by the API before execution. */
export const ToolCall = z.object({
  tool: z.string(),
  arguments: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCall>;

export const RiskLevel = z.enum(["read-only", "reversible", "sensitive", "destructive"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const VoiceTurn = z.object({
  id: z.string(),
  text: z.string(),
  state: VoiceState,
  /** Partial transcript when listening. */
  transcript: z.string().optional(),
  reply: z.string().optional(),
  toolCalls: z.array(ToolCall).default([]),
  requiresConfirmation: z.boolean().default(false),
  risk: RiskLevel.default("read-only"),
  createdAt: IsoDate,
});
export type VoiceTurn = z.infer<typeof VoiceTurn>;

/** Submit a (typed or transcribed) utterance to the assistant. */
export const VoiceRequest = z.object({
  text: z.string().min(1),
  sessionId: z.string().optional(),
});
export type VoiceRequest = z.infer<typeof VoiceRequest>;
