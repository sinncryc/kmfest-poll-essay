import { ESSAY_MAX_LENGTH, ESSAY_MIN_LENGTH, POLL_KEYS } from "./event-config";
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

const MIN_CONCERNS = 3;
const MAX_CONCERNS = 5;

/**
 * Validates the JSON coming back from the AI — whether an operator pasted it
 * by hand in /admin or the auto-summarize cron fetched it from Gemini.
 *
 * Nothing reaches the projector without passing this, which matters more now
 * that the cron publishes with no human in the loop: a malformed or
 * over-long answer is rejected and the previous, good summary stays up.
 */
export function validateAiResult(raw: unknown): Validated<AiResultPayload> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: 'JSON must be an object with a "concerns" key.' };
  }

  const record = raw as Record<string, unknown>;
  // Tolerate the older "top_3" key so a previously copied prompt still works.
  const list = record.concerns ?? record.top_3;

  if (!Array.isArray(list)) {
    return { ok: false, error: '"concerns" is missing or is not an array.' };
  }
  if (list.length < MIN_CONCERNS || list.length > MAX_CONCERNS) {
    return {
      ok: false,
      error: `"concerns" must hold ${MIN_CONCERNS}–${MAX_CONCERNS} items (found ${list.length}).`,
    };
  }

  const items: ConcernItem[] = [];
  const seenRanks = new Set<number>();

  for (let i = 0; i < list.length; i += 1) {
    const label = `Item ${i + 1}`;
    const item = list[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `${label} is not an object.` };
    }
    const obj = item as Record<string, unknown>;

    const rank = Number(obj.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > MAX_CONCERNS) {
      return { ok: false, error: `${label}: "rank" must be between 1 and ${MAX_CONCERNS}.` };
    }
    if (seenRanks.has(rank)) {
      return { ok: false, error: `Rank ${rank} appears more than once.` };
    }
    seenRanks.add(rank);

    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title) return { ok: false, error: `${label}: "title" is required.` };
    if (title.length > 60) {
      return { ok: false, error: `${label}: "title" must be 60 characters or fewer.` };
    }

    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    if (!summary) return { ok: false, error: `${label}: "summary" is required.` };
    if (summary.length > 220) {
      return { ok: false, error: `${label}: "summary" must be 220 characters or fewer.` };
    }

    const count = Number(obj.count ?? 0);
    if (!Number.isInteger(count) || count < 0) {
      return { ok: false, error: `${label}: "count" must be a whole number ≥ 0.` };
    }

    items.push({ rank: rank as ConcernItem["rank"], title, count, summary });
  }

  items.sort((a, b) => a.rank - b.rank);
  return { ok: true, value: { concerns: items } };
}
