"use client";

import { eventConfig } from "@/lib/event-config";
import type { ConcernItem, PollResults } from "@/lib/types";
import type { RiverSource } from "./use-display-data";

const { poll: pollCopy, display: displayCopy } = eventConfig;

/** Whole percent, guarded against a divide-by-zero before the first vote. */
function share(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

/* ------------------------------------------------------------------ */
/* Poll — the live A/B split                                           */
/* ------------------------------------------------------------------ */

export function PollPanel({ results }: { results: PollResults }) {
  const pctA = share(results.a, results.total);
  // Derive B from A so the two always add to exactly 100 on screen.
  const pctB = results.total > 0 ? 100 - pctA : 0;
  const percents = [pctA, pctB];

  return (
    <section className="panel" aria-labelledby="poll-title">
      <header className="panel-head">
        <span className="panel-badge" aria-hidden>
          <BarsIcon />
        </span>
        <div>
          <p className="panel-eyebrow">{displayCopy.liveLabel}</p>
          <h2 className="panel-title">{pollCopy.label}</h2>
        </div>
      </header>

      <p id="poll-title" className="panel-question">
        <span className="panel-question-accent">WHICH</span> SIDE ARE YOU ON?
      </p>

      <div className="poll-rows">
        {pollCopy.options.map((option, index) => (
          <article
            key={option.key}
            className={`poll-row poll-row-${option.key.toLowerCase()}`}
          >
            <span className="poll-key" aria-hidden>
              {option.key}
            </span>

            <div className="poll-body">
              <h3 className="poll-option-title">{option.title}</h3>
              <p className="poll-option-quote">“{option.quote}”</p>
            </div>

            <div className="poll-meter">
              <span className="poll-percent">{percents[index]}%</span>
              <span className="poll-bar" role="img" aria-label={`${percents[index]} percent`}>
                <span
                  className="poll-bar-fill"
                  style={{ width: `${Math.max(percents[index], 2)}%` }}
                />
              </span>
            </div>
          </article>
        ))}
      </div>

      <footer className="panel-total">
        <span className="panel-badge panel-badge-sm" aria-hidden>
          <PeopleIcon />
        </span>
        <span>
          <span className="panel-total-label">{displayCopy.totalLabel}</span>
          <strong className="panel-total-value">
            {results.total.toLocaleString("en-US")}
          </strong>
        </span>
      </footer>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Essay — ranked concerns + a sample of raw answers                   */
/* ------------------------------------------------------------------ */

export function ConcernsPanel({
  concerns,
  quotes,
  total,
}: {
  concerns: ConcernItem[];
  quotes: RiverSource[];
  total: number;
}) {
  const summed = concerns.reduce((sum, item) => sum + item.count, 0);
  const base = summed > 0 ? summed : total;

  return (
    <section className="panel panel-wide" aria-labelledby="essay-title">
      <header className="panel-head">
        <span className="panel-badge" aria-hidden>
          <PencilIcon />
        </span>
        <div>
          <p className="panel-eyebrow">{displayCopy.liveLabel}</p>
          <h2 className="panel-title">{eventConfig.essay.label}</h2>
        </div>
      </header>

      <div className="essay-split">
        <div className="essay-main">
          <p id="essay-title" className="panel-question">
            {eventConfig.essay.question}
          </p>
          <p className="panel-subquestion">{displayCopy.concernsSubheading}</p>

          {concerns.length === 0 ? (
            <p className="panel-waiting">Waiting for the first results…</p>
          ) : (
            <ol className="concern-list">
              {concerns.map((item) => (
                <li key={item.rank} className={`concern concern-${item.rank}`}>
                  <span className="concern-rank" aria-hidden>
                    {item.rank}
                  </span>
                  <div className="concern-body">
                    <h3 className="concern-title">{item.title}</h3>
                    <span className="concern-bar">
                      <span
                        className="concern-bar-fill"
                        style={{ width: `${Math.max(share(item.count, base), 3)}%` }}
                      />
                    </span>
                  </div>
                  <span className="concern-percent">{share(item.count, base)}%</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="essay-quotes">
          <h3 className="quotes-heading">{displayCopy.quotesHeading}</h3>
          <div className="quotes-stack">
            {quotes.length === 0 ? (
              <p className="panel-waiting">No answers yet.</p>
            ) : (
              quotes.map((quote) => (
                // Keyed by id, so an arriving answer mounts a fresh node and
                // plays the entrance while the ones already up sit still.
                <blockquote key={quote.id} className="quote-card fade-up">
                  <span className="quote-mark" aria-hidden>
                    “
                  </span>
                  <p>{quote.text}</p>
                </blockquote>
              ))
            )}
          </div>

          <footer className="panel-total">
            <span className="panel-badge panel-badge-sm" aria-hidden>
              <ChatIcon />
            </span>
            <span>
              <span className="panel-total-label">{displayCopy.totalLabel}</span>
              <strong className="panel-total-value">
                {total.toLocaleString("en-US")}
              </strong>
            </span>
          </footer>
        </aside>
      </div>
    </section>
  );
}

/* --------------------------- tiny inline icons --------------------------- */

function BarsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
      <path d="M5 19V11M12 19V5M19 19v-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
      <path
        d="M4 5h16v11H9l-5 4V5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
