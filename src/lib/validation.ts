import { ESSAY_MAX_LENGTH, ESSAY_MIN_LENGTH, POLL_KEYS } from "./event-config";
import { allowedTitles, SLOT_COUNT, slotOf, TEXT_LIMITS, textLimit } from "./summary-schema";
import type { AiResultPayload, ConcernItem, PollChoice } from "./types";

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** The audience's free-text answer to the essay question. */
export function validateEssay(raw: unknown): Validated<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "Your answer must be text." };
  }
  const message = raw.replace(/\s+/g, " ").trim();
  if (message.length === 0) {
    return { ok: false, error: "Please write an answer before submitting." };
  }
  if (message.length < ESSAY_MIN_LENGTH) {
    return {
      ok: false,
      error: `Please write at least ${ESSAY_MIN_LENGTH} characters.`,
    };
  }
  if (message.length > ESSAY_MAX_LENGTH) {
    return {
      ok: false,
      error: `Please keep your answer under ${ESSAY_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, value: message };
}

/** The A/B vote. Required — the display's left panel is a share of the total. */
export function validatePollChoice(raw: unknown): Validated<PollChoice> {
  if (typeof raw !== "string" || !POLL_KEYS.includes(raw as PollChoice)) {
    return { ok: false, error: "Please choose option A or B." };
  }
  return { ok: true, value: raw as PollChoice };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * The AI's own shape (see ai-prompt.ts), flattened into the ten table rows.
 * `{ "A": { "top": [2], "insight": {}, "pro": {}, "con": {} }, "B": … }`
 */
function toRows(raw: Obj): unknown[] | null {
  const rows: unknown[] = [];
  const base = { A: 0, B: 3 } as const;
  const side = { A: 7, B: 9 } as const;
  for (const option of POLL_KEYS) {
    const o = raw[option];
    if (!isObj(o)) return null;
    const top = Array.isArray(o.top) ? o.top : [];
    const insight = isObj(o.insight) ? o.insight : {};
    top.slice(0, 2).forEach((t, i) => {
      const item = isObj(t) ? t : {};
      rows.push({ rank: base[option] + i + 1, title: item.category, count: item.count, summary: item.text });
    });
    rows.push({ rank: base[option] + 3, title: insight.label, count: insight.count, summary: insight.text });
    for (const [key, offset] of [["pro", 0], ["con", 1]] as const) {
      const item = isObj(o[key]) ? (o[key] as Obj) : {};
      rows.push({ rank: side[option] + offset, title: item.category, count: 0, summary: item.text });
    }
  }
  return rows;
}

/**
 * Validates the AI summary — pasted by hand in /admin or fetched by the
 * auto-summarize cron. Accepts the AI's A/B shape or the ten stored rows
 * (what /admin re-posts after previewing).
 *
 * Nothing reaches the projector without passing this: wrong categories or
 * text that would not fit its card are rejected and the previous, good
 * summary stays on screen.
 */
export function validateAiResult(raw: unknown): Validated<AiResultPayload> {
  if (!isObj(raw)) return { ok: false, error: 'JSON must be an object with "A" and "B" keys.' };

  const list = Array.isArray(raw.concerns) ? raw.concerns : toRows(raw);
  if (!list) return { ok: false, error: 'JSON must have "A" and "B" objects (or a "concerns" array).' };
  if (list.length !== SLOT_COUNT) {
    return { ok: false, error: `Expected ${SLOT_COUNT} cards, found ${list.length}. Each option needs 2 "top", 1 "insight", 1 "pro", 1 "con".` };
  }

  const items: ConcernItem[] = [];
  const seen = new Set<number>();

  for (const entry of list) {
    const obj = isObj(entry) ? entry : {};
    const rank = Number(obj.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > SLOT_COUNT || seen.has(rank)) {
      return { ok: false, error: `Invalid or duplicate slot ${String(obj.rank)}.` };
    }
    seen.add(rank);
    const { option, kind } = slotOf(rank);
    const label = `Option ${option} ${kind}`;

    let title = str(obj.title);
    const allowed = allowedTitles(rank);
    if (allowed) {
      const match = allowed.find((t) => t.toLowerCase() === title.toLowerCase());
      if (!match) return { ok: false, error: `${label}: "${title}" is not one of: ${allowed.join(", ")}.` };
      title = match;
    } else {
      const [min, max] = TEXT_LIMITS.insightLabel.accept;
      if (title.length < min || title.length > max) {
        return { ok: false, error: `${label}: label must be ${min}–${max} characters.` };
      }
    }

    const summary = str(obj.summary);
    const [min, max] = textLimit(rank);
    if (summary.length < min || summary.length > max) {
      return { ok: false, error: `${label}: text is ${summary.length} characters, must be ${min}–${max} to fit its card.` };
    }

    const count = Number(obj.count ?? 0);
    items.push({ rank, title, count: Number.isInteger(count) && count >= 0 ? count : 0, summary });
  }

  // Two category cards of one option must not repeat the same category.
  for (const [a, b] of [[1, 2], [4, 5]]) {
    const ta = items.find((i) => i.rank === a)?.title;
    if (ta && ta === items.find((i) => i.rank === b)?.title) {
      return { ok: false, error: `Option ${a === 1 ? "A" : "B"} uses "${ta}" twice.` };
    }
  }

  items.sort((a, b) => a.rank - b.rank);
  return { ok: true, value: { concerns: items } };
}
