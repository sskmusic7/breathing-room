"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Shared pieces of the "Kitchen Table" look (Jay's Phase 2 wireframes, 1a).

export function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="8" fill="#1F2340" />
      <path d="M7 15.5c2-3 4-3 6 0s4 3 6 0" stroke="#F3C64B" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M7 10.5c2-2 4-2 6 0s4 2 6 0" stroke="#D3EDDD" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <BrandMark />
      <span className="font-serif text-[15px] whitespace-nowrap">Breathing Room</span>
    </Link>
  );
}

/** Top bar: brand on hub screens, a back arrow inside a flow; Help on the right. */
export function TopBar({ back, onBack, helpLabel = "Help" }: { back?: string; onBack?: () => void; helpLabel?: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
      {back || onBack ? (
        <button
          type="button"
          aria-label="Back"
          onClick={() => (onBack ? onBack() : router.push(back!))}
          className="text-xl leading-none py-1 pr-3"
        >
          ←
        </button>
      ) : (
        <Brand />
      )}
      <HelpPill label={helpLabel} />
    </div>
  );
}

export function HelpPill({ label = "Help" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pill" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Talk to a real person">
        <p className="text-sm leading-[1.45] text-muted">
          These services are free, confidential and independent. They can talk you through your options and, if you
          need it, set up the government&apos;s Breathing Space scheme to pause interest and collections.
        </p>
        <a href="tel:08088084000" className="btn">
          Call National Debtline
          <br />
          <span className="font-normal text-[13px]">0808 808 4000 · free</span>
        </a>
        <a href="https://www.citizensadvice.org.uk/debt-and-money/" target="_blank" rel="noopener noreferrer" className="btn-ghost">
          Citizens Advice
        </a>
        <a href="https://www.stepchange.org/" target="_blank" rel="noopener noreferrer" className="btn-ghost">
          StepChange Debt Charity
        </a>
        <p className="text-[13px] leading-[1.45] text-muted">
          Feeling overwhelmed? Samaritans are there day or night on{" "}
          <a href="tel:116123" className="font-semibold text-ink underline underline-offset-[3px]">
            116 123
          </a>{" "}
          (free). If you&apos;re in danger, call 999.
        </p>
        <Link href="/terms" className="btn-link" onClick={() => setOpen(false)}>
          Key Facts, terms, privacy and complaints
        </Link>
      </Sheet>
    </>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[rgba(10,15,30,.38)]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-t-[22px] px-5 pt-3 pb-6 flex flex-col gap-3">
        <div className="w-10 h-1 rounded-sm bg-line self-center" />
        <div className="font-serif text-[22px] leading-[1.15]">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function DemoTag() {
  return <span className="demo-tag">DEMO · SANDBOX DATA</span>;
}

export const gbp = (n: number | string, dp = 0) =>
  Number(n || 0).toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: dp, maximumFractionDigits: dp });

/** A letter softly dissolving into open air (A1 landing). */
export function LetterIllustration() {
  return (
    <svg viewBox="0 0 320 170" className="w-full h-[170px] rounded-2xl bg-stripe/60" aria-hidden="true">
      <g transform="translate(70 40) rotate(-6)">
        <rect width="120" height="86" rx="8" fill="#FFFDF8" stroke="#1F2340" strokeWidth="2" />
        <path d="M0 8l60 44 60-44" fill="none" stroke="#1F2340" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <g fill="#F3C64B">
        <rect x="205" y="52" width="14" height="10" rx="2" transform="rotate(12 212 57)" />
        <rect x="232" y="38" width="10" height="8" rx="2" transform="rotate(-10 237 42)" />
        <rect x="256" y="58" width="8" height="6" rx="1.5" />
      </g>
      <g fill="#D3EDDD" stroke="#1B6440" strokeWidth="1">
        <rect x="214" y="86" width="12" height="9" rx="2" transform="rotate(-14 220 90)" />
        <rect x="246" y="98" width="9" height="7" rx="1.5" transform="rotate(8 250 101)" />
      </g>
      <g fill="#1F2340" opacity=".35">
        <circle cx="276" cy="44" r="3" />
        <circle cx="288" cy="78" r="2.5" />
        <circle cx="270" cy="112" r="2" />
        <circle cx="296" cy="56" r="1.5" />
      </g>
      <path d="M40 140c40-14 90-14 130 0s90 14 130 0" fill="none" stroke="#E5DCCB" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A kettle on, two mugs (C2b, not enough left). */
export function KettleIllustration({ animated = false }: { animated?: boolean }) {
  return (
    <svg viewBox="0 0 320 84" className="w-full h-[84px] rounded-2xl bg-stripe/60" aria-hidden="true">
      <g className={animated ? "steam" : undefined}>
        <path d="M118 22c-4-6 4-10 0-16M128 22c-4-6 4-10 0-16" stroke="#55586B" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".6" />
      </g>
      <path d="M100 74V42c0-10 8-16 22-16s22 6 22 16v32z" fill="#1F2340" />
      <path d="M144 48l14-8v8l-14 10" fill="#1F2340" />
      <path d="M108 30c0-8 28-8 28 0" stroke="#F3C64B" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="176" y="50" width="22" height="24" rx="4" fill="#F3C64B" />
      <path d="M198 56c8 0 8 12 0 12" stroke="#F3C64B" strokeWidth="3" fill="none" />
      <rect x="212" y="50" width="22" height="24" rx="4" fill="#D3EDDD" stroke="#1B6440" strokeWidth="1" />
      <path d="M234 56c8 0 8 12 0 12" stroke="#1B6440" strokeWidth="2" fill="none" />
      <path d="M70 76h180" stroke="#E5DCCB" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Persistent prototype warning (GRC pack Part 2 step 1, Terms clause 4). */
export function DemoBanner() {
  return (
    <div className="bg-ink text-white text-[12px] leading-[1.35] text-center px-4 py-1.5">
      Prototype · demo money only, no real payments ·{" "}
      <Link href="/terms#prototype" className="underline underline-offset-2">
        don&apos;t enter real details
      </Link>
    </div>
  );
}
