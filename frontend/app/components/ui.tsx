import Link from "next/link";

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export const buttonClass =
  "rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {title && <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {message}
    </p>
  );
}

export function PageShell({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <nav className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link href="/" className="font-bold text-teal-700">Breathing Room</Link>
          <Link href="/appeal" className="text-slate-600 hover:text-teal-700 dark:text-slate-300">Appeal a notice</Link>
          <Link href="/budget" className="text-slate-600 hover:text-teal-700 dark:text-slate-300">Budget &amp; plan</Link>
          <Link href="/sweep" className="text-slate-600 hover:text-teal-700 dark:text-slate-300">Payday sweep</Link>
        </div>
      </nav>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <header>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          {intro && <p className="mt-2 text-slate-600 dark:text-slate-400">{intro}</p>}
        </header>
        {children}
        <p className="pt-4 text-xs text-slate-500">
          Breathing Room provides legal information and software tools, not legal advice. You are
          responsible for reviewing and sending your own appeals.
        </p>
      </main>
    </div>
  );
}
