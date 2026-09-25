"use client";

import { useEffect, useRef, useState } from "react";
import { eventConfig } from "@/lib/event-config";
import type { RiverSource } from "./use-display-data";

/*
 * Live answers riding a loop round the panel group, compass head first.
 * All numbers are px in the 2880×538 strip (see .strip in globals.css).
 *
 * Loop coordinate s runs clockwise from the top-left corner (30,151):
 * top 0–2820, right 2820–3178, bottom 3178–5998, left 5998–6356. Pills
 * travel counter-clockwise. Text rides SVG <textPath> so it bends round the
 * sharp corners; it sits on "lane-up" across the top and "lane-down" across
 * the bottom (both upright) and fades between them mid-side. The pill shape
 * never fades — only text does, also when a new answer replaces it.
 */
const PILLS = 35;
const BATCH_MS = 10_000;
const SWAP_MS = 800;
const FADE = 320;

const PER = 6356;
const PAD = 370;
const SIDE = 358;
const MID_R = 2999;
const MID_L = 6177;
const HEAD_GAP = 16;
/** Room for text inside a pill, px. Text is measured and cut to fit it. */
const TEXT_W = 126;
const PILL_LEN = HEAD_GAP + TEXT_W + 4;
const LOOP: [number, number][] = [[30, 151], [2850, 151], [2850, 509], [30, 509], [30, 151]];
const LOOP_D = "M 30 151 L 2850 151 L 2850 509 L 30 509 L 30 151 L 2850 151 L 2850 509 L 30 509";
const UP_D = "M 400 509 L 30 509 L 30 151 L 2850 151 L 2850 509 L 2480 509";
const DOWN_D = "M 400 151 L 30 151 L 30 509 L 2850 509 L 2850 151 L 2480 151";

/**
 * Cuts text to the real rendered width of the pill (not a character count —
 * "WWW" and "iii" differ 3×), adding "..." when it has to.
 */
