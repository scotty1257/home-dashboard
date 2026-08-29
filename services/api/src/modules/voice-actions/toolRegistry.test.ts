import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "./toolRegistry.js";

function stubDeps(overrides: Record<string, unknown> = {}) {
  return {
    calendar: { create: vi.fn().mockReturnValue({ id: "e1" }), list: vi.fn().mockReturnValue([]) },
    spotify: { command: vi.fn().mockResolvedValue(undefined) },
    home: {
      getSnapshot: vi.fn().mockResolvedValue({ entities: [] }),
      provider: { execute: vi.fn().mockResolvedValue(undefined) },
    },
    weather: { getReport: vi.fn().mockResolvedValue({ current: { temperature: 70 } }) },
    ...overrides,
  } as never;
}

describe("ToolRegistry", () => {
  it("lists all six tools with names, risk, and parameters", () => {
    const registry = new ToolRegistry(stubDeps());
    const tools = registry.list();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_event",
      "get_weather",
      "home_control",
      "list_home_devices",
      "media_control",
      "query_calendar",
    ]);
    expect(tools.find((t) => t.name === "get_weather")!.risk).toBe("read-only");
  });

  it("reports correct risk levels", () => {
    const registry = new ToolRegistry(stubDeps());
    expect(registry.riskOf("get_weather")).toBe("read-only");
    expect(registry.riskOf("create_event")).toBe("reversible");
    expect(registry.riskOf("home_control")).toBe("sensitive");
    expect(registry.riskOf("media_control")).toBe("reversible");
  });

  it("returns undefined risk for unknown tools", () => {
    const registry = new ToolRegistry(stubDeps());
    expect(registry.riskOf("hack_the_planet")).toBeUndefined();
  });

  it("rejects unknown tools on execute", async () => {
    const registry = new ToolRegistry(stubDeps());
    await expect(registry.execute("hack_the_planet", {})).rejects.toThrow(/Unknown tool/);
  });

  it("rejects invalid arguments against the schema", async () => {
    const registry = new ToolRegistry(stubDeps());
    await expect(registry.execute("create_event", { title: "missing dates" })).rejects.toThrow(/Invalid arguments/);
  });

  it("dispatches get_weather through the weather dep", async () => {
    const deps = stubDeps();
    const registry = new ToolRegistry(deps);
    const { result, risk } = await registry.execute("get_weather", {});
    expect(risk).toBe("read-only");
    expect((deps as never as { weather: { getReport: ReturnType<typeof vi.fn> } }).weather.getReport).toHaveBeenCalledOnce();
    expect((result as { current: { temperature: number } }).current.temperature).toBe(70);
  });
});
