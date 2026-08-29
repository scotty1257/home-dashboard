import { describe, it, expect } from "vitest";
import {
  CalendarEvent,
  CalendarEventInput,
  HealthStatus,
  WeatherReport,
  HomeCommand,
} from "./index";

describe("contracts", () => {
  it("accepts a minimal calendar event input and applies defaults", () => {
    const parsed = CalendarEventInput.safeParse({
      title: "Lunch",
      start: "2026-08-28T17:00:00Z",
      end: "2026-08-28T18:00:00Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.color).toBe("sky");
      expect(parsed.data.allDay).toBe(false);
    }
  });

  it("rejects a calendar event missing title", () => {
    const parsed = CalendarEvent.safeParse({
      id: "1",
      start: "2026-08-28T17:00:00Z",
      end: "2026-08-28T18:00:00Z",
      createdAt: "2026-08-28T17:00:00Z",
      updatedAt: "2026-08-28T17:00:00Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("validates health status", () => {
    const parsed = HealthStatus.safeParse({
      service: "api",
      status: "ok",
      checkedAt: "2026-08-28T17:00:00Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid weather units", () => {
    const parsed = WeatherReport.safeParse({
      location: "x",
      units: "kelvin",
      current: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("validates a home command", () => {
    const parsed = HomeCommand.safeParse({
      entityId: "light.living_room",
      action: "turn_on",
      params: { brightness: 100 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty home command action", () => {
    const parsed = HomeCommand.safeParse({ entityId: "light.living_room", action: "" });
    expect(parsed.success).toBe(false);
  });
});
