import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "./Select";

const OPTIONS = [
  { value: "a", label: "Alex" },
  { value: "b", label: "Blair" },
  { value: "c", label: "Casey" },
];

function setup(value = "a", onChange = vi.fn()) {
  render(<Select value={value} options={OPTIONS} onChange={onChange} label="Send to" />);
  return { onChange, trigger: screen.getByRole("combobox", { name: "Send to" }) };
}

describe("Select", () => {
  it("shows the selected option's label on the trigger", () => {
    const { trigger } = setup("b");
    expect(trigger).toHaveTextContent("Blair");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a listbox and commits the tapped option", async () => {
    const user = userEvent.setup();
    const { onChange, trigger } = setup();
    await user.click(trigger);

    const list = screen.getByRole("listbox", { name: "Send to" });
    expect(within(list).getAllByRole("option")).toHaveLength(3);

    await user.click(within(list).getByRole("option", { name: /Casey/ }));
    expect(onChange).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("marks the current value as the selected option", async () => {
    const user = userEvent.setup();
    const { trigger } = setup("b");
    await user.click(trigger);
    expect(screen.getByRole("option", { name: /Blair/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Alex/ })).toHaveAttribute("aria-selected", "false");
  });

  it("supports keyboard selection with arrows and Enter", async () => {
    const user = userEvent.setup();
    const { onChange, trigger } = setup("a");
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("closes on Escape without changing the value", async () => {
    const user = userEvent.setup();
    const { onChange, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the trigger and every option on the touch target", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    expect(trigger.className).toContain("min-h-touch");
    await user.click(trigger);
    for (const option of screen.getAllByRole("option")) {
      expect(option.className).toContain("min-h-touch");
    }
  });
});
