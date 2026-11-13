import { HeroCopy } from "@/components/hero-copy";

type Props = {
  /** Visual field only (no copy). Used under WebGL during crossfade. */
  fieldOnly?: boolean;
};

/** Instant CSS hero field — ambient background for the stacked hero layout. */
export function HeroLite({ fieldOnly = false }: Props) {
  if (fieldOnly) {
    return (
      <div className="hero-shell absolute inset-0" aria-hidden>
        <div className="hero-iso absolute inset-0" />
        <div className="hero-iso-glow absolute inset-0" />
      </div>
    );
  }

  return (
    <section className="hero-shell relative w-full overflow-hidden" aria-label="Applicable">
      <div className="hero-iso absolute inset-0" aria-hidden />
      <div className="hero-iso-glow absolute inset-0" aria-hidden />
      <HeroCopy />
    </section>
  );
}
