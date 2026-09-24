import type { ConcernItem, PollChoice } from "./types";

/**
 * What the AI summary looks like on the big screen, and the fixed category
 * lists it has to pick from. Shared by the prompt (ai-prompt.ts), the
 * validator (validation.ts) and the display, so all three agree on one shape.
 *
 * Why fixed lists: letting the model invent its own themes every 5 minutes
 * made the screen reshuffle constantly. Picking from a closed list keeps the
 * labels stable between runs ("Text Clustering as Classification with LLMs",
 * arXiv:2410.00927). Each option still gets ONE free "AI insight" card that
 * the model writes from scratch, so the screen is not only stock phrases.
 */

/** Left boxes: why people picked each option. Two cards come from here. */
export const REASON_CATEGORIES: Record<PollChoice, readonly string[]> = {
  A: [
    "Speed & Deadline",
    "More Time to Polish",
    "Strong Starting Point",
    "Check & Improve",
    "Don't Reinvent the Wheel",
  ],
  B: [
    "Own Idea First",
    "Avoid AI Anchoring",
    "Understand the Client",
    "Ownership & Leadership",
    "Learn from Last Time",
  ],
};

/** Right box: the one "plus" shown per option comes from here… */
export const PRO_CATEGORIES = [
  "Speed & Efficiency",
  "Quality & Depth",
  "Originality",
  "Ownership & Credibility",
  "Client Focus",
  "Learning & Growth",
] as const;

/** …and the one "minus" per option from here. */
export const CON_CATEGORIES = [
  "Over-Reliance on AI",
  "Loss of Own Voice",
  "Time Pressure",
  "Accuracy Risk",
  "Unfinished Work",
  "Generic Output",
] as const;

/**
 * Character ranges, measured by rendering real text in each card at its final
 * size (2 lines, no overflow). `target` is what the prompt asks for; `accept`
 * is what validation lets through — still exactly 2 lines, just less full.
 */
export const TEXT_LIMITS = {
  // Poppins 500 16px, 541px wide: always 2 lines from 79 to 119 characters.
  reason: { target: [95, 110], accept: [80, 118] },
  // Poppins 400 14px, 372px wide: always 2 lines from 65 to 98 characters.
  procon: { target: [80, 92], accept: [66, 97] },
  /** The AI's own label for its free "insight" card. */
  insightLabel: { accept: [3, 26] },
} as const;

/*
 * Stored as ten rows in the existing ai_summary table (rank 1–10), so the
 * realtime feed, RLS and reset logic all keep working unchanged.
 *   1–2 A reasons (category)   3 A AI insight
 *   4–5 B reasons (category)   6 B AI insight
 *   7 A pro   8 A con   9 B pro   10 B con
 */
export const SLOT_COUNT = 10;

export type SlotKind = "reason" | "insight" | "pro" | "con";

export function slotOf(rank: number): { option: PollChoice; kind: SlotKind } {
  if (rank <= 6) {
    const option: PollChoice = rank <= 3 ? "A" : "B";
    const kind: SlotKind = rank === 3 || rank === 6 ? "insight" : "reason";
    return { option, kind };
  }
  return { option: rank <= 8 ? "A" : "B", kind: rank % 2 === 1 ? "pro" : "con" };
}

/** Allowed titles for a slot, or null when the AI writes its own label. */
export function allowedTitles(rank: number): readonly string[] | null {
  const { option, kind } = slotOf(rank);
  if (kind === "reason") return REASON_CATEGORIES[option];
  if (kind === "pro") return PRO_CATEGORIES;
  if (kind === "con") return CON_CATEGORIES;
  return null;
}

export function textLimit(rank: number): readonly [number, number] {
  const { kind } = slotOf(rank);
  return kind === "pro" || kind === "con" ? TEXT_LIMITS.procon.accept : TEXT_LIMITS.reason.accept;
}

export type OptionSummary = {
  reasons: ConcernItem[]; // 2 category cards, then the AI insight card
  pro: ConcernItem | null;
  con: ConcernItem | null;
};

/** Rows from the table → what the display draws, per option. */
export function groupSummary(items: ConcernItem[]): Record<PollChoice, OptionSummary> {
  const at = new Map(items.map((item) => [item.rank, item]));
  const pick = (ranks: number[]) =>
    ranks.map((r) => at.get(r)).filter((x): x is ConcernItem => Boolean(x));
  return {
    A: { reasons: pick([1, 2, 3]), pro: at.get(7) ?? null, con: at.get(8) ?? null },
    B: { reasons: pick([4, 5, 6]), pro: at.get(9) ?? null, con: at.get(10) ?? null },
  };
}
