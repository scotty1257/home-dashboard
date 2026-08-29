import type { InputHTMLAttributes, KeyboardEvent } from "react";
import { cn } from "../lib/cn";

interface Props
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange" | "min" | "max" | "step"
  > {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Called with the new value, already clamped to [min, max]. */
  onChange: (value: number) => void;
}

/**
 * Touch-friendly range slider.
 *
 * The 6px visual track and 24px thumb come from the global range CSS in
 * styles/app.css; the input itself is 48px tall (`h-12`) so the interactive
 * hit area always meets the 48px touch target. Keyboard stepping mirrors the
 * native behavior (arrows step by `step`, Home/End jump to the bounds) so it
 * also works where the browser default action is unavailable (e.g. jsdom);
 * `preventDefault` keeps the browser from double-stepping the same keypress.
 */
export function RangeControl({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled = false,
  className,
  ...rest
}: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = clamp(value + step);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = clamp(value - step);
        break;
      case "Home":
        next = clamp(min);
        break;
      case "End":
        next = clamp(max);
        break;
      default:
        return;
    }
    if (next === value) return;
    event.preventDefault();
    onChange(next);
  };

  return (
    <input
      type="range"
      className={cn("h-12 w-full cursor-pointer", className)}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      onKeyDown={handleKeyDown}
      {...rest}
    />
  );
}
