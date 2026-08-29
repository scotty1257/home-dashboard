import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Panel } from "../../components/Panel";
import { TouchButton } from "../../components/TouchButton";
import { useActiveActor } from "../household/ActorSwitcher";
import { DutyGrid } from "./DutyLedger";

/** The selectable rolling windows, in days. */
const WINDOWS = [7, 30, 90] as const;

interface Props {
  /** Taps navigate to the Family screen; the parent wires this in a later task. */
  onOpen?: () => void;
}

/**
 * Today column tile: the duty quick-log grid for the selected rolling window
 * (7/30/90-day pills). Counts and streaks are per-duty facts for the window;
 * there is deliberately no household total or winner.
 */
export function DutyLedgerTile({ onOpen }: Props) {
  const { actor } = useActiveActor();
  const [windowDays, setWindowDays] = useState<number>(30);

  const { data: summary } = useQuery({
    queryKey: ["duties", windowDays],
    queryFn: () => api.duties.summary(windowDays),
  });

  return (
    <Panel
      title="Duties"
      actions={
        <div className="flex items-center gap-1" role="group" aria-label="Summary window">
          {WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={days === windowDays}
              onClick={() => setWindowDays(days)}
              className={cn(
                "min-h-12 rounded-md px-3 text-xs font-semibold transition-colors",
                days === windowDays
                  ? "bg-accent text-white"
                  : "border border-line bg-surface text-ink-2 hover:bg-raised",
              )}
            >
              {days}d
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <DutyGrid summary={summary} actor={actor} />
        {onOpen && (
          <TouchButton variant="ghost" icon={ChevronRight} onClick={onOpen} className="self-start">
            View all
          </TouchButton>
        )}
      </div>
    </Panel>
  );
}
