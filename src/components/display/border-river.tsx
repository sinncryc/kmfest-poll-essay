"use client";

import { useMemo } from "react";
import type { RiverSource } from "./use-display-data";

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
      <Lane items={lanes[0]} axis="x" className="river-lane-top" seconds={68} fresh={fresh} />
      <Lane items={lanes[1]} axis="y" className="river-lane-right" seconds={74} fresh={fresh} />
      <Lane items={lanes[2]} axis="x" className="river-lane-bottom" seconds={70} fresh={fresh} reverse />
      <Lane items={lanes[3]} axis="y" className="river-lane-left" seconds={76} fresh={fresh} reverse />
    </div>
  );
}

function Lane({
  items,
  axis,
  className,
  seconds,
  fresh,
  reverse = false,
}: {
  items: RiverSource[];
  axis: "x" | "y";
  className: string;
  seconds: number;
  fresh: Set<number>;
  reverse?: boolean;
}) {
  if (items.length === 0) return null;

  // Rendered twice: the track translates by half its own length, so the
  // second copy is exactly where the first started when the loop restarts.
  const doubled = [...items, ...items];

  return (
    <div className={`river-lane ${className}`}>
      <div
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
