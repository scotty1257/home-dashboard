import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Star, Plug } from "lucide-react";
import type { EntityState } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { Panel } from "../../components/Panel";
import { Select } from "../../components/Select";
import { colorList } from "../../lib/colors";
import { cn } from "../../lib/cn";
import { ICON } from "../../lib/icons";

const field =
  "min-h-touch w-full rounded-control border border-line bg-surface px-4 text-body text-ink " +
  "placeholder:text-ink-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/60";

/** The name shown for an entity: the dashboard alias if set, else HA's own. */
function displayName(entity: EntityState): string {
  const alias = (entity as EntityState & { alias?: string }).alias;
  return alias?.trim() || entity.name;
}

/**
 * Choose which Home Assistant entities the dashboard shows, and how.
 *
 * Home Assistant stays the source of truth for what exists — this pins a
 * subset to the Home screen and gives each a name and colour for the kiosk.
 * The overrides API backing this has existed all along with no caller, so the
 * settings screen could only tell you to go and edit environment variables.
 */
export function HomeEntitiesPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["home"], queryFn: api.home });
  const [query, setQuery] = useState("");

  const patch = useMutation({
    mutationFn: ({ id, ...rest }: { id: string } & Parameters<typeof api.patchEntity>[1]) =>
      api.patchEntity(id, rest),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["home"] }),
  });

  const entities = data?.entities ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? entities.filter(
          (e) =>
            displayName(e).toLowerCase().includes(needle) ||
            e.id.toLowerCase().includes(needle) ||
            (e.area ?? "").toLowerCase().includes(needle),
        )
      : entities;
    // Favourites first, then by area, then by name — the pinned set is what
    // this panel is mostly used to review.
    return [...matches].sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      const area = (a.area ?? "").localeCompare(b.area ?? "");
      if (area !== 0) return area;
      return displayName(a).localeCompare(displayName(b));
    });
  }, [entities, query]);

  const favorites = entities.filter((e) => e.favorite).length;

  return (
    <Panel title="Home Assistant devices" icon={Plug} accent="teal">
      <div className="flex flex-col gap-3">
        <p className="text-meta text-ink-3">
          {data?.connected === false
            ? "Home Assistant unreachable — showing the last known list."
            : `${entities.length} available · ${favorites} on the Home screen`}
        </p>

        <label className="relative flex items-center">
          <Search
            size={ICON.sm}
            aria-hidden
            className="pointer-events-none absolute left-4 text-ink-4"
          />
          <input
            className={cn(field, "pl-11")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices"
            aria-label="Search devices"
          />
        </label>

        {filtered.length === 0 && (
          <p className="py-4 text-center text-body text-ink-3">No matching devices.</p>
        )}

        <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
          {filtered.map((entity) => {
            const pinned = entity.favorite ?? false;
            const alias = (entity as EntityState & { alias?: string }).alias ?? "";
            return (
              <li
                key={entity.id}
                className="flex items-center gap-3 rounded-panel border border-line bg-surface p-2.5"
              >
                <button
                  type="button"
                  aria-label={
                    pinned
                      ? `Remove ${displayName(entity)} from the Home screen`
                      : `Show ${displayName(entity)} on the Home screen`
                  }
                  aria-pressed={pinned}
                  onClick={() => patch.mutate({ id: entity.id, favorite: !pinned })}
                  className={cn(
                    "flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-pill transition-colors",
                    pinned ? "bg-accent text-white" : "border border-line text-ink-4 hover:text-ink",
                  )}
                >
                  <Star size={ICON.md} strokeWidth={2} fill={pinned ? "currentColor" : "none"} />
                </button>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium text-ink">
                    {displayName(entity)}
                  </span>
                  <span className="truncate text-meta text-ink-4">
                    {entity.area ? `${entity.area} · ` : ""}
                    {entity.id}
                  </span>
                </div>

                <input
                  className={cn(field, "w-36 shrink-0")}
                  defaultValue={alias}
                  placeholder="Rename"
                  aria-label={`Rename ${displayName(entity)}`}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next === alias) return;
                    patch.mutate({ id: entity.id, alias: next });
                  }}
                />

                <div className="w-32 shrink-0">
                  <Select
                    label="Colour"
                    value={entity.color ?? "slate"}
                    onChange={(v) =>
                      patch.mutate({ id: entity.id, color: v as EntityState["color"] })
                    }
                    options={colorList.map((c) => ({ value: c, label: c }))}
                  />
                </div>

              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
