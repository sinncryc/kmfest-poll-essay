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

  /**
   * Part 1: a two-way vote framed as the "Rangga" scenario — full backstory
   * lives in the printed notebook at the venue, not in the app. `helper`
   * doubles as the small italic pointer to that notebook (`.kv-helper` in
   * globals.css is restyled italic/small for this copy).
   * Percentages of this drive the left display panel.
   */
  poll: {
    label: "POLL",
    question: "IF YOU ARE RANGGA, WHAT WOULD YOU DO?",
    helper: "(For the complete scenario, please refer to the notebook.)",
    footnoteTitle: "SHARE YOUR THOUGHTS",
    footnoteBody: "See what other people would choose — live on the big screen!",
    options: [
      {
        key: "A",
        title: "USE AI FIRST",
        quote:
          "He could use AI first, then check it and make it better. But once he sees AI's idea, he might not think of his own idea anymore.",
      },
      {
        key: "B",
        title: "THINK FIRST",
        quote:
          "Or he could think first, then use AI to test and improve his idea. But he might arrive at the 6 PM meeting with an idea that is not finished yet.",
      },
    ],
  },

  /** Part 2: the reasoning behind the poll choice. The AI clusters these into the top concerns. */
  essay: {
    label: "ESSAY",
    question: "WHAT'S YOUR REASONING?",
    prompt:
      process.env.NEXT_PUBLIC_EVENT_QUESTION ??
      "What's your reasoning behind that choice?",
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
