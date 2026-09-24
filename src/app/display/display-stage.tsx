"use client";

import { useCallback, useEffect, useState } from "react";
import OrbitRing from "@/components/display/orbit-ring";
import SummaryBoxes from "@/components/display/summary-boxes";
import { useDisplayData } from "@/components/display/use-display-data";

const STRIP_W = 2880;
const STRIP_H = 538;

/**
 * The LED strip. The artwork (logos, title, the three glass boxes) is one
 * 2880×538 background; the live parts sit on top at the same px positions and
 * the whole strip is scaled as one piece to fit the screen, so layout and the
 * measured text limits hold at any resolution.
 */
export default function DisplayStage() {
  const { pool, poll, concerns, loopSeconds, connection, demoMode } = useDisplayData();

  const [scale, setScale] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  // Operator aid, not part of the key visual: add ?debug=1 to see it.
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowDebug(new URLSearchParams(window.location.search).has("debug"));
    const fitStrip = () =>
      setScale(Math.min(window.innerWidth / STRIP_W, window.innerHeight / STRIP_H));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fitStrip();
    window.addEventListener("resize", fitStrip);
    return () => window.removeEventListener("resize", fitStrip);
  }, []);

  // Controls fade away so the screen needs no operator during the event.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 3500);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", show);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  return (
    <main className="strip-viewport">
      <div className="strip" style={{ "--strip-scale": scale } as React.CSSProperties}>
        <SummaryBoxes poll={poll} concerns={concerns} />
        <OrbitRing pool={pool} loopSeconds={loopSeconds} />
      </div>

      {showDebug ? (
        <div className="stage-status">
          <span
            className={`live-dot ${
              connection === "live"
                ? "bg-emerald-400"
                : connection === "polling"
                  ? "bg-azure-400"
                  : connection === "error"
                    ? "bg-red-400"
                    : "bg-slate-300"
            }`}
          />
          {connection === "live"
            ? "LIVE"
            : connection === "polling"
              ? demoMode
                ? "DEMO"
                : "POLLING"
              : connection === "error"
                ? "RECONNECTING"
                : "CONNECTING"}
        </div>
      ) : null}

      <button
        type="button"
        onClick={toggleFullscreen}
        className={`stage-fullscreen ${controlsVisible ? "opacity-100" : "opacity-0"}`}
      >
        FULLSCREEN
      </button>
    </main>
  );
}
