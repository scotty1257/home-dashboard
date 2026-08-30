import { describe, expect, it } from "vitest";
import { invalidationsFor } from "./useLiveEvents";

/**
 * The invalidation map is the contract between the SSE stream and the React
 * Query cache: every domain event must refresh exactly the screens that show
 * its data. Family events always refresh the activity rail too, since the
 * feed merges handoff + permission status.
 */
describe("invalidationsFor", () => {
  it("keeps the existing core prefixes", () => {
    expect(invalidationsFor("calendar:changed")).toEqual([["calendar"]]);
    expect(invalidationsFor("home:state-changed")).toEqual([["home"]]);
    expect(invalidationsFor("media:state-changed")).toEqual([["media"]]);
    expect(invalidationsFor("weather:updated")).toEqual([["weather"]]);
    expect(invalidationsFor("settings:changed")).toEqual([["settings"]]);
    expect(invalidationsFor("activity:updated")).toEqual([["activity"]]);
  });

  it("maps every family event prefix to its query keys", () => {
    expect(invalidationsFor("household:changed")).toEqual([["household"]]);
    expect(invalidationsFor("handoff:changed")).toEqual([
      ["handoffs"],
      ["backup-contacts"],
      ["activity"],
    ]);
    expect(invalidationsFor("permission:changed")).toEqual([
      ["permissions"],
      ["permission-rules"],
      ["activity"],
    ]);
    expect(invalidationsFor("duty:changed")).toEqual([["duties"], ["activity"]]);
    expect(invalidationsFor("voice-note:changed")).toEqual([["voice-notes"], ["activity"]]);
    expect(invalidationsFor("launch:changed")).toEqual([["launch"], ["activity"]]);
  });

  it("returns nothing for unknown event types", () => {
    expect(invalidationsFor("mystery:changed")).toEqual([]);
    expect(invalidationsFor("voice:turn")).toEqual([]);
  });
});
