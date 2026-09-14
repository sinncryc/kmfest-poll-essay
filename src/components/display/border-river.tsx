"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RiverSource } from "./use-display-data";

/**
 * Constant crawl speed in pixels/second, not a fixed loop duration. A fixed
 * duration looked static with only a few test answers (a short track barely
 * moves in 70s) and would have sped up to a blur once real event traffic
 * fills the lanes out — since a longer track covering the same duration
 * travels faster. Deriving the duration from the *measured* track length
 * keeps the apparent speed the same however many answers are in a lane,
 * which is also what made the previous single-lane river read as "moving".
 */
const PIXELS_PER_SECOND = 46;
const MIN_SECONDS = 10;
const MAX_SECONDS = 90;

/**
 * Live audience answers circling the outer edge of the projector screen —
 * the one element carried over from the previous display, now moved from two
 * side lanes to a full ring: top lane travels left, right lane travels down,
 * bottom lane travels right, left lane travels up, so the whole border reads
 * as one continuous clockwise current of "knowledge in motion".
 *
 * Each lane is a marquee: its items are rendered twice inside a track that
 * translates by exactly -50%, so the loop is seamless and cards can never
 * overlap regardless of how long an answer is. All four lanes sit outside the
 * content inset, which is why the logos had to come out of the background
 * artwork and be scaled down — nothing else may live in this band.
 */
export default function BorderRiver({
  pool,
  freshIds,
}: {
  pool: RiverSource[];
  freshIds: number[];
}) {
  const fresh = useMemo(() => new Set(freshIds), [freshIds]);

  /**
   * Deal answers round-robin into the four lanes so a burst of new arrivals
   * spreads around the whole ring instead of piling into one edge.
   */
  const lanes = useMemo(() => {
    const buckets: RiverSource[][] = [[], [], [], []];
    pool.forEach((item, index) => buckets[index % 4].push(item));
    return buckets;
  }, [pool]);

  if (pool.length === 0) return null;

  return (
    <div aria-hidden className="river-ring">
      <Lane items={lanes[0]} axis="x" className="river-lane-top" fresh={fresh} />
      <Lane items={lanes[1]} axis="y" className="river-lane-right" fresh={fresh} />
      <Lane items={lanes[2]} axis="x" className="river-lane-bottom" fresh={fresh} reverse />
      <Lane items={lanes[3]} axis="y" className="river-lane-left" fresh={fresh} reverse />
    </div>
  );
}

function Lane({
  items,
  axis,
  className,
  fresh,
  reverse = false,
}: {
  items: RiverSource[];
  axis: "x" | "y";
  className: string;
  fresh: Set<number>;
  reverse?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(MIN_SECONDS);

  // Re-measure whenever the content changes (new answers, viewport resize —
  // card size is all clamp()'d to viewport, so a resize changes pixel width
  // too) and drive the loop at a constant px/s instead of a fixed duration.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const measure = () => {
      // The track renders its items twice; half of it is one full lap.
      const distance = axis === "x" ? el.scrollWidth / 2 : el.scrollHeight / 2;
      if (distance > 0) {
        const next = distance / PIXELS_PER_SECOND;
        setSeconds(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, next)));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [axis, items]);

  if (items.length === 0) return null;

  // Rendered twice: the track translates by half its own length, so the
  // second copy is exactly where the first started when the loop restarts.
  const doubled = [...items, ...items];

  return (
    <div className={`river-lane ${className}`}>
      <div
        ref={trackRef}
        className={`river-track river-track-${axis}`}
        style={{
          animationDuration: `${seconds}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {doubled.map((item, index) => (
          <p
            key={`${item.id}-${index}`}
            className={`river-card ${fresh.has(item.id) ? "is-fresh" : ""}`}
          >
            {item.text}
          </p>
        ))}
      </div>
    </div>
  );
}
