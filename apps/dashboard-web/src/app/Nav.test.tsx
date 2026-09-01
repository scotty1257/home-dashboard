import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/renderWithProviders";
import { Nav } from "./Nav";
import { useNavStore } from "../lib/store";

describe("Nav", () => {
  it("renders exactly six tabs, including Launch", () => {
    renderWithProviders(<Nav />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const tabs = within(nav).getAllByRole("button");
    expect(tabs).toHaveLength(6);

    for (const label of ["Today", "Calendar", "Family", "Home", "Music", "Launch"]) {
      expect(within(nav).getByRole("button", { name: new RegExp(`^${label}$`) })).toBeInTheDocument();
    }

    // Settings lives in the header gear, never as a tab.
    expect(within(nav).queryByRole("button", { name: /settings/i })).not.toBeInTheDocument();
    // Launch owns a tab: rendered in full on Family it took a full-width row
    // and left the other three modules fighting over the bottom half.
    expect(within(nav).getByRole("button", { name: /^Launch$/ })).toBeInTheDocument();
  });

  it("switches the active view when a tab is tapped", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Nav />);

    await user.click(screen.getByRole("button", { name: /^Family$/ }));
    expect(useNavStore.getState().view).toBe("family");

    await user.click(screen.getByRole("button", { name: /^Today$/ }));
    expect(useNavStore.getState().view).toBe("today");
  });

  it("marks the active tab with aria-current", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Nav />);

    const family = await screen.findByRole("button", { name: /^Family$/ });
    await user.click(family);
    expect(family).toHaveAttribute("aria-current", "page");
  });
});
