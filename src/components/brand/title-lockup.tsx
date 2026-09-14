import Image from "next/image";
import { eventConfig } from "@/lib/event-config";

/**
 * "ASTRA KM FEST 2026 / KNOWLEDGE IN MOTION", lifted out of the key visual
 * as a transparent PNG rather than re-set in a web font — the approved
 * typography and its glow survive exactly, while the element itself is free
 * to scale with the viewport (`width` is given in vw/%, height follows).
 *
 * Rendered as an image but still announced to assistive tech through `alt`.
 */
export default function TitleLockup({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/title-lockup.png"
      alt={`${eventConfig.name} — ${eventConfig.tagline}`}
      width={615}
      height={120}
      priority
      className={`h-auto w-full object-contain ${className}`}
    />
  );
}
