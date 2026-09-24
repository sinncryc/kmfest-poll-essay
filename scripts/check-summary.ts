/**
 * Smallest check for the AI summary contract: a well-formed Gemini answer
 * becomes 10 display rows, and bad answers are rejected before they reach
 * the screen. Run: npx tsx scripts/check-summary.ts
 */
import assert from "node:assert/strict";
import { AI_PROMPT, AI_RESPONSE_SCHEMA } from "../src/lib/ai-prompt";
import { groupSummary, REASON_CATEGORIES, TEXT_LIMITS } from "../src/lib/summary-schema";
import { validateAiResult } from "../src/lib/validation";

const r = (n: number) => "x".repeat(n);
const option = (a: string, b: string) => ({
  top: [
    { category: a, count: 9 },
    { category: b, count: 4 },
  ],
  insight: { label: "Draft, Then Discuss", count: 3, text: r(45) },
  pro: { category: "speed & efficiency", text: r(85) }, // case is normalised
  con: { category: "Time Pressure", text: r(85) },
});
const good = { A: option(REASON_CATEGORIES.A[0], REASON_CATEGORIES.A[3]), B: option(REASON_CATEGORIES.B[0], REASON_CATEGORIES.B[2]) };

const ok = validateAiResult(good);
assert.ok(ok.ok, !ok.ok ? ok.error : "");
if (ok.ok) {
  assert.equal(ok.value.concerns.length, 10);
  assert.equal(ok.value.concerns[6].title, "Speed & Efficiency");
  const g = groupSummary(ok.value.concerns);
  assert.equal(g.A.reasons[0].summary, REASON_CATEGORIES.A[0], "card 1 shows the category sentence");
  assert.equal(g.A.reasons[2].title, "Draft, Then Discuss");
  assert.equal(g.B.con?.title, "Time Pressure");
  // /admin re-posts the rows it previewed — must validate the same way.
  assert.ok(validateAiResult({ concerns: ok.value.concerns }).ok);
}

const bad = (patch: (x: typeof good) => void) => {
  const copy = structuredClone(good);
  patch(copy);
  return validateAiResult(copy).ok;
};
assert.equal(bad((x) => (x.A.top[0].category = "Made Up")), false, "unknown category");
assert.equal(bad((x) => (x.B.top[1].category = x.B.top[0].category)), false, "same category twice");
assert.equal(bad((x) => (x.A.insight.text = r(60))), false, "insight too long for one line");
assert.equal(bad((x) => (x.B.pro.text = r(40))), false, "too short, leaves card half empty");
assert.equal(bad((x) => (x.A.insight.label = r(40))), false, "insight label too long");
assert.equal(bad((x) => delete (x as Partial<typeof good>).B), false, "missing option");

assert.ok(AI_PROMPT.includes(REASON_CATEGORIES.A[4]) && AI_PROMPT.includes("40–48"));

// Every category sentence must itself fit one line on screen.
const [minR, maxR] = TEXT_LIMITS.reason.accept;
for (const c of [...REASON_CATEGORIES.A, ...REASON_CATEGORIES.B]) {
  assert.ok(c.length >= minR && c.length <= maxR, `category too long/short for one line: "${c}" (${c.length})`);
}
assert.ok(JSON.stringify(AI_RESPONSE_SCHEMA).includes("Over-Reliance on AI"));
console.log("summary checks passed");
