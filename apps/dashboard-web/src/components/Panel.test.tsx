import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calendar } from "lucide-react";
import { Panel } from "./Panel";

const TITLE = "Schedule";
const BODY = "Panel body content";

function renderPanel(props: Partial<React.ComponentProps<typeof Panel>> = {}) {
  const { container } = render(
    <Panel title={TITLE} icon={Calendar} {...props}>
      {BODY}
    </Panel>,
  );
  const section = container.querySelector("section")!;
  const header = screen.getByText(TITLE).closest("header")!;
  const body = screen.getByText(BODY);
  return { section, header, body };
}

describe("Panel", () => {
  it("renders the title and header icon", () => {
    const { section } = renderPanel();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(section.querySelector("header svg")).toBeInTheDocument();
  });

  it("keeps the card treatment (radius, border, panel bg, shadow, blur)", () => {
    const { section } = renderPanel();
    for (const cls of [
      "rounded-xl",
      "border-line",
      "bg-panel",
      "shadow-panel",
      "backdrop-blur-md",
    ]) {
      expect(section.className).toContain(cls);
    }
  });

  it("default density uses 24px standard padding (header px-6, body px-6 pb-6)", () => {
    const { header, body } = renderPanel();
    expect(header.className).toContain("px-6");
    expect(header.className).toContain("pt-4");
    expect(header.className).toContain("pb-3");
    expect(body.className).toContain("px-6");
    expect(body.className).toContain("pb-6");
  });

  it("defaults to standard density when no density is given", () => {
    const { header, body } = renderPanel();
    expect(header.className).toContain("px-6");
    expect(body.className).toContain("px-6");
    expect(header.className).not.toContain("px-4");
  });

  it('compact density uses 16px padding (header px-4, body px-4 pb-4)', () => {
    const { header, body } = renderPanel({ density: "compact" });
    expect(header.className).toContain("px-4");
    expect(header.className).toContain("pt-3");
    expect(header.className).toContain("pb-2");
    expect(body.className).toContain("px-4");
    expect(body.className).toContain("pb-4");
    expect(body.className).not.toContain("px-6");
  });
});
