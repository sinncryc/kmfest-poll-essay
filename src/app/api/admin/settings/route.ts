import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { eventConfig } from "@/lib/event-config";
import { setLoopSeconds } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sets how fast the answer pills orbit on /display (seconds per lap). */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { loopSeconds?: unknown } | null;
  const seconds = Number(body?.loopSeconds);
  const { min, max } = eventConfig.display.pillSpeed;
  if (!Number.isInteger(seconds) || seconds < min || seconds > max) {
    return NextResponse.json(
      { error: `Kecepatan harus ${min}–${max} detik per putaran.` },
      { status: 400 },
    );
  }

  try {
    await setLoopSeconds(seconds);
    return NextResponse.json({ ok: true, loopSeconds: seconds });
  } catch (error) {
    console.error("[admin/settings] failed", error);
    const message = error instanceof Error ? error.message : "Gagal menyimpan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
