import "server-only";

import { eventConfig } from "./event-config";
import {
  getAdminClient,
  getServerClient,
  hasServiceRole,
  isSupabaseConfigured,
} from "./supabase";
import type {
  ConcernItem,
  DisplayState,
  FeedbackRow,
  PollChoice,
  PollResults,
} from "./types";

/** How much recent feedback the display seeds its border river with. */
export const RIVER_SEED_LIMIT = 120;

const DEFAULT_LOOP_SECONDS = eventConfig.display.pillSpeed.default;

/* ------------------------------------------------------------------ */
/* In-memory demo store                                                */
/* ------------------------------------------------------------------ */
/*
 * Used only when Supabase env vars are absent, so the app can be run and
 * demoed locally with zero setup. It is per-process and NOT durable — never
 * rely on it in production (a serverless deploy has many processes).
 */

type DemoStore = {
  feedback: FeedbackRow[];
  nextId: number;
  concerns: ConcernItem[];
  concernsUpdatedAt: string | null;
  loopSeconds: number;
};

const globalForDemo = globalThis as unknown as { __afDemoStore?: DemoStore };

function demo(): DemoStore {
  globalForDemo.__afDemoStore ??= {
    feedback: [],
    nextId: 1,
    concerns: [],
    concernsUpdatedAt: null,
    loopSeconds: DEFAULT_LOOP_SECONDS,
  };
  return globalForDemo.__afDemoStore;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const usingDemoStore = () => !isSupabaseConfigured();

/**
 * Reads run with the service role when it is available so admin exports and
 * counters can see moderated-out rows too; otherwise they fall back to the
 * anon key and RLS decides what is visible.
 */
function readClient() {
  return hasServiceRole() ? getAdminClient() : getServerClient();
}

const ROW_COLUMNS = "id, message, poll_choice, created_at, is_visible";

export async function insertFeedback(params: {
  message: string;
  pollChoice: PollChoice;
  sessionId: string;
  isVisible: boolean;
}): Promise<FeedbackRow> {
  if (usingDemoStore()) {
    const row: FeedbackRow = {
      id: demo().nextId++,
      message: params.message,
      poll_choice: params.pollChoice,
      created_at: new Date().toISOString(),
      is_visible: params.isVisible,
    };
    demo().feedback.push(row);
    return row;
  }

  const { data, error } = await getServerClient()
    .from("feedback")
    .insert({
      message: params.message,
      poll_choice: params.pollChoice,
      session_id: params.sessionId,
      is_visible: params.isVisible,
    })
    .select(ROW_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as FeedbackRow;
}

export async function listFeedback(options?: {
  limit?: number;
  onlyVisible?: boolean;
}): Promise<FeedbackRow[]> {
  const limit = options?.limit ?? 5000;
  const onlyVisible = options?.onlyVisible ?? false;

  if (usingDemoStore()) {
    return demo()
      .feedback.filter((f) => (onlyVisible ? f.is_visible : true))
      .slice(-limit)
      .reverse();
  }

  let query = readClient()
    .from("feedback")
    .select(ROW_COLUMNS)
    .order("id", { ascending: false })
    .limit(limit);

  if (onlyVisible) query = query.eq("is_visible", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedbackRow[];
}

export async function countFeedback(): Promise<number> {
  if (usingDemoStore()) return demo().feedback.length;

  const { count, error } = await readClient()
    .from("feedback")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Live A/B tally. Counted server-side with two head-only queries rather than
 * pulling every row, so this stays cheap even at a few thousand responses.
 */
export async function countPoll(): Promise<PollResults> {
  if (usingDemoStore()) {
    const rows = demo().feedback;
    const a = rows.filter((r) => r.poll_choice === "A").length;
    const b = rows.filter((r) => r.poll_choice === "B").length;
    return { a, b, total: a + b };
  }

  const client = readClient();
  const [resA, resB] = await Promise.all([
    client.from("feedback").select("id", { count: "exact", head: true }).eq("poll_choice", "A"),
    client.from("feedback").select("id", { count: "exact", head: true }).eq("poll_choice", "B"),
  ]);

  if (resA.error) throw new Error(resA.error.message);
  if (resB.error) throw new Error(resB.error.message);

  const a = resA.count ?? 0;
  const b = resB.count ?? 0;
  return { a, b, total: a + b };
}

export async function getConcerns(): Promise<{
  items: ConcernItem[];
  updatedAt: string | null;
}> {
  if (usingDemoStore()) {
    return { items: demo().concerns, updatedAt: demo().concernsUpdatedAt };
  }

  const { data, error } = await readClient()
    .from("ai_summary")
    .select("rank, title, count, summary, updated_at")
    .order("rank", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const items = rows.map((r) => ({
    rank: r.rank as ConcernItem["rank"],
    title: r.title as string,
    count: r.count as number,
    summary: r.summary as string,
  }));
  const updatedAt =
    rows.length > 0
      ? rows
          .map((r) => r.updated_at as string)
          .sort()
          .at(-1) ?? null
      : null;

  return { items, updatedAt };
}

export async function setConcerns(items: ConcernItem[]): Promise<string> {
  const updatedAt = new Date().toISOString();

  if (usingDemoStore()) {
    demo().concerns = items;
    demo().concernsUpdatedAt = updatedAt;
    return updatedAt;
  }

  if (!hasServiceRole()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so results cannot be published.",
    );
  }

  const admin = getAdminClient();

  // A shorter list than last time must not leave stale rows behind on the
  // projector, so drop anything ranked past what we are about to write.
  const highest = items.reduce((max, item) => Math.max(max, item.rank), 0);
  const { error: pruneError } = await admin
    .from("ai_summary")
    .delete()
    .gt("rank", highest);
  if (pruneError) throw new Error(pruneError.message);

  const { error } = await admin.from("ai_summary").upsert(
    items.map((item) => ({
      rank: item.rank,
      title: item.title,
      count: item.count,
      summary: item.summary,
      updated_at: updatedAt,
    })),
    { onConflict: "rank" },
  );

  if (error) throw new Error(error.message);
  return updatedAt;
}

/**
 * Pill speed lives in a one-row `display_settings` table (see
 * supabase/migration-display-speed.sql). If that table is missing the display
 * just runs at the default speed rather than failing.
 */
export async function getLoopSeconds(): Promise<number> {
  if (usingDemoStore()) return demo().loopSeconds;
  const { data, error } = await readClient()
    .from("display_settings")
    .select("loop_seconds")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_LOOP_SECONDS;
  return data.loop_seconds as number;
}

export async function setLoopSeconds(seconds: number): Promise<void> {
  if (usingDemoStore()) {
    demo().loopSeconds = seconds;
    return;
  }
  if (!hasServiceRole()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server.");
  }
  const { error } = await getAdminClient()
    .from("display_settings")
    .upsert({ id: 1, loop_seconds: seconds, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/**
 * Wipes ALL feedback and the published results. For clearing trial-and-error
 * data between test runs — or right before the real event so the audience
 * screen starts from zero. Destructive and irreversible; the calling route
 * requires admin auth and the dashboard button confirms first.
 */
export async function resetAllData(): Promise<void> {
  if (usingDemoStore()) {
    const store = demo();
    store.feedback = [];
    store.nextId = 1;
    store.concerns = [];
    store.concernsUpdatedAt = null;
    return;
  }

  if (!hasServiceRole()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so a reset cannot be performed.",
    );
  }

  const admin = getAdminClient();

  const { error: feedbackError } = await admin
    .from("feedback")
    .delete()
    .not("id", "is", null);
  if (feedbackError) throw new Error(feedbackError.message);

  const { error: summaryError } = await admin
    .from("ai_summary")
    .delete()
    .not("rank", "is", null);
  if (summaryError) throw new Error(summaryError.message);
}

export async function getDisplayState(): Promise<DisplayState> {
  const [rows, concerns, total, poll, loopSeconds] = await Promise.all([
    listFeedback({ limit: RIVER_SEED_LIMIT, onlyVisible: true }),
    getConcerns(),
    countFeedback(),
    countPoll(),
    getLoopSeconds(),
  ]);

  return {
    feedback: rows.map((r) => ({
      id: r.id,
      text: r.message,
      created_at: r.created_at,
    })),
    poll,
    concerns: concerns.items,
    concernsUpdatedAt: concerns.updatedAt,
    totalResponses: total,
    loopSeconds,
    demoMode: usingDemoStore(),
  };
}
