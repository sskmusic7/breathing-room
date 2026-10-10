import type { Metadata } from "next";
import Link from "next/link";

import { InstallPWA } from "./components/InstallPWA";
import SendNotification from "./components/SendNotification";
import UseLoginPrivy from "./components/UseLoginPrivy";
import { PageShell } from "./components/ui";

export const metadata: Metadata = {
  title: "Home",
};

const ACTIONS = [
  { href: "/appeal", title: "Appeal a notice", body: "Scan a parking or penalty notice and get a draft appeal grounded in UK law." },
  { href: "/budget", title: "Budget & payment plan", body: "Work out a fair, affordable offer to your creditors after protecting your living costs." },
  { href: "/sweep", title: "Payday sweep", body: "Pay creditors automatically on payday, with your essentials ring-fenced first." },
];

export default function Page() {
  return (
    <PageShell title="Debts managed, on autopilot." intro="Breathing Room helps you understand your rights, challenge unfair penalties, and pay what you can afford — automatically.">
      <div className="grid gap-4 sm:grid-cols-3">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-600 dark:border-slate-700 dark:bg-slate-900"
          >
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{a.title}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{a.body}</p>
          </Link>
        ))}
      </div>
      <UseLoginPrivy />
      <SendNotification />
      <InstallPWA />
    </PageShell>
  );
}
