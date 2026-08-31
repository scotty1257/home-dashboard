import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** Accessible name; also used as the placeholder when nothing is selected. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Touch select. Replaces the native `<select>`, which renders the OS picker —
 * a mouse-sized dropdown in the host platform's design language, not ours.
 *
 * The trigger and every option sit on the canonical touch target, so this is
 * usable with a thumb. Behaviour follows the listbox pattern: Enter/Space open,
 * arrows move the highlight, Enter commits, Escape closes and restores focus to
 * the trigger. Closing on outside pointerdown mirrors `Sheet`.
 */
export function Select({ value, options, onChange, label, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // Open at the current selection rather than the top of the list.
  useEffect(() => {
    if (open) setActive(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pressable flex min-h-touch w-full items-center justify-between gap-3",
          "rounded-control border border-line bg-surface px-4 text-body text-ink",
          "transition-colors hover:bg-raised",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
          disabled && "pointer-events-none opacity-40",
        )}
      >
        <span className={cn("truncate", !selected && "text-ink-3")}>
          {selected?.label ?? label}
        </span>
        <ChevronDown
          size={20}
          strokeWidth={2}
          aria-hidden
          className={cn("shrink-0 text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute left-0 right-0 z-overlay mt-1 max-h-80 overflow-y-auto",
            "rounded-panel border border-line bg-raised p-1 shadow-raised",
          )}
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => commit(i)}
                  className={cn(
                    "flex min-h-touch w-full items-center justify-between gap-3 rounded-inner",
                    "px-3 text-left text-body text-ink transition-colors",
                    i === active && "bg-accent-soft",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <Check size={20} strokeWidth={2.25} className="shrink-0 text-accent" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
