import type { CSSProperties } from "react";
import type { WeatherCondition } from "@home-dashboard/contracts";
import { cn } from "../../lib/cn";

/* Deterministic pseudo-random, matching SpaceBackground: particle positions
   stay put across re-renders instead of jittering on every poll. */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Props {
  condition: WeatherCondition;
  /** Open-Meteo's day/night flag — drives the sun-vs-moon and sky treatment. */
  isDay: boolean;
  className?: string;
}

/** Falling streaks (rain, drizzle, sleet) or dots (snow). */
function Precipitation({
  count,
  kind,
  seed,
}: {
  count: number;
  kind: "rain" | "drizzle" | "snow";
  seed: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const left = seeded(seed + i) * 100;
        const delay = seeded(seed + i + 400) * 2.2;
        const drift = 6 + seeded(seed + i + 800) * 10;

        if (kind === "snow") {
          const size = 3 + seeded(seed + i + 1200) * 3;
          return (
            <span
              key={i}
              className="absolute top-[-10%] rounded-pill bg-white/70 animate-[snowFall_var(--dur)_linear_infinite]"
              style={
                {
                  left: `${left}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  "--dur": `${5 + seeded(seed + i + 1600) * 4}s`,
                  "--drift": `${drift}px`,
                  animationDelay: `${delay}s`,
                } as CSSProperties
              }
            />
          );
        }

        const height = kind === "drizzle" ? 6 + seeded(seed + i + 1200) * 5 : 12 + seeded(seed + i + 1200) * 10;
        return (
          <span
            key={i}
            className={cn(
              "absolute top-[-12%] w-px rounded-pill animate-[rainFall_var(--dur)_linear_infinite]",
              kind === "drizzle" ? "bg-sky/40" : "bg-sky/60",
            )}
            style={
              {
                left: `${left}%`,
                height: `${height}px`,
                "--dur": `${(kind === "drizzle" ? 1.4 : 0.9) + seeded(seed + i + 1600) * 0.7}s`,
                animationDelay: `${delay}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </>
  );
}

/** Soft drifting cloud masses. */
function Clouds({ count, opacity }: { count: number; opacity: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const size = 70 + seeded(i + 40) * 60;
        return (
          <span
            key={i}
            className="absolute rounded-pill bg-white blur-2xl animate-[cloudDrift_var(--dur)_ease-in-out_infinite_alternate]"
            style={
              {
                left: `${8 + seeded(i + 80) * 62}%`,
                top: `${seeded(i + 120) * 22}%`,
                width: `${size}px`,
                height: `${size * 0.5}px`,
                opacity,
                "--dur": `${14 + seeded(i + 160) * 12}s`,
                animationDelay: `${seeded(i + 200) * 6}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </>
  );
}

/**
 * The living backdrop behind the weather readout: sun, moon, stars, clouds,
 * rain, snow, fog, wind, and lightning, drawn with CSS keyframes and tinted
 * divs (the same technique as SpaceBackground — no animation library, and no
 * emoji). Purely decorative: the condition is always also stated as an icon and
 * a label, and `prefers-reduced-motion` freezes all of it.
 */
export function WeatherScene({ condition, isDay, className }: Props) {
  const overcast = condition === "cloudy" || condition === "fog";

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-lg",
        className,
      )}
    >
      {/* Sky wash: warm by day, deep blue by night, grey when overcast. */}
      <div
        className={cn(
          "absolute inset-0 opacity-50",
          overcast
            ? "bg-gradient-to-b from-slate/25 to-transparent"
            : isDay
              ? "bg-gradient-to-b from-sky/20 to-transparent"
              : "bg-gradient-to-b from-indigo/25 to-transparent",
        )}
      />

      {/* Clear + partly cloudy: a sun or moon in the top-right. */}
      {(condition === "clear" || condition === "partly-cloudy") && (
        <span
          className={cn(
            "absolute right-[12%] top-[14%] h-16 w-16 rounded-pill blur-[2px]",
            "animate-[weatherGlow_9s_ease-in-out_infinite]",
            isDay
              ? "bg-[radial-gradient(circle,var(--color-amber)_0%,transparent_70%)]"
              : "bg-[radial-gradient(circle,var(--color-ink-2)_0%,transparent_70%)]",
          )}
        />
      )}

      {/* Night sky (clear only): a few twinkling stars, reusing the shell's keyframe. */}
      {!isDay && condition === "clear" &&
        Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="absolute rounded-pill bg-white animate-[twinkle_var(--dur)_ease-in-out_infinite]"
            style={
              {
                left: `${seeded(i + 300) * 100}%`,
                top: `${seeded(i + 600) * 60}%`,
                width: `${1 + seeded(i + 900) * 1.6}px`,
                height: `${1 + seeded(i + 900) * 1.6}px`,
                "--dur": `${3 + seeded(i + 1100) * 4}s`,
                animationDelay: `${seeded(i + 1400) * 5}s`,
              } as CSSProperties
            }
          />
        ))}

      {condition === "partly-cloudy" && <Clouds count={2} opacity={0.1} />}
      {condition === "cloudy" && <Clouds count={3} opacity={0.14} />}
      {(condition === "rain" || condition === "drizzle" || condition === "thunderstorm" ||
        condition === "sleet" || condition === "snow") && <Clouds count={3} opacity={0.12} />}

      {condition === "rain" && <Precipitation count={34} kind="rain" seed={1} />}
      {condition === "drizzle" && <Precipitation count={22} kind="drizzle" seed={2} />}
      {condition === "thunderstorm" && <Precipitation count={40} kind="rain" seed={3} />}
      {condition === "snow" && <Precipitation count={26} kind="snow" seed={4} />}
      {condition === "sleet" && (
        <>
          <Precipitation count={18} kind="rain" seed={5} />
          <Precipitation count={14} kind="snow" seed={6} />
        </>
      )}

      {/* Thunderstorm: an occasional sheet-lightning flash across the panel. */}
      {condition === "thunderstorm" && (
        <span className="absolute inset-0 bg-white opacity-0 animate-[lightningFlash_7s_ease-out_infinite]" />
      )}

      {/* Fog: soft horizontal bands sliding past each other. */}
      {condition === "fog" &&
        Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="absolute left-[-25%] h-6 w-[150%] rounded-pill bg-white/25 blur-md animate-[fogDrift_var(--dur)_ease-in-out_infinite_alternate]"
            style={
              {
                top: `${18 + i * 20}%`,
                "--dur": `${11 + seeded(i + 70) * 7}s`,
                animationDelay: `${seeded(i + 140) * 4}s`,
              } as CSSProperties
            }
          />
        ))}

      {/* Windy: fast streaks blowing across. */}
      {condition === "windy" &&
        Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="absolute left-[-30%] h-px rounded-pill bg-ink-3/40 animate-[windGust_var(--dur)_linear_infinite]"
            style={
              {
                top: `${12 + seeded(i + 20) * 70}%`,
                width: `${40 + seeded(i + 60) * 70}px`,
                "--dur": `${2.4 + seeded(i + 100) * 2}s`,
                animationDelay: `${seeded(i + 180) * 3}s`,
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
}
