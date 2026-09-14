import { NextResponse, type NextRequest } from "next/server";
import { cronSecretMatches } from "@/lib/auth";
import { buildAiPrompt } from "@/lib/ai-prompt";
import { countFeedback, listFeedback, setConcerns } from "@/lib/store";
import { validateAiResult } from "@/lib/validation";
import type { ExportPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// An external scheduler calls this every few minutes; each run does its own
// feedback export + one Gemini call, so give it real headroom instead of
// Vercel's short default.
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-flash-latest"; // always the current default Flash model
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
 * daily) so Top 3 refreshes itself every few minutes with zero operator
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

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildAiPrompt(payload) }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!geminiResponse.ok) {
      const detail = await geminiResponse.text().catch(() => "");
      console.error("[cron/auto-summarize] Gemini HTTP error", geminiResponse.status, detail);
      return NextResponse.json(
        { error: `Gemini API error ${geminiResponse.status}`, detail },
        { status: 502 },
      );
    }

    const data = (await geminiResponse.json()) as GeminiResponse;
    const text = extractText(data);
    if (!text) {
      console.error("[cron/auto-summarize] empty Gemini response", JSON.stringify(data));
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
    return NextResponse.json({ ok: true, updatedAt, totalResponses: total });
  } catch (error) {
    console.error("[cron/auto-summarize] failed", error);
    const message = error instanceof Error ? error.message : "Gagal auto-summarize.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
