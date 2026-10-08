import type { Metadata } from "next";
import Link from "next/link";

import SendNotification from "./components/SendNotification";
import { InstallPWA } from "./components/InstallPWA";

export const metadata: Metadata = {
  title: "Breathing Room",
};

const SCREENS = [
  {
    href: "/sfs",
    title: "Standard Financial Statement",
    description: "Work out your budget and a fair pro-rata split for your creditors.",
  },
  {
    href: "/appeal",
    title: "Draft a representation",
    description: "Draft a letter contesting a PCN, fine, or notice — grounded in UK statute.",
  },
  {
    href: "/sweep",
    title: "Payday sweep",
    description: "Your payday pays your creditors automatically, after your essentials are protected.",
  },
] as const;

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-800 dark:text-slate-100">
              Breathing Room
            </h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Debts managed, on autopilot.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-12">
          {SCREENS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="block rounded-lg bg-white dark:bg-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{s.title}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{s.description}</p>
            </Link>
          ))}
        </div>

        <div className="space-y-8">
          <SendNotification />
        </div>
      </div>
      <InstallPWA />
    </div>
  );
}
