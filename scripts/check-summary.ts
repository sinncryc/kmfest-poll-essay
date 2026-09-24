/**
 * Smallest check for the AI summary contract: a well-formed Gemini answer
 * becomes 10 display rows, and bad answers are rejected before they reach
 * the screen. Run: npx tsx scripts/check-summary.ts
 */
import assert from "node:assert/strict";
import { AI_PROMPT, AI_RESPONSE_SCHEMA } from "../src/lib/ai-prompt";
import { groupSummary } from "../src/lib/summary-schema";
import { validateAiResult } from "../src/lib/validation";

const r = (n: number) => "x".repeat(n);
const option = (a: string, b: string) => ({
  top: [
    { category: a, count: 9, text: r(90) },
    { category: b, count: 4, text: r(90) },
  ],
  insight: { label: "Draft, Then Discuss", count: 3, text: r(90) },
  pro: { category: "speed & efficiency", text: r(85) }, // case is normalised
  con: { category: "Time Pressure", text: r(85) },
});
const good = { A: option("Speed & Deadline", "Check & Improve"), B: option("Own Idea First", "Understand the Client") };

const ok = validateAiResult(good);
assert.ok(ok.ok, !ok.ok ? ok.error : "");
if (ok.ok) {
  assert.equal(ok.value.concerns.length, 10);
  assert.equal(ok.value.concerns[6].title, "Speed & Efficiency");
  const g = groupSummary(ok.value.concerns);
  assert.equal(g.A.reasons.map((x) => x.title).join("|"), "Speed & Deadline|Check & Improve|Draft, Then Discuss");
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
assert.equal(bad((x) => (x.A.top[0].text = r(120))), false, "too long for card");
assert.equal(bad((x) => (x.B.pro.text = r(40))), false, "too short, leaves card half empty");
assert.equal(bad((x) => (x.A.insight.label = r(40))), false, "insight label too long");
assert.equal(bad((x) => delete (x as Partial<typeof good>).B), false, "missing option");

assert.ok(AI_PROMPT.includes("Don't Reinvent the Wheel") && AI_PROMPT.includes("95–110"));
assert.ok(JSON.stringify(AI_RESPONSE_SCHEMA).includes("Over-Reliance on AI"));
console.log("summary checks passed");
