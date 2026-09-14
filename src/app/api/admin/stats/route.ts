import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { countFeedback, countPoll, getConcerns, usingDemoStore } from "@/lib/store";
import { hasServiceRole } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  try {
    const [total, concerns, poll] = await Promise.all([
      countFeedback(),
      getConcerns(),
      countPoll(),
    ]);
    return NextResponse.json(
      {
        totalResponses: total,
        poll,
        concerns: concerns.items,
        lastAiUpdate: concerns.updatedAt,
        demoMode: usingDemoStore(),
        canPublish: usingDemoStore() || hasServiceRole(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[admin/stats] failed", error);
    return NextResponse.json({ error: "Gagal memuat statistik." }, { status: 500 });
  }
}
