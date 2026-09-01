import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HouseholdMember, VoiceNote } from "@home-dashboard/contracts";
import { renderWithProviders } from "../../test/renderWithProviders";

const householdListMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const uploadMock = vi.hoisted(() => vi.fn());
const markReadMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  api: {
    household: { list: householdListMock },
    voiceNotes: {
      list: listMock,
      upload: uploadMock,
      markRead: markReadMock,
      remove: removeMock,
    },
  },
}));

import { VoiceNoteTile } from "./VoiceNoteTile";
import { useActorStore } from "../../lib/store";

const stamp = "2026-08-29T12:00:00.000Z";

const MEMBERS: HouseholdMember[] = [
  {
    id: "member-you",
    displayName: "You",
    role: "adult",
    color: "coral",
    icon: "user",
    sortOrder: 0,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "member-partner",
    displayName: "Partner",
    role: "adult",
    color: "indigo",
    icon: "user-round",
    sortOrder: 1,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "member-kid",
    displayName: "Kid",
    role: "child",
    color: "teal",
    icon: "baby",
    sortOrder: 2,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
];

/** A voice note addressed to the kid; transcript omitted by default. */
function makeNote(overrides: Partial<VoiceNote> = {}): VoiceNote {
  return {
    id: "note-1",
    senderId: "member-partner",
    recipientId: "member-kid",
    audioUrl: "/api/voice-notes/note-1/audio",
    mimeType: "audio/webm",
    durationMs: 4200,
    sizeBytes: 2048,
    createdAt: stamp,
    readAt: null,
    ...overrides,
  };
}

/** Fake MediaRecorder so the hook can record inside jsdom. */
class FakeRecorder {
  static readonly instances: FakeRecorder[] = [];
  static readonly supported = ["audio/webm", "audio/mp4", "audio/ogg"];

  static isTypeSupported(mime: string): boolean {
    return FakeRecorder.supported.includes(mime);
  }

  mimeType: string;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    // Real browsers report the codec back on mimeType, not the bare string
    // handed to the constructor. Mirror that here so this fake cannot hide a
    // mime-normalization regression (see useHoldToRecord.test.ts).
    this.mimeType = `${options?.mimeType ?? "audio/webm"};codecs=opus`;
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

/** In-memory Storage stand-in (jsdom here has an opaque origin, so window.localStorage is undefined). */
function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
}

/** Installs the fake mic + recorder globals the tile's hook needs. */
function installMedia() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
}

describe("VoiceNoteTile", () => {
  beforeEach(() => {
    useActorStore.setState({ actorId: null });
    householdListMock.mockReset().mockResolvedValue({ members: MEMBERS });
    listMock.mockReset().mockResolvedValue({ notes: [] });
    uploadMock.mockReset().mockResolvedValue(undefined);
    markReadMock.mockReset().mockResolvedValue(undefined);
    removeMock.mockReset().mockResolvedValue(undefined);
    FakeRecorder.instances.length = 0;
    vi.stubGlobal("localStorage", makeLocalStorage());
    installMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });

  it("child actor: renders one hold-to-reply button and, once expanded, the notes addressed to them", async () => {
    useActorStore.setState({ actorId: "member-kid" });
    listMock.mockResolvedValue({
      notes: [
        makeNote({ id: "note-unread", readAt: null }),
        makeNote({ id: "note-read", senderId: "member-you", readAt: stamp }),
      ],
    });

    const { container } = renderWithProviders(<VoiceNoteTile />);

    // The tile is compact until expanded: the list is behind the disclosure.
    const show = await screen.findByRole("button", { name: "Show voice notes" });
    const user0 = userEvent.setup();
    await user0.click(show);

    // Notes addressed to the kid render with their senders.
    expect(await screen.findByText("Partner")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(listMock).toHaveBeenCalledWith("member-kid");

    // Class contract: exactly one round hold button.
    const sized = container.querySelectorAll('[class*="h-16"][class*="w-16"]');
    expect(sized).toHaveLength(1);
    const hold = screen.getByRole("button", { name: "Hold to reply" });
    expect(hold.className).toContain("h-16");
    expect(hold.className).toContain("w-16");

    // Unread badge only on the unread note.
    expect(screen.getAllByTitle("Unread")).toHaveLength(1);

    // A quick tap-and-release discards the take (< 300ms): no upload fires.
    const user = userEvent.setup();
    await user.pointer([
      { keys: "[MouseLeft>]", target: hold },
      { keys: "[/MouseLeft]", target: hold },
    ]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("stays compact until expanded, and hides the list again on collapse", async () => {
    useActorStore.setState({ actorId: "member-kid" });
    listMock.mockResolvedValue({
      notes: [makeNote({ id: "note-1", readAt: null }), makeNote({ id: "note-2", readAt: stamp })],
    });

    renderWithProviders(<VoiceNoteTile />);
    const user = userEvent.setup();

    // Collapsed: the recorder is there, the note list is not.
    const show = await screen.findByRole("button", { name: "Show voice notes" });
    expect(screen.queryByRole("list", { name: "Voice notes" })).not.toBeInTheDocument();
    // The toggle summarises what is waiting (2 notes, 1 unread).
    expect(show).toHaveTextContent("2");
    expect(show).toHaveTextContent("1 new");

    await user.click(show);
    expect(screen.getByRole("list", { name: "Voice notes" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide voice notes" }));
    expect(screen.queryByRole("list", { name: "Voice notes" })).not.toBeInTheDocument();
  });

  it("marks a note read when playback starts, but only if it is unread", async () => {
    useActorStore.setState({ actorId: "member-kid" });
    listMock.mockResolvedValue({
      notes: [
        makeNote({ id: "note-unread", readAt: null }),
        makeNote({ id: "note-read", senderId: "member-you", readAt: stamp }),
      ],
    });

    renderWithProviders(<VoiceNoteTile />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Show voice notes" }));

    const playButtons = await screen.findAllByRole("button", { name: "Play voice note" });
    expect(playButtons).toHaveLength(2);
    await user.click(playButtons[0]!);
    await waitFor(() => expect(markReadMock).toHaveBeenCalledWith("note-unread"));

    await user.click(playButtons[1]!);
    // Flush pending work: the already-read note must NOT be marked again.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(markReadMock).toHaveBeenCalledTimes(1);
  });

  it("renders a note that has no transcript (sender and time still shown)", async () => {
    useActorStore.setState({ actorId: "member-kid" });
    const bare = makeNote({ id: "note-bare" });
    expect(bare.transcript).toBeUndefined();
    listMock.mockResolvedValue({ notes: [bare] });

    renderWithProviders(<VoiceNoteTile />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Show voice notes" }));

    expect(await screen.findByText("Partner")).toBeTruthy();
    expect(screen.getByTitle(stamp)).toBeTruthy();
    // No transcript to show — the waveform and play button carry the note.
    expect(screen.getByRole("button", { name: "Play voice note" })).toBeTruthy();
  });
});
