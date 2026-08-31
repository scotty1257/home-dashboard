import { useEffect, useRef, useState } from "react";

/**
 * A number that counts/rolls to its new value instead of snapping. Uses
 * requestAnimationFrame with an ease-out curve so it reads as a physical roll
 * rather than a tween. Respects prefers-reduced-motion (jumps straight there).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

const DURATION = 450; // ms — short enough to stay snappy, long enough to roll.

interface Props {
  value: number;
  /** Optional formatter applied to the displayed value (e.g. add a unit). */
  format?: (v: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format, className }: Props) {
  const [display, setDisplay] = useState(value);
  const reduced = useReducedMotion();
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const target = value;
    if (from === target) return;

    fromRef.current = target;

    if (reduced) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, reduced]);

  const text = format ? format(display) : String(display);
  return <span className={className}>{text}</span>;
}
