import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TouchButton } from "./TouchButton";

describe("TouchButton", () => {
  it("renders its label", () => {
    render(<TouchButton>Save</TouchButton>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<TouchButton onClick={onClick}>Click</TouchButton>);
    await userEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("supports icon-only usage", () => {
    render(<TouchButton icon="▶" aria-label="Play" />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });
});
