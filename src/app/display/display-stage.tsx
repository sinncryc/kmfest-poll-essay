"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import EventLogos from "@/components/brand/event-logos";
import TitleLockup from "@/components/brand/title-lockup";
import BorderRiver from "@/components/display/border-river";
import { ConcernsPanel, PollPanel } from "@/components/display/display-panels";
import { useDisplayData } from "@/components/display/use-display-data";
import { eventConfig } from "@/lib/event-config";

/**
 * The projector screen.
 *
 * Layout follows the approved Display key visual — poll on the left, essay
 * results plus a sample of raw answers on the right — but sits on the
 * *background* artwork rather than the mockup's darker plate, per the brief.
 *
 * The outer band of the screen belongs to the live answer river; every piece
 * of branding is inset from it, which is exactly why the logos and title were
 * lifted out of the background PNG: at this size they can be scaled down and
 * pulled inward, leaving a clean ring for participant input to circle.
 */
export default function DisplayStage() {
  const {
    pool,
    freshIds,
    poll,
    concerns,
    total,
    connection,
    demoMode,
    ready,
  } = useDisplayData();

  const [controlsVisible, setControlsVisible] = useState(true);

  /** The three newest answers, shown verbatim beside the AI's clustering. */
  const quotes = useMemo(() => pool.slice(0, 3), [pool]);

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
    <main className="stage">
      <div aria-hidden className="stage-backdrop">
        <Image
          src="/brand/display-bg.png"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />
      </div>

      <BorderRiver pool={pool} freshIds={freshIds} />

      <div className="stage-inner">
        <header className="stage-head">
          <EventLogos size="lg" />
          <TitleLockup className="stage-title" />
        </header>

        <div className="stage-panels">
          <PollPanel results={poll} />
          <ConcernsPanel concerns={concerns} quotes={quotes} total={ready ? total : 0} />
        </div>

        <footer className="stage-motto">
          {eventConfig.motto.map((word, index) => (
            <span key={word}>
              {index > 0 ? <i aria-hidden>•</i> : null}
              {word}
            </span>
          ))}
        </footer>
      </div>

      {/* Status corner */}
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
