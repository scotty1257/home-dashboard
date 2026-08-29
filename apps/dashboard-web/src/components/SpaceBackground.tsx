import type { CSSProperties } from "react";

/* Deterministic pseudo-random (stable across renders). */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Star {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  tone: string;
}

const STAR_TONES = ["--star-a", "--star-b", "--star-c", "--star-d", "--star-e"];

const STARS: Star[] = Array.from({ length: 110 }, (_, i) => ({
  left: seeded(i) * 100,
  top: seeded(i + 900) * 100,
  size: 1 + seeded(i + 1800) * 2.4,
  duration: 3 + seeded(i + 2700) * 5,
  delay: seeded(i + 3600) * 6,
  tone: STAR_TONES[i % STAR_TONES.length]!,
}));

interface Planet {
  size: number;
  color: string;
  colorLight: string;
  glow: string;
}

interface Orbit {
  size: number;
  tilt: number;
  azimuth: number;
  duration: number;
  planet: Planet;
}

const ORBITS: Orbit[] = [
  {
    size: 440,
    tilt: 60,
    azimuth: 18,
    duration: 36,
    planet: { size: 14, color: "#2fae97", colorLight: "#7ff0dd", glow: "rgba(63,198,178,0.8)" },
  },
  {
    size: 600,
    tilt: 63,
    azimuth: -14,
    duration: 52,
    planet: { size: 20, color: "#5e6ad2", colorLight: "#aab2ff", glow: "rgba(124,140,255,0.8)" },
  },
  {
    size: 780,
    tilt: 66,
    azimuth: 8,
    duration: 74,
    planet: { size: 15, color: "#e0753a", colorLight: "#ffc08a", glow: "rgba(255,122,92,0.75)" },
  },
  {
    size: 960,
    tilt: 68,
    azimuth: -6,
    duration: 100,
    planet: { size: 22, color: "#b03f8a", colorLight: "#f2a0d6", glow: "rgba(255,122,184,0.75)" },
  },
];

function planetStyle(p: Planet): CSSProperties {
  return {
    width: p.size,
    height: p.size,
    background: `radial-gradient(circle at 32% 30%, ${p.colorLight}, ${p.color} 72%)`,
    ["--planet-glow" as string]: p.glow,
  } as CSSProperties;
}

/** Animated space backdrop: drifting nebulae, twinkling stars, orbiting planets. */
export function SpaceBackground() {
  return (
    <div className="space" aria-hidden>
      <div className="space__glow" />
      <div className="space__nebula space__nebula--a" />
      <div className="space__nebula space__nebula--b" />
      <div className="space__nebula space__nebula--c" />

      {STARS.map((s, i) => (
        <span
          key={i}
          className="space__star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            ["--star-tone" as string]: `var(${s.tone})`,
            ["--tw-dur" as string]: `${s.duration}s`,
            ["--tw-delay" as string]: `${s.delay}s`,
          } as CSSProperties}
        />
      ))}

      {ORBITS.map((o, i) => (
        <div key={i} className="space__orbit" style={{ width: o.size, height: o.size }}>
          <div
            className="space__orbit-plane"
            style={
              {
                ["--orbit-tilt" as string]: `${o.tilt}deg`,
                ["--orbit-azimuth" as string]: `${o.azimuth}deg`,
              } as CSSProperties
            }
          >
            <div
              className="space__orbit-ring"
              style={{ ["--orbit-dur" as string]: `${o.duration}s` } as CSSProperties}
            >
              <span className="space__planet" style={planetStyle(o.planet)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
