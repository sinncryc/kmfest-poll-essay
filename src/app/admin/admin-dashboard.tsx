"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { eventConfig } from "@/lib/event-config";
import { AI_PROMPT, CATEGORY_PROMPT } from "@/lib/ai-prompt";
import { slotOf } from "@/lib/summary-schema";
import type { ConcernItem, PollResults } from "@/lib/types";
import { validateAiResult } from "@/lib/validation";
import EventLogos from "@/components/brand/event-logos";

type Stats = {
  totalResponses: number;
  poll: PollResults;
  concerns: ConcernItem[];
  lastAiUpdate: string | null;
  demoMode: boolean;
  canPublish: boolean;
};

export default function AdminDashboard() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      const payload = await response.json();
      setAuthenticated(Boolean(payload.authenticated));
      setConfigured(Boolean(payload.configured));
    } catch {
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkSession();
  }, [checkSession]);

  if (checking) {
    return (
      <Shell>
        <p className="text-sm text-slate-500">Memeriksa sesi…</p>
      </Shell>
    );
  }

  if (!authenticated) {
    return <LoginScreen configured={configured} onSuccess={() => setAuthenticated(true)} />;
  }

  return <Dashboard onLogout={() => setAuthenticated(false)} />;
}

/* ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-ink-900 px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </main>
  );
}

function LoginScreen({
  configured,
  onSuccess,
}: {
  configured: boolean;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "Login gagal.");
        return;
      }
      onSuccess();
    } catch {
      setError("Koneksi bermasalah.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-900 px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-ink-500 bg-ink-800/80 p-7"
      >
        <EventLogos size="sm" className="mb-5" />
        <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-azure-300/70">
          {eventConfig.organization}
        </p>
        <h1 className="mt-2 font-display text-xl font-bold text-white">
          Admin Console
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Hanya untuk operator acara.
        </p>

        {!configured ? (
          <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            ADMIN_PASSWORD belum di-set di environment. Set dulu di{" "}
            <code>.env.local</code> atau di Vercel.
          </p>
        ) : null}

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password admin"
          autoComplete="current-password"
          className="mt-5 w-full rounded-xl border border-ink-500 bg-ink-900 px-4 py-3 text-sm text-white outline-none focus:border-azure-400/70"
        />

        {error ? (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-5 h-11 w-full rounded-xl bg-gold-400 text-sm font-bold text-ink-900 transition disabled:bg-ink-600 disabled:text-slate-500"
        >
          {busy ? "Masuk…" : "Masuk"}
        </button>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ConcernItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "ok"; at: string } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [resetState, setResetState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [copied, setCopied] = useState<"summary" | "categories" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/stats", { cache: "no-store" });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (response.ok) setStats((await response.json()) as Stats);
    } catch {
      /* transient — the next tick retries */
    }
  }, [onLogout]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats();
    const timer = setInterval(() => void loadStats(), 10_000);
    return () => clearInterval(timer);
  }, [loadStats]);

  function parse(text: string) {
    setRaw(text);
    setPublishState({ kind: "idle" });
    if (text.trim().length === 0) {
      setPreview(null);
      setParseError(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setPreview(null);
      setParseError("Bukan JSON yang valid. Pastikan Anda menyalin seluruh output AI, termasuk kurung kurawal.");
      return;
    }
    const result = validateAiResult(parsed);
    if (!result.ok) {
      setPreview(null);
      setParseError(result.error);
      return;
    }
    setParseError(null);
    setPreview(result.value.concerns);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    parse(await file.text());
    event.target.value = "";
  }

  async function publish() {
    if (!preview) return;
    setPublishState({ kind: "busy" });
    try {
      const response = await fetch("/api/admin/top3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concerns: preview }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setPublishState({
          kind: "error",
          message: payload?.error ?? "Gagal mempublikasikan.",
        });
        return;
      }
      setPublishState({ kind: "ok", at: payload.updatedAt });
      void loadStats();
    } catch {
      setPublishState({ kind: "error", message: "Koneksi bermasalah." });
    }
  }

  async function copyPrompt(prompt: string, which: "summary" | "categories") {
    try {
      const response = await fetch("/api/admin/export", { cache: "no-store" });
      const json = await response.text();
      await navigator.clipboard.writeText(prompt + json);
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    onLogout();
  }

  async function resetAll() {
    const confirmed = window.confirm(
      "Yakin hapus SEMUA feedback dan ringkasan AI yang sedang tayang di layar? Tindakan ini tidak bisa dibatalkan.",
    );
    if (!confirmed) return;

    setResetState({ kind: "busy" });
    try {
      const response = await fetch("/api/admin/reset", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setResetState({ kind: "error", message: payload?.error ?? "Gagal mereset data." });
        return;
      }
      setResetState({ kind: "ok" });
      setRaw("");
      setPreview(null);
      setParseError(null);
      setPublishState({ kind: "idle" });
      void loadStats();
    } catch {
      setResetState({ kind: "error", message: "Koneksi bermasalah." });
    }
  }

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.28em] text-azure-300/70">
            {eventConfig.name}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">
            Anniversary Feedback — Admin
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/display"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-azure-400/50"
          >
            Buka /display ↗
          </a>
          <a
            href="/qr"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-azure-400/50"
          >
            QR ↗
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-red-400/50 hover:text-red-300"
          >
            Keluar
          </button>
        </div>
      </header>

      {stats?.demoMode ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <strong>DEMO MODE</strong> — Supabase belum dikonfigurasi, data
          disimpan di memori server dan akan hilang saat restart. Isi{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> untuk mode produksi.
        </p>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total Responses"
          value={stats ? stats.totalResponses.toLocaleString("id-ID") : "…"}
        />
        <StatCard
          label="Last AI Update"
          value={
            stats?.lastAiUpdate
              ? new Date(stats.lastAiUpdate).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
        />
        <StatCard
          label="Status"
          value={stats?.demoMode ? "DEMO" : "LIVE"}
          accent={stats?.demoMode ? "text-amber-300" : "text-emerald-300"}
        />
      </section>

      {/* Step 1 — export */}
      <Panel step="1" title="Export feedback mentah">
        <p className="text-xs leading-relaxed text-slate-400">
          Unduh seluruh feedback sebagai JSON, atau salin langsung prompt +
          data ke clipboard untuk ditempel ke ChatGPT / Gemini.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/api/admin/export"
            className="rounded-xl bg-azure-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-azure-400"
          >
            Export JSON
          </a>
          <button
            type="button"
            onClick={() => copyPrompt(AI_PROMPT, "summary")}
            className="rounded-xl border border-ink-500 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-azure-400/60"
          >
            {copied === "summary" ? "Tersalin ✓" : "Salin prompt + data"}
          </button>
          <button
            type="button"
            onClick={() => copyPrompt(CATEGORY_PROMPT, "categories")}
            className="rounded-xl border border-ink-500 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-azure-400/60"
          >
            {copied === "categories" ? "Tersalin ✓" : "Salin prompt review kategori"}
          </button>
        </div>
      </Panel>

      {/* Step 2 — import */}
      <Panel step="2" title="Import hasil AI">
        <p className="text-xs leading-relaxed text-slate-400">
          Tempel JSON hasil sintesis AI di bawah, atau unggah file{" "}
          <code>.json</code>. JSON divalidasi sebelum bisa dipublikasikan.
        </p>

        <textarea
          value={raw}
          onChange={(event) => parse(event.target.value)}
          rows={7}
          spellCheck={false}
          placeholder='{ "A": { "top": [ … ], "insight": { … }, "pro": { … }, "con": { … } }, "B": { … } }'
          className="mt-4 w-full rounded-xl border border-ink-500 bg-ink-900 p-4 font-mono text-xs leading-relaxed text-slate-200 outline-none focus:border-azure-400/70"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-xl border border-ink-500 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-azure-400/60"
          >
            Upload AI Result (.json)
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="hidden"
          />
          {raw ? (
            <button
              type="button"
              onClick={() => parse("")}
              className="rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-300"
            >
              Bersihkan
            </button>
          ) : null}
        </div>

        {parseError ? (
          <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {parseError}
          </p>
        ) : null}
      </Panel>

      {/* Step 3 — preview + publish */}
      <Panel step="3" title="Preview & update display">
        {preview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {preview.map((item) => (
                <div
                  key={item.rank}
                  className="rounded-xl border border-ink-500 bg-ink-800/70 p-4"
                >
                  <p className="text-[0.6rem] font-bold tracking-[0.24em] text-gold-400">
                    {slotLabel(item.rank)}
                  </p>
                  <p className="mt-2 font-display text-sm font-bold text-white">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[0.7rem] font-semibold text-azure-300/80">
                    {item.count} responses
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {item.summary}
                  </p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={publish}
              disabled={publishState.kind === "busy" || stats?.canPublish === false}
              className="mt-4 rounded-xl bg-gold-400 px-5 py-3 text-xs font-bold text-ink-900 transition hover:bg-gold-300 disabled:bg-ink-600 disabled:text-slate-500"
            >
              {publishState.kind === "busy" ? "Mengirim…" : "Update Display"}
            </button>

            {stats?.canPublish === false ? (
              <p className="mt-3 text-xs text-amber-300">
                SUPABASE_SERVICE_ROLE_KEY belum di-set di server, jadi ringkasan AI
                belum bisa dipublikasikan.
              </p>
            ) : null}

            {publishState.kind === "ok" ? (
              <p className="mt-3 text-xs text-emerald-300">
                Berhasil. Layar besar sudah diperbarui pada{" "}
                {new Date(publishState.at).toLocaleTimeString("id-ID")}.
              </p>
            ) : null}
            {publishState.kind === "error" ? (
              <p className="mt-3 text-xs text-red-300">{publishState.message}</p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-slate-500">
            Belum ada JSON valid untuk di-preview.
          </p>
        )}

        {stats && stats.concerns.length > 0 ? (
          <div className="mt-6 border-t border-ink-600 pt-4">
            <p className="text-[0.6rem] font-bold tracking-[0.24em] text-slate-500">
              SEDANG TAYANG DI LAYAR
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              {stats.concerns.map((item) => (
                <li key={item.rank}>
                  <span className="text-slate-200">{slotLabel(item.rank)} · {item.title}</span>{" "}
                  · {item.count} responses
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      {/* Danger zone — clears trial-and-error data between test runs, or
          right before the real event so the audience screen starts empty. */}
      <section className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5 sm:p-6">
        <h2 className="flex items-center gap-3 font-display text-sm font-bold text-red-300">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-[0.65rem] font-bold text-red-300">
            !
          </span>
          Reset data
        </h2>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Menghapus semua feedback yang masuk dan ringkasan AI yang sedang tayang.
          Pakai ini di antara sesi uji coba, atau tepat sebelum acara mulai
          supaya layar dan hitungan mulai dari nol.{" "}
          <strong className="text-red-300">Tidak bisa dibatalkan.</strong>
        </p>
        <button
          type="button"
          onClick={resetAll}
          disabled={resetState.kind === "busy"}
          className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetState.kind === "busy" ? "Menghapus…" : "Reset Semua Data"}
        </button>
        {resetState.kind === "ok" ? (
          <p className="mt-3 text-xs text-emerald-300">
            Semua data berhasil dihapus.
          </p>
        ) : null}
        {resetState.kind === "error" ? (
          <p className="mt-3 text-xs text-red-300">{resetState.message}</p>
        ) : null}
      </section>
    </Shell>
  );
}

function StatCard({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-500 bg-ink-800/70 px-4 py-4">
      <p className="text-[0.6rem] font-bold tracking-[0.22em] text-slate-500">
        {label.toUpperCase()}
      </p>
      <p className={`mt-2 font-display text-2xl font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}

function Panel({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-ink-500 bg-ink-800/50 p-5 sm:p-6">
      <h2 className="flex items-center gap-3 font-display text-sm font-bold text-white">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-azure-500/20 text-[0.65rem] font-bold text-azure-300">
          {step}
        </span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** "A · INSIGHT" style label for a summary slot in the admin preview. */
function slotLabel(rank: number) {
  const { option, kind } = slotOf(rank);
  return `${option} · ${kind.toUpperCase()}`;
}
