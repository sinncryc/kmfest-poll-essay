/**
 * Single source of truth for event branding and the two questions the
 * audience answers. Change these values (or the matching NEXT_PUBLIC_* env
 * vars) and every screen follows.
 *
 * Copy is English throughout, matching the approved Display / Participant
 * key visuals.
 */
export const eventConfig = {
  /** Small eyebrow line above the main title. */
  organization: process.env.NEXT_PUBLIC_EVENT_ORG ?? "ASTRA INTERNATIONAL",
  /** Main event name. */
  name: process.env.NEXT_PUBLIC_EVENT_NAME ?? "ASTRA KM FEST 2026",
  /** Short subtitle. */
  tagline: process.env.NEXT_PUBLIC_EVENT_TAGLINE ?? "Knowledge in Motion",

  /** The three-beat motto that closes both the participant and display screens. */
  motto: ["BE BRAVE", "BE RESPONSIBLE", "BE AI READY"] as const,

  /** Part 1: a two-way vote. Percentages of this drive the left display panel. */
  poll: {
    label: "POLL",
    question: "WHICH SIDE ARE YOU ON?",
    helper: "Choose the option that best represents your view.",
    footnoteTitle: "YOUR VOTE MATTERS",
    footnoteBody: "Help shape the conversation.",
    options: [
      {
        key: "A",
        title: "USE AI NOW",
        quote:
          "AI doesn't have to be perfect to be useful. Use it, verify it, improve it.",
      },
      {
        key: "B",
        title: "UNDERSTAND FIRST",
        quote:
          "AI can create value, but we need to understand its limitations before relying on it.",
      },
    ],
  },

  /** Part 2: one free-text concern. The AI clusters these into the top concerns. */
  essay: {
    label: "ESSAY",
    question: "WHAT WOULD MAKE YOU HESITATE?",
    prompt:
      process.env.NEXT_PUBLIC_EVENT_QUESTION ??
      "Regardless of which side you chose, what is ONE concern you would want addressed before using AI in this situation?",
    placeholder: "Type your answer here…",
    footnote: "Be honest, be thoughtful, be part of the bigger picture.",
    /** Shown under the submit button — no name or account is ever attached to an answer. */
    disclaimer: "This will be anonymous.",
  },

  /** Headings on the big screen. */
  display: {
    liveLabel: "LIVE RESULTS",
    concernsSubheading: "Top concerns from the audience",
    quotesHeading: "SOME OF YOUR ANSWERS",
    totalLabel: "TOTAL RESPONSES",
  },
} as const;

/**
 * Name of the visual/UX design language this app is built on, taken from the
 * ASTRA KM FEST 2026 key visual: the poster artwork itself is the stage, the
 * chrome (logos, title) floats free of it so it can be scaled per screen, and
 * live audience answers literally circle the edge of the display — knowledge,
 * in motion, around the room.
 */
export const designConcept = "Knowledge in Motion" as const;

/** Essay length limits. The mockup's counter reads "0/200". */
export const ESSAY_MIN_LENGTH = 10;
export const ESSAY_MAX_LENGTH = 200;

/** Valid poll option keys, derived so config stays the single source. */
export const POLL_KEYS = ["A", "B"] as const;
