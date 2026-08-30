import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHoldToRecord } from "./useHoldToRecord";

/**
 * Fake MediaRecorder standing in for the one jsdom lacks: records constructed
 * mime, state transitions, and delivers a final dataavailable + onstop pair on
 * stop() exactly like the real element does.
 */
class FakeRecorder {
  static readonly instances: FakeRecorder[] = [];
  static readonly supported = ["audio/webm", "audio/mp4", "audio/ogg"];

  static isTypeSupported(mime: string): boolean {
    return FakeRecorder.supported.includes(mime);
  }

  static last(): FakeRecorder {
    const instance = FakeRecorder.instances.at(-1);
    if (!instance) throw new Error("no FakeRecorder was constructed");
    return instance;
  }

  mimeType: string;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeRecorder.instances.push(this);
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["fake-audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

/** Installs a fake mic stream and the MediaRecorder global. */
function installMedia(overrides?: { getUserMedia?: () => Promise<unknown> }) {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  const getUserMedia = overrides?.getUserMedia ?? vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  return { getUserMedia, stopTrack };
}

describe("useHoldToRecord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecorder.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });

  it("start() requests the mic, records with the first supported mime, and ticks the timer", async () => {
    const { getUserMedia } = installMedia();
    const upload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useHoldToRecord({ upload }));

    expect(result.current.status).toBe("idle");
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.status).toBe("recording");
    expect(FakeRecorder.last().mimeType).toBe("audio/webm");
    expect(FakeRecorder.last().state).toBe("recording");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.durationMs).toBe(300);
  });

  it("stops under the 300ms minimum: discards the take, releases tracks, never uploads", async () => {
    const { stopTrack } = installMedia();
    const upload = vi.fn();
    const { result } = renderHook(() => useHoldToRecord({ upload }));

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.stop();
    });

    expect(upload).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
    expect(result.current.durationMs).toBe(0);
  });

  it("stop() after the minimum uploads once with blob, mime, and duration, then returns to idle", async () => {
    const { stopTrack } = installMedia();
    const upload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useHoldToRecord({ upload }));

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => {
      result.current.stop();
    });

    expect(upload).toHaveBeenCalledTimes(1);
    const [blob, mime, durationMs, transcript] = upload.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect(mime).toBe("audio/webm");
    expect(durationMs).toBe(400);
    expect(transcript).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.durationMs).toBe(0);
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it("cancel() discards the take and releases tracks without uploading", async () => {
    const { stopTrack } = installMedia();
    const upload = vi.fn();
    const { result } = renderHook(() => useHoldToRecord({ upload }));

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.cancel();
    });

    expect(upload).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("auto-stops at maxMs and uploads once even without a pointerup", async () => {
    const { stopTrack } = installMedia();
    const upload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useHoldToRecord({ upload }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.last().state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");

    // A late pointerup after the auto-stop must not double-upload.
    act(() => {
      result.current.stop();
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("maps a denied mic to a recoverable mic-denied error", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }));
    installMedia({ getUserMedia });
    const upload = vi.fn();
    const { result } = renderHook(() => useHoldToRecord({ upload }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("mic-denied");
    expect(upload).not.toHaveBeenCalled();

    // Recoverable: once permission is granted, start() works again.
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("recording");
  });

  it("reports unsupported when MediaRecorder is missing entirely", async () => {
    // Mic available, but no MediaRecorder global at all.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });
    const upload = vi.fn();
    const { result } = renderHook(() => useHoldToRecord({ upload }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("unsupported");
    expect(upload).not.toHaveBeenCalled();
  });
});
