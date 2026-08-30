import { WeatherPanel } from "../weather/WeatherPanel";
import { NowPlaying } from "../media/NowPlaying";
import { ActivityFeed } from "./ActivityFeed";
import { cn } from "../../lib/cn";

/**
 * A rail block: pinned to its share of the column so the panel box never
 * escapes the grid cell; anything taller scrolls inside the panel body.
 * (Every compact panel here renders a `section` at its root.)
 */
const BLOCK =
  "min-h-0 overflow-hidden [&>section]:h-full [&>section]:min-h-0 [&>section]:flex " +
  "[&>section]:flex-col [&>section>header]:shrink-0 [&>section>div]:min-h-0 " +
  "[&>section>div]:flex-1 [&>section>div]:overflow-y-auto";

/**
 * The Today grid's context column: compact weather up top, compact media in
 * the middle, and the activity feed at the bottom. The stack is fixed — the
 * three blocks share the column height, the rail itself never scrolls, and
 * the activity list scrolls internally when it overflows.
 */
export function ContextRail() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className={cn("flex-[2]", BLOCK)}>
        <WeatherPanel compact />
      </div>
      <div className={cn("flex-[1.6]", BLOCK)}>
        <NowPlaying compact />
      </div>
      <div className={cn("flex-[1.4]", BLOCK)}>
        <ActivityFeed compact />
      </div>
    </div>
  );
}
