import {
  CON_CATEGORIES,
  PRO_CATEGORIES,
  REASON_CATEGORIES,
  TEXT_LIMITS,
} from "./summary-schema";
import type { ExportPayload } from "./types";

const list = (items: readonly string[]) => items.map((t) => `  - ${t}`).join("\n");
const [rMin, rMax] = TEXT_LIMITS.reason.target;
const [pMin, pMax] = TEXT_LIMITS.procon.target;
const [lMin, lMax] = TEXT_LIMITS.insightLabel.accept;

const SCENARIO = `Scenario the audience answered (ASTRA KM FEST 2026):
Rangga has until 6 PM to finish a proposal that could earn him his first leadership role; his manager expects a working draft at 2 PM. AI could turn a three-hour task into twenty minutes, but he does not know what the client values most, and his last proposal was rejected.
Poll — "If you are Rangga, what would you do?"
  "A" = USE AI FIRST: use AI first, then check and improve it (risk: AI's idea may replace his own).
  "B" = THINK FIRST: think first, then use AI to test and improve his idea (risk: arriving with an unfinished idea).
Essay — "What's your reasoning behind that choice?"`;

/**
 * Shared by the manual "Copy prompt" button in /admin and the auto-summarize
 * cron, so both paths ask for exactly the same thing.
 *
 * Per option the screen shows 2 CATEGORY cards (picked from a fixed list, so
 * they stay stable between runs), 1 free AI INSIGHT card, 1 plus and 1 minus.
 * Character ranges come from measuring the real cards (summary-schema.ts).
 */
export const AI_PROMPT = `You are an Employee Voice analyst at ASTRA KM FEST 2026. Your summary is projected on a large screen in front of the whole company.

${SCENARIO}

Below is a JSON array of anonymous answers. Each has "poll_choice" ("A" or "B") and "text" (their reasoning).

TASK — do this separately for option A and option B:

1. "top": classify every answer of that option into EXACTLY ONE category from its fixed list, count them, and return the 2 categories with the highest count (ties: keep list order). Copy category names character-for-character. Never invent, rename or merge categories.
   Option A reason categories:
${list(REASON_CATEGORIES.A)}
   Option B reason categories:
${list(REASON_CATEGORIES.B)}
   "text": one short sentence that sums up what those answers actually say, ${rMin}–${rMax} characters (it is shown on ONE line, no title).

2. "insight": ONE fresh insight you synthesize yourself from that option's answers — something real and specific that the two "top" categories do not already cover (a surprising angle, a shared condition, a recurring nuance). Give it your own short "label" (${lMin}–${lMax} characters, Title Case, not one of the category names; used only for the operator) and a one-line "text" of ${rMin}–${rMax} characters. "count" = how many answers support it.

3. "pro" and "con": the strongest advantage and the strongest risk of that option, drawn from ALL answers (people who chose the other option often name the risks). Pick "category" from these fixed lists and write "text" as one full sentence of ${pMin}–${pMax} characters.
   Pro categories:
${list(PRO_CATEGORIES)}
   Con categories:
${list(CON_CATEGORIES)}

If an option has no answers yet, still fill every field: use the first categories in its lists with count 0 and write a neutral sentence about that category.

WRITING RULES: simple English a beginner can read, neutral and constructive, no names, no quotes, no emoji. Count characters carefully — text that is too short or too long does not fit its card on screen and will be rejected.

Reply with ONLY valid JSON, no explanation, in exactly this shape:
{
  "A": {
    "top": [
      { "category": "...", "count": 0, "text": "..." },
      { "category": "...", "count": 0, "text": "..." }
    ],
    "insight": { "label": "...", "count": 0, "text": "..." },
    "pro": { "category": "...", "text": "..." },
    "con": { "category": "...", "text": "..." }
  },
  "B": { same shape as "A" }
}

Answers:
`;

export function buildAiPrompt(payload: ExportPayload): string {
  return AI_PROMPT + JSON.stringify(payload, null, 2);
}

/**
 * Gemini structured-output schema for the cron. Enums pin the category names
 * at generation time, so a free-tier model cannot drift to its own wording.
 */
function optionSchema(reasons: readonly string[]) {
  const text = { type: "STRING" };
  const count = { type: "INTEGER" };
  const pick = (values: readonly string[]) => ({
    type: "OBJECT",
    properties: { category: { type: "STRING", enum: [...values] }, text },
    required: ["category", "text"],
  });
  return {
    type: "OBJECT",
    properties: {
      top: {
        type: "ARRAY",
        minItems: 2,
        maxItems: 2,
        items: {
          type: "OBJECT",
          properties: { category: { type: "STRING", enum: [...reasons] }, count, text },
          required: ["category", "count", "text"],
        },
      },
      insight: {
        type: "OBJECT",
        properties: { label: { type: "STRING" }, count, text },
        required: ["label", "count", "text"],
      },
      pro: pick(PRO_CATEGORIES),
      con: pick(CON_CATEGORIES),
    },
    required: ["top", "insight", "pro", "con"],
  };
}

export const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: { A: optionSchema(REASON_CATEGORIES.A), B: optionSchema(REASON_CATEGORIES.B) },
  required: ["A", "B"],
};

/**
 * Not used by the app itself: a helper prompt the team pastes into Gemini
 * (via /admin → "Copy category prompt") to review or redesign the fixed
 * category lists, ideally with rehearsal answers attached.
 */
export const CATEGORY_PROMPT = `You are helping design the fixed category lists for a live AI summary at ASTRA KM FEST 2026.

${SCENARIO}

The big screen shows, for each option, 2 "reason" cards (the 2 most common categories) plus one pro and one con. An AI re-classifies all answers every 5 minutes, so categories must be STABLE, clearly different from each other, and cover almost every realistic answer.

Current lists:
Option A reason categories:
${list(REASON_CATEGORIES.A)}
Option B reason categories:
${list(REASON_CATEGORIES.B)}
Pro categories (used for both options):
${list(PRO_CATEGORIES)}
Con categories (used for both options):
${list(CON_CATEGORIES)}

Please:
1. Propose 5 reason categories for option A and 5 for option B, and 6 pro + 6 con categories. Each name 2–4 words, Title Case, max 26 characters, plain English.
2. For each category, give a one-line definition and 2 example answers that belong to it.
3. Point out any current category that overlaps with another, is too vague, or will rarely be used — and what to replace it with.
4. If sample answers are attached below, classify them with your proposed lists and report how many fall into each category and how many fit none.

Sample answers (may be empty):
`;

export function buildCategoryPrompt(payload: ExportPayload): string {
  return CATEGORY_PROMPT + JSON.stringify(payload, null, 2);
}