let measure: CanvasRenderingContext2D | null = null;
function fit(text: string): string {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return text;
  measure.font = '10px Poppins, "Segoe UI", sans-serif';
  const width = (t: string) => measure!.measureText(t).width;
  if (width(text) <= TEXT_W) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (width(text.slice(0, mid).trimEnd() + "...") <= TEXT_W) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "...";
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function at(s: number): [number, number] {
  s = ((s % PER) + PER) % PER;
  for (let k = 1; k < LOOP.length; k += 1) {
    const [x0, y0] = LOOP[k - 1];
    const [x1, y1] = LOOP[k];
    const l = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    if (s <= l) return [x0 + ((x1 - x0) * s) / l, y0 + ((y1 - y0) * s) / l];
    s -= l;
  }
  return LOOP[0];
}

type Slot = { id: number; text: string; prev: string; swapAt: number };
const EMPTY: Slot = { id: -1, text: "", prev: "", swapAt: -Infinity };

/**
 * New answers go into the pill holding the oldest one (empty pills first).
 * Applied in batches every 10 s, each change fading the text in place.
 */
function assign(slots: Slot[], pool: RiverSource[], now: number, animate: boolean): Slot[] {
  const newest = Math.max(-1, ...slots.map((s) => s.id));
  const incoming = pool
    .filter((item) => item.id > newest)
    .sort((a, b) => a.id - b.id)
    .slice(-PILLS);
  if (incoming.length === 0) return slots;
  const next = slots.slice();
  for (const item of incoming) {
    let target = 0;
    for (let i = 1; i < PILLS; i += 1) if (next[i].id < next[target].id) target = i;
    next[target] = {
      id: item.id,
      text: item.text,
      prev: next[target].text,
      swapAt: animate ? now : -Infinity,
    };
  }
  return next;
}

export default function OrbitRing({ pool, loopSeconds }: { pool: RiverSource[]; loopSeconds: number }) {
  const [slots, setSlots] = useState<Slot[]>(() => Array(PILLS).fill(EMPTY));
  // Text is fitted with the real font, so draw it only once Poppins is in.
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    void document.fonts.ready.then(() => setFontsReady(true));
  }, []);
  const slotsRef = useRef(slots);
  const poolRef = useRef(pool);
  const svgRef = useRef<SVGSVGElement>(null);
  // Read by the animation loop; changing speed keeps each pill where it is.
  const loopRef = useRef(loopSeconds);

  useEffect(() => {
    loopRef.current = loopSeconds;
  }, [loopSeconds]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // First answers appear at once; after that, one batch every 10 s.
  useEffect(() => {
    poolRef.current = pool;
    if (slotsRef.current.every((s) => s.id < 0) && pool.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlots((prev) => assign(prev, pool, 0, false));
    }
  }, [pool]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlots((prev) => assign(prev, poolRef.current, performance.now(), true));
    }, BATCH_MS);
    return () => clearInterval(timer);
  }, []);

  // Motion: written straight to the SVG every frame, no React re-render.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const parts = Array.from(svg.querySelectorAll<SVGGElement>("g[data-pill]")).map((g) => ({
      shapes: Array.from(g.querySelectorAll<SVGPathElement>("path")),
      head: g.querySelector("image")!,
      texts: Array.from(g.querySelectorAll<SVGTextElement>("text")),
      paths: Array.from(g.querySelectorAll("textPath")),
    }));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();
    let phase = 0;
    let raf = 0;

    const frame = (now: number) => {
      if (!still) phase = (phase + (now - last) / 1000 / loopRef.current) % 1;
      last = now;
      parts.forEach((p, i) => {
        const h = ((((i / PILLS - phase) * PER) % PER) + PER) % PER;
        const m = (h + HEAD_GAP + TEXT_W / 2) % PER;
        const w = FADE / 2;
        const dR = m - MID_R;
        const dL = ((m - MID_L + PER * 1.5) % PER) - PER / 2;
        let up: number;
        let down: number;
        if (Math.abs(dR) < w) [up, down] = [clamp(-dR / w), clamp(dR / w)];
        else if (Math.abs(dL) < w) [down, up] = [clamp(-dL / w), clamp(dL / w)];
        else [up, down] = m > MID_R && m < MID_L ? [0, 1] : [1, 0];

        const since = now - slotsRef.current[i].swapAt;
        const swapping = since < SWAP_MS;
        const fresh = swapping ? clamp((since - SWAP_MS / 2) / (SWAP_MS / 2)) : 1;
        const old = swapping ? clamp(1 - since / (SWAP_MS / 2)) : 0;

        // Text always reads from the pill's left end: after the head on the
        // top lane, from the tail on the bottom lane (head is on the right).
        const ts = h + HEAD_GAP;
        const te = ts + TEXT_W;
        const off1 = String((ts > 4700 ? ts - PER : ts) + SIDE + PAD);
        const off2 = String(PER - (te < 1500 ? te + PER : te) + PAD);

        for (const shape of p.shapes) shape.style.strokeDashoffset = `${-h}px`;
        const [x, y] = at(h);
        const [fx, fy] = at(h + 30);
        const [bx, by] = at(h - 30);
        const ang = (Math.atan2(fy - by, fx - bx) * 180) / Math.PI;
        p.head.setAttribute("transform", `translate(${x} ${y}) rotate(${ang}) scale(0.24) translate(-62 -53)`);
        // text order: up-old, up-new, down-old, down-new
        p.texts[0].style.opacity = String(up * old);
        p.texts[1].style.opacity = String(up * fresh);
        p.texts[2].style.opacity = String(down * old);
        p.texts[3].style.opacity = String(down * fresh);
        p.paths[0].setAttribute("startOffset", off1);
        p.paths[1].setAttribute("startOffset", off1);
        p.paths[2].setAttribute("startOffset", off2);
        p.paths[3].setAttribute("startOffset", off2);
      });
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dash = `${PILL_LEN} 20000`;
  const placeholder = eventConfig.display.pillPlaceholder;

  return (
    <svg ref={svgRef} className="orbit" viewBox="0 0 2880 538" aria-hidden>
      <defs>
        <path id="orbit-lane-up" d={UP_D} />
        <path id="orbit-lane-down" d={DOWN_D} />
      </defs>
      {slots.map((slot, i) => {
        const text = fontsReady ? fit(slot.text || placeholder) : "";
        const prev = fontsReady ? fit(slot.prev || placeholder) : "";
        return (
          <g key={i} data-pill="">
            <path d={LOOP_D} fill="none" stroke="rgba(40,150,255,0.14)" strokeWidth={26} strokeLinecap="round" strokeDasharray={dash} />
            <path d={LOOP_D} fill="none" stroke="rgba(127,212,255,0.35)" strokeWidth={21} strokeLinecap="round" strokeDasharray={dash} />
            <path d={LOOP_D} fill="none" stroke="#03408a" strokeWidth={19} strokeLinecap="round" strokeDasharray={dash} />
            <image href="/brand/compass-head.png" width={230} height={108} />
            <text textAnchor="start" style={{ opacity: 0 }}>
              <textPath href="#orbit-lane-up">{prev}</textPath>
            </text>
            <text textAnchor="start" style={{ opacity: 0 }}>
              <textPath href="#orbit-lane-up">{text}</textPath>
            </text>
            <text textAnchor="start" style={{ opacity: 0 }}>
              <textPath href="#orbit-lane-down">{prev}</textPath>
            </text>
            <text textAnchor="start" style={{ opacity: 0 }}>
              <textPath href="#orbit-lane-down">{text}</textPath>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
