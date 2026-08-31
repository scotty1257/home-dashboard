import { cn } from "../lib/cn";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** Compact switch on the canonical touch target. Accent-colored when on. */
export function Toggle({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-touch w-touch items-center justify-center rounded-inner",
        "transition-colors hover:bg-raised/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill border transition-colors",
          checked ? "bg-accent border-transparent" : "bg-surface border-line-strong",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-pill bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}
