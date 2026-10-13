"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Universal bottom tab bar, same on every screen.
const TABS = [
  { href: "/", label: "Home", icon: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" },
  { href: "/appeal", label: "Letters", icon: "M4 6h16v12H4zM4 7l8 6 8-6" },
  { href: "/sfs", label: "My plan", icon: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/sweep", label: "Autopilot", icon: "M12 3v3M12 18v3M4.6 7.5l2.6 1.5M16.8 15l2.6 1.5M4.6 16.5l2.6-1.5M16.8 9l2.6-1.5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { href: "/proof", label: "Proof", icon: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="max-w-md mx-auto grid grid-cols-5">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold ${active ? "text-ink" : "text-muted"}`}
              >
                <span className={`grid place-items-center w-12 h-7 rounded-full ${active ? "bg-butter" : ""}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={t.icon} />
                  </svg>
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
