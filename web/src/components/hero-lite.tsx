/** Instant CSS hero - no Three.js. Used on mobile / 3G / reduced motion. */
export function HeroLite() {
  return (
    <section
      className="hero-lite relative min-h-[52vh] w-full overflow-hidden sm:min-h-[62vh] lg:min-h-[72vh]"
      aria-label="Applicable"
    >
      <div className="hero-lite-grid absolute inset-0" aria-hidden />
      <div className="hero-lite-glow absolute inset-0" aria-hidden />
      <div className="relative z-[1] mx-auto flex min-h-[inherit] max-w-5xl flex-col justify-end px-5 pb-10 pt-24 sm:px-8 sm:pb-14">
        <p className="max-w-md text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
          Live remote tech jobs, checked for whether you can apply from India,
          with the line from the posting that proves it.
        </p>
      </div>
    </section>
  );
}
