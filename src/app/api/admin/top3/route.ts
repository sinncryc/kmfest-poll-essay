import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { setConcerns } from "@/lib/store";
import { validateAiResult } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Publishes a validated AI-synthesis result to the big screen. */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON yang valid." }, { status: 400 });
  }

  const validated = validateAiResult(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const updatedAt = await setConcerns(validated.value.concerns);
    return NextResponse.json({ ok: true, updatedAt, concerns: validated.value.concerns });
  } catch (error) {
    console.error("[admin/top3] publish failed", error);
    const message =
      error instanceof Error ? error.message : "Gagal mempublikasikan hasil.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
