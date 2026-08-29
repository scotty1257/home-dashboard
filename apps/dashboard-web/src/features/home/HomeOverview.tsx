import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EntityState } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { EntityControl } from "./EntityControl";
import { useHomeCommand } from "./useHomeCommand";
import { colorOf } from "../../lib/format";
import "./HomeOverview.css";

interface Props {
  /** Show only favorites (used on the Overview screen's strip). */
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
    <div className="home-overview">
      {!favoritesOnly && scenes.length > 0 && (
        <div className="home-scenes">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className="scene-btn"
              style={{ "--scene-accent": colorOf(scene.color) } as CSSProperties}
              onClick={() => command.mutate({ entityId: scene.id, action: "turn_on", params: {} })}
            >
              <span className="scene-btn__icon">{scene.icon ?? "🎬"}</span>
              <span className="scene-btn__name">{scene.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className={`entity-grid ${favoritesOnly ? "entity-grid--favorites" : ""}`}>
        {entities.map((e) => (
          <EntityControl key={e.id} entity={e as EntityState} large={!favoritesOnly && (e.favorite ?? false)} />
        ))}
      </div>

      {!connected && <div className="home-offline">Home Assistant unreachable — showing last known state.</div>}
    </div>
  );
}
