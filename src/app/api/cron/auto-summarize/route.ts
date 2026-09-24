import { NextResponse, type NextRequest } from "next/server";
import { cronSecretMatches } from "@/lib/auth";
import { AI_RESPONSE_SCHEMA, buildAiPrompt } from "@/lib/ai-prompt";
import { countFeedback, listFeedback, setConcerns } from "@/lib/store";
import { validateAiResult } from "@/lib/validation";
import type { ExportPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// An external scheduler calls this every few minutes; each run does its own
// feedback export + one Gemini call, so give it real headroom instead of
// Vercel's short default.
export const maxDuration = 60;

/**
 * Tried in order. The free tier's headline Flash model is the one everyone
 * else is hammering too, so when it answers 503 "high demand" the cheapest
 * fix is not to wait — it is to ask a less contended model. The Lite models
 * are more than capable of clustering a few hundred short answers.
 *
 * Override with GEMINI_MODELS (comma separated) if Google renames things,
 * so a model rename never needs a code change on event day.
 */
const DEFAULT_MODELS = [
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
];

const MODELS = (process.env.GEMINI_MODELS?.trim() || DEFAULT_MODELS.join(","))
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

/** Worth a second go; anything else means this model will not work at all. */
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS_PER_MODEL = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function modelUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

type GeminiAttempt =
  | { ok: true; data: GeminiResponse; model: string; tried: string[] }
  | { ok: false; status: number; detail: string; tried: string[] };

/**
 * Calls Gemini, retrying transient failures and falling back across models.
 *
 * Deliberately modest: the scheduler comes back every 5 minutes anyway, so
 * this only needs to outlast a short spike, not guarantee an answer. Two
 * attempts per model across three models fits well inside `maxDuration`.
 *
 * `temperature: 0` (+ `seed`) is here to reduce run-to-run wording drift in
 * the free-text "summary" field. It is NOT what makes the concern list
 * itself stable — Google's own docs call `seed` "best-effort" repeatability,
 * not a guarantee, and community reports show Gemini can still vary output
 * even with temperature and seed both pinned. The real fix for "the AI
 * summary keeps changing" is the fixed category lists in
 * summary-schema.ts, pinned here as enums in `responseSchema`: the model can
 * only pick from titles that never change instead of inventing new ones.
 */
async function askGemini(prompt: string, apiKey: string): Promise<GeminiAttempt> {
  const tried: string[] = [];
  let last: { status: number; detail: string } = {
    status: 503,
    detail: "No Gemini model was reachable.",
  };

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(modelUrl(model, apiKey), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: AI_RESPONSE_SCHEMA,
              temperature: 0,
              topP: 1,
              seed: 1,
            },
          }),
        });
      } catch (error) {
        tried.push(`${model}#${attempt} network-error`);
        last = {
          status: 503,
          detail: error instanceof Error ? error.message : "network error",
        };
        if (attempt < ATTEMPTS_PER_MODEL) await sleep(900);
        continue;
      }

      if (response.ok) {
        tried.push(`${model}#${attempt} ok`);
        return { ok: true, data: (await response.json()) as GeminiResponse, model, tried };
      }

      const detail = await response.text().catch(() => "");
      tried.push(`${model}#${attempt} ${response.status}`);
      last = { status: response.status, detail };

      // A rejected key will be rejected by every model — stop immediately so
      // the cron log says "fix the key" instead of burning six requests.
      if (response.status === 401 || response.status === 403) {
        return { ok: false, status: response.status, detail, tried };
      }

      if (!TRANSIENT_STATUSES.has(response.status)) break; // try the next model
      if (attempt < ATTEMPTS_PER_MODEL) await sleep(900 * attempt);
    }
  }

  return { ok: false, status: last.status, detail: last.detail, tried };
}

function extractSecret(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.nextUrl.searchParams.get("secret");
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

/**
 * Pulls the JSON text out of Gemini's response shape. With
 * responseMimeType: "application/json" this is expected to already be pure
 * JSON, but we still defensively strip ```json fences in case a future
 * model revision wraps it in markdown anyway.
 */
function extractText(data: GeminiResponse): string | null {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.trim().length === 0) return null;
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Automatic replacement for the manual "copy prompt into ChatGPT/Gemini,
 * paste JSON back" flow in /admin — called on a timer by an external cron
 * (cron-job.org / GitHub Actions, since Vercel's free-tier Cron only runs
 * daily) so the display summary refreshes itself every few minutes with zero operator
 * action, per the user's request. Auto-publishes straight to the display —
 * no human review step, by explicit choice, since this is low-stakes
 * internal employee feedback, not anything that needs gatekeeping.
 *
 * Safety net: any failure (missing config, feedback empty, Gemini error,
 * malformed/invalid JSON back) leaves the last published Top 3 untouched
 * and returns a non-200 so the scheduler's own run history shows the
 * failure — it never blanks or corrupts what's already live on screen.
 */
export async function GET(request: NextRequest) {
  if (!cronSecretMatches(extractSecret(request))) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY belum di-set di server." },
      { status: 500 },
    );
  }

  try {
    const total = await countFeedback();
    if (total === 0) {
      return NextResponse.json({ skipped: true, reason: "Belum ada feedback." });
    }

    const rows = await listFeedback({ limit: 5000 });
    const payload: ExportPayload = {
      responses: rows
        .slice()
        .reverse()
        .map((row) => ({
          id: row.id,
          text: row.message,
          poll_choice: row.poll_choice,
          created_at: row.created_at,
        })),
    };

    const attempt = await askGemini(buildAiPrompt(payload), apiKey);

    if (!attempt.ok) {
      console.error(
        "[cron/auto-summarize] Gemini unreachable",
        attempt.status,
        attempt.tried.join(" → "),
        attempt.detail,
      );
      return NextResponse.json(
        {
          error: `Gemini API error ${attempt.status}`,
          tried: attempt.tried,
          detail: attempt.detail,
        },
        { status: 502 },
      );
    }

    const text = extractText(attempt.data);
    if (!text) {
      console.error("[cron/auto-summarize] empty Gemini response", JSON.stringify(attempt.data));
      return NextResponse.json({ error: "Gemini tidak mengembalikan teks." }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[cron/auto-summarize] Gemini returned non-JSON:", text.slice(0, 500));
      return NextResponse.json({ error: "Respons Gemini bukan JSON valid." }, { status: 502 });
    }

    const result = validateAiResult(parsed);
    if (!result.ok) {
      console.error("[cron/auto-summarize] validation failed:", result.error);
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const updatedAt = await setConcerns(result.value.concerns);
    return NextResponse.json({
      ok: true,
      updatedAt,
      totalResponses: total,
      model: attempt.model,
      tried: attempt.tried,
    });
  } catch (error) {
    console.error("[cron/auto-summarize] failed", error);
    const message = error instanceof Error ? error.message : "Gagal auto-summarize.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
