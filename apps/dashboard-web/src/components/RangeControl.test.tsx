import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { RangeControl } from "./RangeControl";

/** Renders RangeControl the way real screens do — as a controlled input. */
function StatefulRangeControl({
  initialValue = 50,
  onChange,
  ...props
}: {
  initialValue?: number;
  onChange?: (value: number) => void;
} & Omit<React.ComponentProps<typeof RangeControl>, "value" | "onChange">) {
  const [value, setValue] = useState(initialValue);
  return (
    <RangeControl
      value={value}
      min={0}
      max={100}
      step={1}
      aria-label="Volume"
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      {...props}
    />
  );
}

describe("RangeControl", () => {
  it("renders an accessible slider with the given label", () => {
    render(<StatefulRangeControl />);
    const input = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe("range");
    expect(input.value).toBe("50");
  });

  it("keeps a 48px interactive hit area on the input", () => {
    render(<StatefulRangeControl />);
    const input = screen.getByRole("slider", { name: "Volume" });
    expect(input.className).toContain("h-12");
    expect(input.className).toContain("w-full");
  });

  it("passes through min/max/step to the native input", () => {
    render(<StatefulRangeControl min={10} max={90} step={5} />);
    const input = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    expect(input.min).toBe("10");
    expect(input.max).toBe("90");
    expect(input.step).toBe("5");
  });

  it("steps the value up on ArrowRight and reports the change", () => {
    const onChange = vi.fn();
    render(<StatefulRangeControl onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(51);
    expect(input.value).toBe("51");
  });

  it("steps the value down on ArrowLeft", () => {
    const onChange = vi.fn();
    render(<StatefulRangeControl onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(49);
    expect(input.value).toBe("49");
  });

  it("jumps to the ends with Home/End", () => {
    const onChange = vi.fn();
    render(<StatefulRangeControl onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: "End" });
    expect(onChange).toHaveBeenCalledWith(100);
    expect(input.value).toBe("100");
    fireEvent.keyDown(input, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith(0);
    expect(input.value).toBe("0");
  });

  it("clamps at the bounds and does not report a change when pinned", () => {
    const onChange = vi.fn();
    render(<StatefulRangeControl initialValue={100} onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("100");
  });

  it("does not step when disabled", () => {
    const onChange = vi.fn();
    render(<StatefulRangeControl disabled onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("50");
  });
});
