import { describe, it, expect } from "vitest";
import { DemoHomeProvider } from "./demoProvider.js";

describe("DemoHomeProvider", () => {
  it("returns a snapshot with entities, scenes, and areas", async () => {
    const provider = new DemoHomeProvider();
    const snap = await provider.snapshot();
    expect(snap.provider).toBe("demo");
    expect(snap.connected).toBe(true);
    expect(snap.entities.length).toBeGreaterThan(10);
    expect(snap.scenes.length).toBeGreaterThan(0);
    expect(snap.areas).toContain("Kitchen");
  });

  it("turns a light on and off", async () => {
    const provider = new DemoHomeProvider();
    await provider.execute({ entityId: "light.bedroom", action: "turn_on", params: {} });
    let snap = await provider.snapshot();
    expect(snap.entities.find((e) => e.id === "light.bedroom")!.state).toBe("on");

    await provider.execute({ entityId: "light.bedroom", action: "turn_off", params: {} });
    snap = await provider.snapshot();
    expect(snap.entities.find((e) => e.id === "light.bedroom")!.state).toBe("off");
  });

  it("sets brightness and keeps the light on", async () => {
    const provider = new DemoHomeProvider();
    await provider.execute({ entityId: "light.office", action: "set_brightness", params: { brightness: 80 } });
    const snap = await provider.snapshot();
    const office = snap.entities.find((e) => e.id === "light.office")!;
    expect(office.state).toBe("on");
    expect(office.attributes.brightness).toBe(80);
  });

  it("locks and unlocks a door", async () => {
    const provider = new DemoHomeProvider();
    await provider.execute({ entityId: "lock.front_door", action: "unlock", params: {} });
    let snap = await provider.snapshot();
    expect(snap.entities.find((e) => e.id === "lock.front_door")!.state).toBe("unlocked");

    await provider.execute({ entityId: "lock.front_door", action: "lock", params: {} });
    snap = await provider.snapshot();
    expect(snap.entities.find((e) => e.id === "lock.front_door")!.state).toBe("locked");
  });

  it("rejects unknown entities", async () => {
    const provider = new DemoHomeProvider();
    await expect(
      provider.execute({ entityId: "light.nope", action: "turn_on", params: {} }),
    ).rejects.toThrow(/Unknown entity/);
  });
});
