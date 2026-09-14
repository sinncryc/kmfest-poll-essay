import type { ExportPayload } from "./types";

/**
 * Shared between the manual "Copy Prompt" button in /admin (operator pastes
 * this into ChatGPT/Gemini/Claude by hand) and the automatic cron route
 * (src/app/api/cron/auto-summarize/route.ts, which sends the same prompt to
 * the Gemini API on a timer). Kept in one place so the two paths can never
 * drift apart — whatever the manual flow asks the AI to do, the automatic
 * flow asks for exactly the same thing.
 *
 * Asks for five themes because the display's right-hand panel shows a
 * ranked top five; `count` is what the screen turns into a percentage.
 */
export const AI_PROMPT = `You are an Employee Voice analyst at ASTRA KM FEST 2026.

Below is a JSON array of anonymous audience answers to this question:
"Regardless of which side you chose, what is ONE concern you would want addressed before using AI in this situation?"

Each answer also records that person's poll vote:
- "A" = USE AI NOW
- "B" = UNDERSTAND FIRST

Your task:
1. Group ALL the answers into meaningful themes (concerns).
2. Pick the 5 themes with the most answers.
3. For each theme write a short title (max 4 words) and one neutral, constructive sentence that is fit to project on a large screen in front of the whole company.

Reply with ONLY valid JSON, no explanation, in exactly this shape:
{
  "concerns": [
    { "rank": 1, "title": "...", "count": 0, "summary": "..." },
    { "rank": 2, "title": "...", "count": 0, "summary": "..." },
    { "rank": 3, "title": "...", "count": 0, "summary": "..." },
    { "rank": 4, "title": "...", "count": 0, "summary": "..." },
    { "rank": 5, "title": "...", "count": 0, "summary": "..." }
  ]
}

Rules: "count" = how many answers fall under that theme, and the counts must add up to no more than the total number of answers. "title" max 60 characters. "summary" max 220 characters. Write in English. Rank 1 is the most common concern.

Answers:
`;

export function buildAiPrompt(payload: ExportPayload): string {
  return AI_PROMPT + JSON.stringify(payload, null, 2);
}
