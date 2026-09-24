import { eventConfig } from "@/lib/event-config";
import { groupSummary, type OptionSummary } from "@/lib/summary-schema";
import type { ConcernItem, PollChoice, PollResults } from "@/lib/types";

const { poll: pollCopy, display: copy } = eventConfig;
const title = (key: PollChoice) => pollCopy.options.find((o) => o.key === key)?.title ?? key;

/**
 * The three glass boxes baked into the strip artwork, filled in: option A and
 * B on the left (share of the vote + 3 AI cards each), pros/cons and the
 * KM FEST statement on the right. Positions match the artwork in px.
 */
export default function SummaryBoxes({
  poll,
  concerns,
}: {
  poll: PollResults;
  concerns: ConcernItem[];
}) {
  const summary = groupSummary(concerns);
  const pctA = poll.total > 0 ? Math.round((poll.a / poll.total) * 100) : 0;
  const pctB = poll.total > 0 ? 100 - pctA : 0;

  return (
    <>
      <OptionBox option="A" pct={pctA} data={summary.A} />
      <OptionBox option="B" pct={pctB} data={summary.B} />

      <section className="side">
        <div className="side-cols">
          <SideColumn option="A" data={summary.A} />
          <SideColumn option="B" data={summary.B} />
        </div>
        <div className="kmfest">
          <p>
            <span className="kmfest-label">{copy.kmfestLabel}</span>
            {copy.kmfestLead} <span className="kmfest-a">{copy.kmfestA}</span>{" "}
            <span className="kmfest-b">{copy.kmfestB}</span> <em>{copy.kmfestClose}</em>
          </p>
        </div>
      </section>
    </>
  );
}

function OptionBox({
  option,
  pct,
  data,
}: {
  option: PollChoice;
  pct: number;
  data: OptionSummary;
}) {
  return (
    <section className={`opt opt-${option.toLowerCase()}`}>
      <div className="opt-head">
        <span className="opt-key">{option}</span>
        <h2 className="opt-title">{title(option)}</h2>
        <div className="opt-bar">
          <div className="opt-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="opt-pct">{pct}%</span>
      </div>
      <div className="opt-cards">
        {[0, 1, 2].map((i) => {
          const item = data.reasons[i];
          const insight = i === 2;
          return (
            <div key={i} className={`card ${insight ? "card-insight" : ""}`}>
              <div className="card-label">
                <span className="card-num">{i + 1}</span>
                {insight ? <Spark /> : null}
                <span>{item?.title ?? "—"}</span>
                {insight ? <span className="card-tag">{copy.insightTag}</span> : null}
              </div>
              <p className={`card-text ${item ? "" : "card-empty"}`}>
                {item?.summary ?? copy.waiting}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SideColumn({ option, data }: { option: PollChoice; data: OptionSummary }) {
  return (
    <div className={`side-col side-col-${option.toLowerCase()}`}>
      <div className="side-head">
        <span className="side-key">{option}</span>
        OPTION {option}: {title(option)}
      </div>
      <ProCon kind="pro" item={data.pro} />
      <ProCon kind="con" item={data.con} />
    </div>
  );
}

function ProCon({ kind, item }: { kind: "pro" | "con"; item: ConcernItem | null }) {
  return (
    <div className={`pc pc-${kind}`}>
      <span className="pc-sign" aria-label={kind === "pro" ? "Plus" : "Minus"}>
        {kind === "pro" ? "+" : "−"}
      </span>
      <div className="pc-body">
        <div className="pc-label">{item?.title ?? (kind === "pro" ? "Plus" : "Minus")}</div>
        <p className={`pc-text ${item ? "" : "card-empty"}`}>{item?.summary ?? copy.waiting}</p>
      </div>
    </div>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path d="M8 0l1.8 6.2L16 8l-6.2 1.8L8 16l-1.8-6.2L0 8l6.2-1.8z" fill="currentColor" />
    </svg>
  );
}
