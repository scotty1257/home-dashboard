import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Baby, Check, Heart, Star, User, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HouseholdMember } from "@home-dashboard/contracts";
import { api } from "../../lib/api";
import { useActorStore } from "../../lib/store";
import { cn } from "../../lib/cn";

const ACTOR_STORAGE_KEY = "dashboard.actorId";

const MEMBER_ICONS: Record<HouseholdMember["icon"], LucideIcon> = {
  user: User,
  "user-round": UserRound,
  baby: Baby,
  heart: Heart,
  star: Star,
};

export function memberIcon(icon: HouseholdMember["icon"]): LucideIcon {
  return MEMBER_ICONS[icon] ?? User;
}

/**
 * Resolves and persists the active household member (the "actor" whose view
 * of the dashboard we are personalizing). Resolution order: the live store
 * selection, then the persisted id in localStorage, then the first adult,
 * then any first member. Selecting a member writes both.
 */
export function useActiveActor() {
  const actorId = useActorStore((s) => s.actorId);
  const setActorId = useActorStore((s) => s.setActorId);
  const { data, isLoading } = useQuery({ queryKey: ["household"], queryFn: api.household.list });

  const members = useMemo(() => data?.members ?? [], [data]);

  const actor = useMemo(() => {
    const byId = (id: string | null) => (id ? members.find((m) => m.id === id && m.active) : undefined);
    return (
      byId(actorId) ??
      byId(window.localStorage.getItem(ACTOR_STORAGE_KEY)) ??
      members.find((m) => m.role === "adult") ??
      members[0] ??
      null
    );
  }, [members, actorId]);

  const selectActor = useCallback(
    (id: string) => {
      setActorId(id);
      window.localStorage.setItem(ACTOR_STORAGE_KEY, id);
    },
    [setActorId],
  );

  return { members, actor, isLoading, selectActor };
}

/** Trigger + popover that switches the active person. Closes on Escape and outside pointerdown. */
export function ActorSwitcher() {
  const { members, actor, selectActor } = useActiveActor();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!actor) return null;

  const TriggerIcon = memberIcon(actor.icon);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Active person"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-raised"
      >
        <TriggerIcon
          size={16}
          strokeWidth={2}
          aria-hidden
          style={{ color: `var(--color-${actor.color})` }}
        />
        <span className="text-sm">{actor.displayName}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Household members"
          className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-line bg-panel p-1.5 shadow-panel"
        >
          {members.map((member) => {
            const RowIcon = memberIcon(member.icon);
            const isActive = member.id === actor.id;
            return (
              <button
                key={member.id}
                type="button"
                role="menuitem"
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  selectActor(member.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left transition-colors",
                  isActive ? "bg-raised" : "hover:bg-raised",
                )}
              >
                <RowIcon
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                  style={{ color: `var(--color-${member.color})` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{member.displayName}</span>
                  <span className="block text-xs capitalize text-ink-3">{member.role}</span>
                </span>
                {isActive && <Check size={16} aria-hidden className="shrink-0 text-ink-3" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
