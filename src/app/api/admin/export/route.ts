import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { listFeedback } from "@/lib/store";
import type { ExportPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Raw feedback dump in the exact shape the operator pastes into
 * ChatGPT / Gemini for manual synthesis. Oldest first so the AI reads the
 * event chronologically.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  try {
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

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="anniversary-feedback-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin/export] failed", error);
    return NextResponse.json({ error: "Gagal mengekspor data." }, { status: 500 });
  }
}
