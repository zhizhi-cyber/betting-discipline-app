"use client";

/**
 * Ambient gradient orbs rendered behind all content.
 * Provides the "透出来" base for frosted-glass cards.
 * Fixed position, pointer-events-none, very low opacity —
 * reads as a subtle haze, not a graphic element.
 */
export default function BackgroundOrbs() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
    >
      {/* Top-left red orb (profit-tinted) */}
      <div
        className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(224,53,53,0.22), transparent 75%)" }}
      />
      {/* Top-right violet orb */}
      <div
        className="absolute -top-40 -right-32 w-[380px] h-[380px] rounded-full blur-[110px]"
        style={{ background: "radial-gradient(closest-side, rgba(128,95,200,0.18), transparent 75%)" }}
      />
      {/* Mid-bottom subtle blue */}
      <div
        className="absolute bottom-1/4 -left-16 w-[340px] h-[340px] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(80,120,200,0.14), transparent 75%)" }}
      />
      {/* Bottom-right teal */}
      <div
        className="absolute -bottom-24 -right-24 w-[360px] h-[360px] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(60,130,120,0.16), transparent 75%)" }}
      />
    </div>
  );
}
