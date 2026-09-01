import { Search, X, ArrowLeftRight } from "lucide-react";
import type { ColorToken, HouseholdMember } from "@home-dashboard/contracts";
import { colorList, colorOf } from "../../lib/colors";
import { cn } from "../../lib/cn";
import { TouchButton } from "../../components/TouchButton";
import { isFiltering, toggleFacet, type CalendarFilter } from "./calendarFilters";

interface Props {
  filter: CalendarFilter;
  onChange: (filter: CalendarFilter) => void;
  members: HouseholdMember[];
  /** How many events survive the filter, shown as live feedback. */
  matchCount: number;
  onClose: () => void;
}

/**
 * The filter rail, revealed under the calendar header.
 *
 * Search, owner, color, and handoff narrowing all write into one `CalendarFilter`
 * that every view applies, so switching Month → Week keeps the same subset in
 * view rather than resetting it.
 */
export function CalendarToolbar({ filter, onChange, members, matchCount, onClose }: Props) {
  const active = isFiltering(filter);

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface/50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-64 flex-1 items-center">
          <Search size={20} aria-hidden className="pointer-events-none absolute left-3 text-ink-4" />
          <input
            type="search"
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
            placeholder="Search title, location, notes…"
            aria-label="Search events"
            className={cn(
              "min-h-touch w-full rounded-control border border-line bg-panel pl-11 pr-3",
              "text-body text-ink placeholder:text-ink-4",
              "focus:outline-none focus:ring-2 focus:ring-accent-2/50",
            )}
          />
        </label>

        <TouchButton
          variant={filter.handoffOnly ? "primary" : "soft"}
          icon={ArrowLeftRight}
          aria-pressed={filter.handoffOnly}
          onClick={() => onChange({ ...filter, handoffOnly: !filter.handoffOnly })}
        >
          Handoffs
        </TouchButton>

        {active && (
          <TouchButton variant="ghost" icon={X} onClick={() => onChange({ ...filter, query: "", owners: [], colors: [], handoffOnly: false })}>
            Clear
          </TouchButton>
        )}
        <TouchButton variant="ghost" icon={X} iconOnly aria-label="Hide filters" onClick={onClose} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {members.length > 0 && (
          <>
            <span className="text-meta font-medium text-ink-3">Who</span>
          {members.map((member) => {
            const on = filter.owners.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filter, owners: toggleFacet(filter.owners, member.id) })}
                className={cn(
                  "flex min-h-touch items-center gap-2 rounded-pill border px-4 text-body transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
                  on ? "border-transparent bg-accent text-white" : "border-line bg-panel text-ink-2 hover:bg-raised",
                )}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-pill"
                  style={{ backgroundColor: colorOf(member.color) }}
                />
                {member.displayName}
              </button>
            );
          })}
            <span aria-hidden className="mx-1 h-8 w-px bg-line" />
          </>
        )}

        <span className="text-meta font-medium text-ink-3">Color</span>
        {colorList.map((token) => {
          const on = filter.colors.includes(token as ColorToken);
          return (
            <button
              key={token}
              type="button"
              aria-label={token}
              aria-pressed={on}
              onClick={() =>
                onChange({ ...filter, colors: toggleFacet(filter.colors, token as ColorToken) })
              }
              // The swatch is 28px but the button keeps the full 56px target:
              // the extra height is padding, which costs the rail no rows
              // because the member pills on the same line are already 56px.
              className={cn(
                "flex h-touch w-9 items-center justify-center rounded-control transition-transform",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60",
                "active:scale-90",
              )}
            >
              <span
                className={cn(
                  "h-7 w-7 rounded-pill transition-transform",
                  on ? "ring-2 ring-ink ring-offset-2 ring-offset-panel" : "opacity-60",
                )}
                style={{ backgroundColor: colorOf(token) }}
              />
            </button>
          );
        })}
        <span className="ml-auto text-meta tabular-nums text-ink-4">
          {matchCount} {matchCount === 1 ? "event" : "events"} in view
        </span>
      </div>
    </div>
  );
}
