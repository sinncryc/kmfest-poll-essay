import Image from "next/image";

/**
 * The three-mark lockup from the KM FEST 2026 key visual: ASTRA on the left,
 * "70 TAHUN ASTRA" in the middle, Satu Indonesia on the right.
 *
 * These used to be baked into the background artwork. They are separate
 * elements now so the display can render them small and pulled inward,
 * leaving the outer edge of the screen free for the live answer river to
 * circle without ever colliding with the branding. All three PNGs carry real
 * alpha, so they sit straight on the blue field; `.brand-mark`'s soft
 * drop-shadow keeps thin dark linework readable without a white chip.
 */
export default function EventLogos({
  className = "",
  size = "md",
}: {
  className?: string;
  /** sm = participant phone, md = default, lg = projector */
  size?: "sm" | "md" | "lg";
}) {
  const scale = size === "sm" ? 0.78 : size === "lg" ? 1.15 : 1;

  const astra = Math.round(132 * scale);
  const seventy = Math.round(46 * scale);
  const satu = Math.round(92 * scale);

  return (
    <div className={`flex w-full items-center justify-between gap-3 ${className}`}>
      <span className="brand-mark flex items-center">
        <Image
          src="/logos/astra-logo.png"
          alt="Astra International"
          width={astra}
          height={Math.round(astra / 3.54)}
          style={{ width: astra, height: "auto" }}
          priority
        />
      </span>

      <span className="brand-mark flex items-center">
        <Image
          src="/brand/logo-70.png"
          alt="70 Tahun Astra"
          width={Math.round(seventy * 1.1)}
          height={seventy}
          style={{ height: seventy, width: "auto" }}
          priority
        />
      </span>

      <span className="brand-mark flex items-center">
        <Image
          src="/logos/satu-indonesia-logo.png"
          alt="Satu Indonesia — Semangat Astra Terpadu Untuk Indonesia"
          width={satu}
          height={Math.round(satu / 2.04)}
          style={{ width: satu, height: "auto" }}
        />
      </span>
    </div>
  );
}
