"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import EventLogos from "@/components/brand/event-logos";
import TitleLockup from "@/components/brand/title-lockup";
import {
  ESSAY_MAX_LENGTH,
  ESSAY_MIN_LENGTH,
  eventConfig,
} from "@/lib/event-config";
import type { PollChoice } from "@/lib/types";

type Status = "idle" | "submitting" | "success";

const { poll, essay, motto } = eventConfig;

/**
 * The participant screen, built to the approved Participant key visual: the
 * artwork is a full-bleed backdrop, and everything above it is fluid — all
 * type and spacing is expressed in `clamp()`/viewport units so one layout
 * fits every phone from a small 5" device up to a tablet, with no fixed
 * breakpoints to fall between.
 */
export default function ParticipantForm() {
  const [choice, setChoice] = useState<PollChoice | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const trimmed = useMemo(() => message.trim(), [message]);
  const tooShort = trimmed.length > 0 && trimmed.length < ESSAY_MIN_LENGTH;
  const canSubmit =
    status !== "submitting" &&
    choice !== null &&
    trimmed.length >= ESSAY_MIN_LENGTH &&
    trimmed.length <= ESSAY_MAX_LENGTH;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, pollChoice: choice }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "Could not send your response. Please try again.");
        setStatus("idle");
        return;
      }

      setStatus("success");
    } catch {
      setError("Connection problem. Check your network and try again.");
      setStatus("idle");
    }
  }

  if (status === "success") return <SuccessScreen />;

  return (
    <main className="kv-screen">
      <KeyVisualBackdrop />

      <div className="kv-shell">
        <header className="kv-head">
          <EventLogos size="sm" />
          <TitleLockup className="kv-title" />
        </header>

        <form onSubmit={handleSubmit} className="kv-stack">
          {/* ---------------- Poll ---------------- */}
          <section className="kv-card fade-up" aria-labelledby="poll-heading">
            <div className="kv-card-head">
              <span className="kv-badge" aria-hidden>
                <BarsIcon />
              </span>
              <div>
                <h2 id="poll-heading" className="kv-card-label">
                  {poll.label}
                </h2>
                <p className="kv-card-question">{poll.question}</p>
              </div>
            </div>

            <p className="kv-helper">{poll.helper}</p>

            <div
              role="radiogroup"
              aria-labelledby="poll-heading"
              className="kv-options"
            >
              {poll.options.map((option) => {
                const active = choice === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={status === "submitting"}
                    onClick={() => setChoice(option.key as PollChoice)}
                    className={`kv-option kv-option-${option.key.toLowerCase()} ${
                      active ? "is-active" : ""
                    }`}
                  >
                    <span className="kv-option-key" aria-hidden>
                      {option.key}
                    </span>
                    <span className="kv-option-body">
                      <span className="kv-option-title">{option.title}</span>
                      <span className="kv-option-quote">“{option.quote}”</span>
                    </span>
                    <span className="kv-radio" aria-hidden />
                  </button>
                );
              })}
            </div>

            <div className="kv-footnote">
              <span className="kv-badge kv-badge-sm" aria-hidden>
                <PeopleIcon />
              </span>
              <span>
                <strong>{poll.footnoteTitle}</strong>
                <br />
                {poll.footnoteBody}
              </span>
            </div>
          </section>

          {/* ---------------- Essay ---------------- */}
          <section className="kv-card fade-up" aria-labelledby="essay-heading">
            <div className="kv-card-head">
              <span className="kv-badge" aria-hidden>
                <PencilIcon />
              </span>
              <div>
                <h2 id="essay-heading" className="kv-card-label">
                  {essay.label}
                </h2>
                <p className="kv-card-question">{essay.question}</p>
              </div>
            </div>

            <label htmlFor="essay" className="kv-prompt">
              {essay.prompt}
            </label>

            <div className="kv-field">
              <textarea
                id="essay"
                name="essay"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={ESSAY_MAX_LENGTH}
                rows={4}
                disabled={status === "submitting"}
                placeholder={essay.placeholder}
                className="kv-textarea"
              />
              <span
                className={`kv-counter ${
                  trimmed.length > ESSAY_MAX_LENGTH - 30 ? "is-warn" : ""
                }`}
              >
                {trimmed.length}/{ESSAY_MAX_LENGTH}
              </span>
            </div>

            {tooShort ? (
              <p className="kv-hint">At least {ESSAY_MIN_LENGTH} characters.</p>
            ) : null}

            {error ? (
              <p role="alert" className="kv-error">
                {error}
              </p>
            ) : null}

            <div className="kv-submit-row">
              <button type="submit" disabled={!canSubmit} className="kv-submit">
                {status === "submitting" ? (
                  <>
                    <Spinner />
                    SENDING…
                  </>
                ) : (
                  <>
                    SUBMIT
                    <ArrowIcon />
                  </>
                )}
              </button>
            </div>

            <p className="kv-disclaimer">{essay.disclaimer}</p>

            <div className="kv-footnote">
              <span className="kv-badge kv-badge-sm" aria-hidden>
                <BulbIcon />
              </span>
              <span>{essay.footnote}</span>
            </div>
          </section>
        </form>

        <footer className="kv-motto">
          {motto.map((word, index) => (
            <span key={word}>
              {index > 0 ? <i aria-hidden>•</i> : null}
              {word}
            </span>
          ))}
        </footer>
      </div>
    </main>
  );
}

/** Full-bleed key-visual artwork, logo-free so the chrome above can scale. */
function KeyVisualBackdrop() {
  return (
    <div aria-hidden className="kv-backdrop">
      <Image
        src="/brand/participant-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        style={{ objectFit: "cover", objectPosition: "center top" }}
      />
    </div>
  );
}

function SuccessScreen() {
  return (
    <main className="kv-screen">
      <KeyVisualBackdrop />
      <div className="kv-shell kv-shell-center">
        <div className="fade-up text-center">
          <div className="kv-tick" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10">
              <path
                d="M4.5 12.5 9.5 17.5 19.5 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="kv-thanks">THANK YOU</h1>
          <p className="kv-thanks-body">
            Your answer is in. Look up — it is moving across the main screen
            right now.
          </p>

          <div className="mt-[4vh] w-full">
            <TitleLockup className="mx-auto max-w-[min(78vw,340px)]" />
          </div>
        </div>
      </div>
    </main>
  );
}

/* --------------------------- tiny inline icons --------------------------- */

function Spinner() {
  return <span aria-hidden className="kv-spinner" />;
}

function BarsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
      <path
        d="M5 19V11M12 19V5M19 19v-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
      <path
        d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5V20Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 19a6 6 0 0 1 12 0M17 11a3 3 0 1 0-2-5.2M21 19a5.6 5.6 0 0 0-3-4.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.6V16h5.2v-.5c0-.6.3-1.2.9-1.6A6 6 0 0 0 12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[1.1em] w-[1.1em]">
      <path
        d="M5 12h13m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
