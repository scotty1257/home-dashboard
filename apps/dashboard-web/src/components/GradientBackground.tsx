/**
 * Ambient animated gradient backdrop.
 *
 * Four broad, off-centre colour pools drift and breathe across the viewport,
 * overlapping into shifting blends — the whole thing is CSS, so there is no
 * canvas, no render loop, and nothing to stop when the tab is hidden.
 *
 * It replaces a canvas-drawn mesh-network backdrop, which read as too busy
 * behind a dashboard. The palette still comes from the `--grad-*` tokens, so
 * the backdrop tracks the time-of-day theme exactly as the mesh did.
 *
 * Every layer animates `transform` and `opacity` only, so the compositor owns
 * them and an always-on kiosk is not repainting all day. The global
 * reduced-motion block in app.css freezes them, leaving a still gradient.
 */
export function GradientBackground() {
  return (
    <div className="grad-bg" aria-hidden>
      <div className="grad-bg__layer grad-bg__layer--a" />
      <div className="grad-bg__layer grad-bg__layer--b" />
      <div className="grad-bg__layer grad-bg__layer--c" />
      {/* A fine grain over the blend. Large flat gradients band on a big
          panel; a faint noise texture breaks the steps up. */}
      <div className="grad-bg__grain" />
    </div>
  );
}
