import { Bell } from "lucide-react";
import { useNotificationStore } from "../../lib/store";
import { TouchButton } from "../../components/TouchButton";
import { useNotifications } from "./NotificationDrawer";

/**
 * Header bell: opens the notification drawer and carries the unclaimed-handoff
 * count as a badge, so the alerts are visible without eating the Today grid.
 */
export function NotificationBell() {
  const setOpen = useNotificationStore((s) => s.setOpen);
  const count = useNotifications().length;

  return (
    <span className="relative inline-flex">
      <TouchButton
        variant="ghost"
        icon={Bell}
        iconOnly
        aria-label={count === 0 ? "Notifications" : `Notifications, ${count} needing attention`}
        onClick={() => setOpen(true)}
      />
      {count > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-meta font-semibold leading-none text-white"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </span>
  );
}
