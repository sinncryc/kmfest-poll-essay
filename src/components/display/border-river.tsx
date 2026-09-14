"use client";

import { useEffect, useMemo, useState } from "react";
import type { RiverSource } from "./use-display-data";

/** One full lap of the border. Lower = faster. */
const LOOP_SECONDS = 22;

/** Breathing room between cards, as a multiple of a card's widest possible size. */
const SPACING_FACTOR = 1.18;

type Frame = {
  width: number;
  height: number;
  /** Half the reserved band, i.e. how far the path sits in from each edge. */
  insetX: number;
  insetY: number;
  /** Widest a card can render, used to work out how many fit on the ring. */
  cardWidth: number;
};

type Point = { x: number; y: number };

function edges(frame: Frame) {
  const x0 = frame.insetX;
  const x1 = frame.width - frame.insetX;
  const y0 = frame.insetY;
  const y1 = frame.height - frame.insetY;
  const top = Math.max(x1 - x0, 1);
  const side = Math.max(y1 - y0, 1);
  return { x0, x1, y0, y1, top, side, perimeter: 2 * (top + side) };
}

/** Where a card sits at `t` (0–1) round the loop, clockwise from top-left. */
function pointAt(frame: Frame, t: number): Point {
  const { x0, x1, y0, y1, top, side, perimeter } = edges(frame);
  let d = t * perimeter;

  if (d <= top) return { x: x0 + d, y: y0 };
  d -= top;
  if (d <= side) return { x: x1, y: y0 + d };
  d -= side;
  if (d <= top) return { x: x1 - d, y: y1 };
  d -= top;
  return { x: x0, y: y1 - d };
}

function place({ x, y }: Point): string {
  // The second translate is relative to the card's own box, so its centre —
  // not its corner — is what rides the path.
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) translate(-50%, -50%)`;
}

/**
 * The four corners as keyframe stops. Each stop sits at that edge's share of
 * the perimeter, so with a linear timing function the cards hold one constant
 * speed the whole way round instead of racing along the short edges.
 *
 * Written at runtime rather than living in globals.css because the waypoints
 * are measured pixels — the band is sized in clamp()s against the viewport.
 */
function buildKeyframes(frame: Frame): string {
  const { x0, x1, y0, y1, top, side, perimeter } = edges(frame);
  const stop = (distance: number) => ((distance / perimeter) * 100).toFixed(4);

  return [
    "@keyframes river-ring-loop {",
    `  0% { transform: ${place({ x: x0, y: y0 })}; }`,
    `  ${stop(top)}% { transform: ${place({ x: x1, y: y0 })}; }`,
    `  ${stop(top + side)}% { transform: ${place({ x: x1, y: y1 })}; }`,
    `  ${stop(top + side + top)}% { transform: ${place({ x: x0, y: y1 })}; }`,
    `  100% { transform: ${place({ x: x0, y: y0 })}; }`,
    "}",
  ].join("\n");
}

/**
 * Live audience answers travelling as one unbroken clockwise loop around the
 * outer edge of the projector screen.
 *
 * History worth keeping, because two earlier versions were wrong in ways that
 * are easy to repeat:
 *
 * 1. Four independent per-edge marquees. They never met at the corners — a
 *    card fell off the end of one lane and an unrelated card appeared in the
 *    next — so it never read as one loop, and with few answers the short
 *    tracks barely moved.
 * 2. A single CSS motion path (`offset-path`), measured in a mount effect.
 *    The pool starts empty and loads async, so the component returned null on
 *    first render, the refs never attached, the effect ran once against
 *    nothing and never again — and the ring silently never appeared at all.
 *
 * So: the ring element is *always* mounted (never gated behind data), it is
 * measured through a callback ref that fires the moment the node attaches,
 * and each card carries an inline transform for its resting position — which
 * also means that if the animation never starts for any reason, the ring
 * still renders correctly, just still.
 */
export default function BorderRiver({
  pool,
  freshIds,
}: {
  pool: RiverSource[];
  freshIds: number[];
}) {
  const fresh = useMemo(() => new Set(freshIds), [freshIds]);

  const [ring, setRing] = useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);

  useEffect(() => {
    if (!ring) return;

    // Probes are sized by the same var()s that reserve the band, so their
    // rendered size is that band resolved to real pixels.
    const xProbe = ring.querySelector<HTMLElement>(".river-probe-x");
    const yProbe = ring.querySelector<HTMLElement>(".river-probe-y");
    const cardProbe = ring.querySelector<HTMLElement>(".river-probe-card");
    if (!xProbe || !yProbe || !cardProbe) return;

    const measure = () => {
      const next: Frame = {
        width: ring.clientWidth,
        height: ring.clientHeight,
        insetX: xProbe.offsetWidth / 2,
        insetY: yProbe.offsetHeight / 2,
        cardWidth: cardProbe.offsetWidth,
      };
      if (next.width <= 0 || next.height <= 0 || next.cardWidth <= 0) return;

      setFrame((prev) =>
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.insetX === next.insetX &&
        prev.insetY === next.insetY &&
        prev.cardWidth === next.cardWidth
          ? prev
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ring);
    return () => observer.disconnect();
  }, [ring]);

  useEffect(() => {
    if (!frame) return;
    const style = document.createElement("style");
    style.dataset.riverRing = "";
    style.textContent = buildKeyframes(frame);
    document.head.append(style);
    return () => style.remove();
  }, [frame]);

  /**
   * How many cards the border can hold without them running into each other —
   * unlike the old flex lanes, positions here are pure maths and nothing stops
   * two cards overlapping if we put more on than there is room for.
   */
  const capacity = frame
    ? Math.max(1, Math.floor(edges(frame).perimeter / (frame.cardWidth * SPACING_FACTOR)))
    : 0;

  /**
   * The newest answers that fit, oldest first.
   *
   * A card's slot is `id % capacity`, which is what keeps the ring steady:
   * ids run consecutively, so the newest `capacity` of them map to distinct
   * slots, and when a new answer pushes the oldest off the ring it lands in
   * exactly the slot that was just vacated. Nothing else shifts — no restart,
   * no jump, the loop just keeps turning with one card's text replaced.
   */
  const cards = useMemo(() => {
    if (capacity <= 0) return [];
    return [...pool].sort((a, b) => a.id - b.id).slice(-capacity);
  }, [pool, capacity]);

  return (
    <div aria-hidden className="river-ring" ref={setRing}>
      <span className="river-probe river-probe-x" />
      <span className="river-probe river-probe-y" />
      <span className="river-probe river-probe-card" />

      {frame
        ? cards.map((item) => {
            const t = (((item.id % capacity) + capacity) % capacity) / capacity;

            return (
              <p
                key={item.id}
                className={`river-card ${fresh.has(item.id) ? "is-fresh" : ""}`}
                style={{
                  transform: place(pointAt(frame, t)),
                  animationDuration: `${LOOP_SECONDS}s`,
                  animationDelay: `${(-t * LOOP_SECONDS).toFixed(3)}s`,
                }}
              >
                {item.text}
              </p>
            );
          })
        : null}
    </div>
  );
}
