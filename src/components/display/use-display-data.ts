"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient, supabaseEnabled } from "@/lib/supabase-browser";
import type { ConcernItem, DisplayState, PollChoice, PollResults } from "@/lib/types";

export type RiverSource = {
  /** Unique per feedback row. */
  id: number;
  text: string;
};

export type ConnectionState = "connecting" | "live" | "polling" | "error";

/** Keep a bounded pool so the river can recycle without growing forever. */
const POOL_LIMIT = 200;
const POLL_INTERVAL_MS = 3000;
/**
 * Safety-net resync, even when the websocket reports itself healthy.
 *
 * Deliberately short: a "SUBSCRIBED" channel that silently delivers no rows
 * (table missing from the `supabase_realtime` publication, an RLS filter, a
 * proxy quietly dropping the socket) looks exactly like a quiet room, and on
 * the big screen the difference is answers appearing instantly versus a
 * minute late. One small read every few seconds, for one display client, is
 * a cheap price for never having to trust that.
 */
const RESYNC_INTERVAL_MS = 5000;
const EMPTY_POLL: PollResults = { a: 0, b: 0, total: 0 };

export function useDisplayData() {
  const [pool, setPool] = useState<RiverSource[]>([]);
  const [freshIds, setFreshIds] = useState<number[]>([]);
  const [poll, setPoll] = useState<PollResults>(EMPTY_POLL);
  const [concerns, setConcerns] = useState<ConcernItem[]>([]);
  const [concernsUpdatedAt, setConcernsUpdatedAt] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>(
    supabaseEnabled ? "connecting" : "polling",
  );
  const [demoMode, setDemoMode] = useState(false);
  const [ready, setReady] = useState(false);

  const seenRef = useRef<Set<number>>(new Set());

  const ingest = useCallback((items: RiverSource[], asNew: boolean) => {
    const fresh = items.filter((item) => !seenRef.current.has(item.id));
    if (fresh.length === 0) return;
    for (const item of fresh) seenRef.current.add(item.id);

    setPool((prev) => [...fresh, ...prev].slice(0, POOL_LIMIT));
    if (asNew) {
      // "Fresh" only drives the highlight ring; keep the list short so the
      // whole border does not light up at once during a burst of answers.
      setFreshIds((prev) => [...fresh.map((f) => f.id), ...prev].slice(0, 8));
    }
  }, []);

  const applySnapshot = useCallback(
    (state: DisplayState, treatAsNew: boolean) => {
      setPoll(state.poll ?? EMPTY_POLL);
      setConcerns(state.concerns ?? []);
      setConcernsUpdatedAt(state.concernsUpdatedAt);
      setTotal(state.totalResponses);
      setDemoMode(state.demoMode);
      // Snapshot arrives newest-first; reverse so the river ingests in order.
      ingest(
        state.feedback
          .slice()
          .reverse()
          .map((f) => ({ id: f.id, text: f.text })),
        treatAsNew,
      );
      setReady(true);
    },
    [ingest],
  );

  const fetchSnapshot = useCallback(
    async (treatAsNew: boolean) => {
      try {
        const response = await fetch("/api/display-state", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        applySnapshot((await response.json()) as DisplayState, treatAsNew);
        return true;
      } catch (error) {
        console.error("[display] snapshot failed", error);
        return false;
      }
    },
    [applySnapshot],
  );

  /* Initial load ---------------------------------------------------- */
  useEffect(() => {
    // Data loading: state is set from the async response, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSnapshot(false);
  }, [fetchSnapshot]);

  /* Realtime (Supabase) or polling fallback -------------------------- */
  useEffect(() => {
    const client = supabaseEnabled ? getBrowserClient() : null;

    if (!client) {
      const timer = setInterval(() => void fetchSnapshot(true), POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }

    const channel = client
      .channel("kmfest-display")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "feedback",
          filter: "is_visible=eq.true",
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            message: string;
            poll_choice: PollChoice | null;
          };
          if (typeof row?.id !== "number" || typeof row?.message !== "string") return;

          ingest([{ id: row.id, text: row.message }], true);
          setTotal((value) => value + 1);
          // Move the bar immediately rather than waiting for the next resync —
          // the vote is the thing the room is watching.
          if (row.poll_choice === "A" || row.poll_choice === "B") {
            setPoll((prev) => ({
              a: prev.a + (row.poll_choice === "A" ? 1 : 0),
              b: prev.b + (row.poll_choice === "B" ? 1 : 0),
              total: prev.total + 1,
            }));
          }
        },
      )
      .on(
        // Only INSERT bumps the counters locally above — a DELETE (the admin
        // "Reset" button wipes the whole table at once) had no listener at
        // all, so the totals only ever went back to 0 by accident.
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "feedback" },
        () => {
          void fetchSnapshot(false);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_summary" },
        () => {
          void fetchSnapshot(false);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setConnection("error");
      });

    // Safety net: even with a healthy socket, resync occasionally so a
    // missed event never leaves the big screen stale during an event.
    const resync = setInterval(() => void fetchSnapshot(true), RESYNC_INTERVAL_MS);

    return () => {
      clearInterval(resync);
      void client.removeChannel(channel);
    };
  }, [fetchSnapshot, ingest]);

  return {
    pool,
    freshIds,
    poll,
    concerns,
    concernsUpdatedAt,
    total,
    connection,
    demoMode,
    ready,
  };
}
