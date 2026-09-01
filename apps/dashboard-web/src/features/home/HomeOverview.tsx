import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EntityState } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { EntityControl } from "./EntityControl";
import { useHomeCommand } from "./useHomeCommand";
import { colorOf } from "../../lib/colors";
import { cn } from "../../lib/cn";

interface Props {
  favoritesOnly?: boolean;
  max?: number;
}

export function HomeOverview({ favoritesOnly = false, max }: Props) {
  const { data } = useQuery({ queryKey: ["home"], queryFn: api.home, refetchInterval: 15_000 });
  const command = useHomeCommand();

  const entities = useMemo(() => {
    if (!data) return [];
    const list = favoritesOnly ? data.entities.filter((e) => e.favorite) : data.entities;
    return max ? list.slice(0, max) : list;
  }, [data, favoritesOnly, max]);

  if (!data) return null;

  const { scenes, connected } = data;

  return (
    <div className="flex flex-col gap-4">
      {!favoritesOnly && scenes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => command.mutate({ entityId: scene.id, action: "turn_on", params: {} })}
              className="flex shrink-0 items-center gap-2 rounded-pill border border-line bg-panel px-3.5 py-2.5 text-body font-medium text-ink transition-colors hover:bg-raised"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-pill"
                style={{ backgroundColor: colorOf(scene.color) }}
                aria-hidden
              />
              <span>{scene.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid gap-3", favoritesOnly ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3")}>
        {entities.map((e) => (
          <EntityControl key={e.id} entity={e as EntityState} large={!favoritesOnly && (e.favorite ?? false)} />
        ))}
      </div>

      {!connected && (
        <div className="rounded-inner bg-warning/15 px-4 py-2.5 text-body font-medium text-warning">
          Home Assistant unreachable — showing last known state.
        </div>
      )}
    </div>
  );
}
