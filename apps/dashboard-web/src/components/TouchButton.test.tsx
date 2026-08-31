import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Play } from "lucide-react";
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

  it("supports icon-only usage with a Lucide icon", () => {
    render(<TouchButton icon={Play} iconOnly aria-label="Play" />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("gives every variant a >=56px touch target (min-h-touch)", () => {
    for (const variant of ["primary", "ghost", "soft", "danger"] as const) {
      const { container } = render(<TouchButton variant={variant}>Label</TouchButton>);
      expect(
        within(container).getByRole("button").className,
        `variant: ${variant}`,
      ).toContain("min-h-touch");
    }
  });

  it("icon-only buttons keep a >=56px minimum width (min-w-touch)", () => {
    render(<TouchButton icon={Play} iconOnly aria-label="Play" />);
    expect(screen.getByRole("button", { name: "Play" }).className).toContain("min-w-touch");
  });
});
