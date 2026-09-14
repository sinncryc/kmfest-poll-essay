"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RiverSource } from "./use-display-data";

/**
 * One full lap of the border, however many answers are riding it. Unlike a
 * per-lane track, the path length here is just the screen's own perimeter —
 * it doesn't grow with content — so a plain fixed duration is correct and
 * doesn't need to be re-measured as answers come in. Tune this one number
 * if it still reads too slow/fast once real content is on screen.
 */
const LOOP_SECONDS = 26;

/**
 * Live audience answers travelling as a single unbroken loop, clockwise,
 * around the outer edge of the projector screen — the element carried over
 * from the previous display.
 *
 * This used to be four independent marquee lanes, one per edge, each
 * translating its own track. They never actually met at the corners — a
 * card would vanish off one lane and an unrelated card would appear in the
 * next — so it never read as one continuous motion, and with only a
 * handful of test answers the short tracks barely moved at all.
 *
 * This version puts every card on a single CSS motion path (`offset-path`)
 * that traces the full rectangle once, centred inside the reserved
 * `--river-x`/`--river-y` band. Cards are spread evenly around that path
 * with a negative `animation-delay` (so they start pre-distributed instead
 * of bunched at one corner) and all share one `animation-duration`, so a
 * card genuinely turns each corner and the whole ring keeps a constant,
 * content-independent pace.
 */
export default function BorderRiver({
  pool,
  freshIds,
}: {
  pool: RiverSource[];
  freshIds: number[];
}) {
  const fresh = useMemo(() => new Set(freshIds), [freshIds]);

  const ringRef = useRef<HTMLDivElement>(null);
  const xProbeRef = useRef<HTMLDivElement>(null);
  const yProbeRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string | null>(null);

  // The band's real pixel thickness (via two invisible probes sized with the
  // same var()s) plus the ring's own pixel size gives everything needed to
  // draw a rectangle path centred in that band — recomputed on resize since
  // every dimension here is a clamp() against the viewport, not a fixed px.
  useEffect(() => {
    const ring = ringRef.current;
    const xProbe = xProbeRef.current;
    const yProbe = yProbeRef.current;
    if (!ring || !xProbe || !yProbe) return;

    const measure = () => {
      const width = ring.clientWidth;
      const height = ring.clientHeight;
      const insetX = xProbe.offsetWidth / 2;
      const insetY = yProbe.offsetHeight / 2;
      if (width <= 0 || height <= 0 || insetX <= 0 || insetY <= 0) return;

      // Clockwise in screen coordinates: right along the top, down the
      // right side, left along the bottom, up the left side, back to start.
      setPath(
        `path("M ${insetX} ${insetY} L ${width - insetX} ${insetY} ` +
          `L ${width - insetX} ${height - insetY} L ${insetX} ${height - insetY} Z")`,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ring);
    return () => observer.disconnect();
  }, []);

  if (pool.length === 0) return null;

  return (
    <div ref={ringRef} aria-hidden className="river-ring">
      <div ref={xProbeRef} className="river-probe" style={{ width: "var(--river-x)" }} />
      <div ref={yProbeRef} className="river-probe" style={{ height: "var(--river-y)" }} />

      {path
        ? pool.map((item, index) => {
            // Negative delay seeks straight to this card's resting point on
            // the loop instead of animating everyone in from offset 0%.
            const style = {
              offsetPath: path,
              offsetRotate: "0deg",
              animationDuration: `${LOOP_SECONDS}s`,
              animationDelay: `${-(index / pool.length) * LOOP_SECONDS}s`,
            } as unknown as CSSProperties;

            return (
              <p
                key={item.id}
                className={`river-card ${fresh.has(item.id) ? "is-fresh" : ""}`}
                style={style}
              >
                {item.text}
              </p>
            );
          })
        : null}
    </div>
  );
}
