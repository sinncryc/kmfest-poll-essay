/** The two-way vote. Stored on every feedback row. */
export type PollChoice = "A" | "B";

export type FeedbackRow = {
  id: number;
  message: string;
  poll_choice: PollChoice | null;
  created_at: string;
  is_visible: boolean;
};

/** Live tally of the poll, computed from the feedback table. */
export type PollResults = {
  a: number;
  b: number;
  total: number;
};

/**
 * One clustered theme from the audience's essay answers. Up to 5 of these
 * fill the display's right-hand panel; `count` is how many answers the AI
 * put in this theme, which the display renders as a percentage.
 */
export type ConcernItem = {
  rank: 1 | 2 | 3 | 4 | 5;
  title: string;
  count: number;
  summary: string;
};

export type AiResultPayload = {
  concerns: ConcernItem[];
};

export type DisplayState = {
  /** Most recent visible essay answers, newest first — feeds the border river. */
  feedback: { id: number; text: string; created_at: string }[];
  poll: PollResults;
  concerns: ConcernItem[];
  concernsUpdatedAt: string | null;
  totalResponses: number;
  /** true when Supabase env vars are missing and the in-memory demo store is used. */
  demoMode: boolean;
};

export type ExportPayload = {
  responses: {
    id: number;
    text: string;
    poll_choice: PollChoice | null;
    created_at: string;
  }[];
};
