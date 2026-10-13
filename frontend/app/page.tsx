import type { Metadata } from "next";
import Link from "next/link";

import SendNotification from "./components/SendNotification";
import { InstallPWA } from "./components/InstallPWA";
import { LetterIllustration, TopBar } from "./components/ui";

export const metadata: Metadata = {
  title: "Breathing Room",
};

// A1 · Landing: within 3 seconds it says no pressure, it's free, and there's a real person.
export default function Page() {
  return (
    <div className="wrap">
      <TopBar helpLabel="Talk to us" />
      <h1 className="h1 text-[36px]">Don&apos;t pay yet.</h1>
      <p className="lead">Let&apos;s see what we can cancel, reduce, or pause.</p>
      <LetterIllustration />

      <div className="mt-auto flex flex-col gap-2.5">
        <Link href="/appeal" className="btn">
          Type in my letter
        </Link>
        <Link href="/sfs" className="btn-ghost">
          Sort out what I owe
        </Link>
        <button type="button" disabled className="btn-link no-underline text-muted font-medium">
          Scan a letter · soon
        </button>
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {["MaPS SFS method", "Open Banking"].map((t) => (
            <span key={t} className="text-[11px] font-bold text-muted border border-line rounded-md px-[7px] py-[3px]">
              {t}
            </span>
          ))}
        </div>
        <p className="text-center text-xs text-muted">Free · no account needed to start</p>
      </div>

      <details className="text-xs text-muted">
        <summary className="cursor-pointer text-center">Notifications</summary>
        <div className="mt-3">
          <SendNotification />
        </div>
      </details>
      <InstallPWA />
    </div>
  );
}
