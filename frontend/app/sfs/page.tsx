"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLogin, usePrivy, type WalletWithMetadata } from "@privy-io/react-auth";
import {
  bankConnectUrl,
  calculateSfs,
  getBankStatus,
  getBankSummary,
  SFS_RESULT_STORAGE_KEY,
  type Creditor,
  type DebtCategory,
  type SfsResult,
} from "../lib/api";

interface CreditorRow {
  id: string;
  name: string;
  category: DebtCategory;
  balance: string;
  priority_token_offer: string;
  is_ccj: boolean;
}

function emptyCreditor(): CreditorRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    category: "non_priority",
    balance: "",
    priority_token_offer: "",
    is_ccj: false,
  };
}

export default function SfsPage() {
  const [employmentIncome, setEmploymentIncome] = useState("");
  const [benefitsIncome, setBenefitsIncome] = useState("");
  const [otherIncome, setOtherIncome] = useState("");
  const [deductions, setDeductions] = useState("");
  const [fixedCosts, setFixedCosts] = useState("");
  const [flexibleCosts, setFlexibleCosts] = useState("");
  const [savingsBuffer, setSavingsBuffer] = useState("5");
  const [creditors, setCreditors] = useState<CreditorRow[]>([emptyCreditor()]);

  const [result, setResult] = useState<SfsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto SFS: fill income/outgoings from the user's real bank transactions
  // (TrueLayer Data API, read-only) instead of asking them to know the numbers.
  const { user } = usePrivy();
  const { login } = useLogin();
  const wallet = useMemo(() => {
    const embedded = user?.linkedAccounts.find(
      (a) => a.type === "wallet" && a.walletClientType === "privy"
    ) as WalletWithMetadata | undefined;
    return embedded?.address;
  }, [user]);
  const [bankConnected, setBankConnected] = useState(false);
  const [autoState, setAutoState] = useState<"idle" | "loading" | "filled" | "error">("idle");

  useEffect(() => {
    if (!wallet) return;
    getBankStatus(wallet)
      .then((s) => setBankConnected(s.bank_connected))
      .catch(() => {});
  }, [wallet]);

  async function fillFromBank() {
    if (!wallet) return;
    setAutoState("loading");
    try {
      const summary = await getBankSummary(wallet);
      setEmploymentIncome(String(summary.employment));
      setFixedCosts(String(summary.fixed_costs));
      setFlexibleCosts(String(summary.flexible_costs));
      setAutoState("filled");
    } catch {
      setAutoState("error");
    }
  }

  function updateCreditor(id: string, patch: Partial<CreditorRow>) {
    setCreditors((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        income: {
          employment_income: Number(employmentIncome || 0),
          benefits_income: Number(benefitsIncome || 0),
          other_income: Number(otherIncome || 0),
          deductions: Number(deductions || 0),
        },
        outgoings: {
          fixed_costs: Number(fixedCosts || 0),
          flexible_costs: Number(flexibleCosts || 0),
        },
        creditors: creditors
          .filter((c) => c.name.trim() && c.balance.trim())
          .map(
            (c): Creditor => ({
              id: c.id,
              name: c.name,
              category: c.category,
              balance: Number(c.balance),
              priority_token_offer: c.priority_token_offer ? Number(c.priority_token_offer) : null,
              is_ccj: c.is_ccj,
            })
          ),
        savings_buffer: Number(savingsBuffer || 5),
      };
      const sfsResult = await calculateSfs(payload);
      setResult(sfsResult);
      sessionStorage.setItem(SFS_RESULT_STORAGE_KEY, JSON.stringify(sfsResult));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Home
        </Link>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-2 mb-2">
          Standard Financial Statement
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          This tool provides standard SFS calculations. For formal, regulated debt
          advice, contact National Debtline, StepChange, or Citizens Advice.
        </p>

        <section className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200">Don&apos;t know your numbers?</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Let us fill this in from your last 3 months of bank transactions, averaged per month. Read-only, through TrueLayer (FCA authorised).
            You can change anything after.
          </p>
          {!user ? (
            <button type="button" onClick={() => login()} className="rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold">
              Fill from my bank
            </button>
          ) : !wallet ? (
            <p className="text-sm text-slate-400">Setting up your account…</p>
          ) : !bankConnected ? (
            <a href={bankConnectUrl(wallet, "sfs")} className="inline-block rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold">
              Connect my bank
            </a>
          ) : (
            <button
              type="button"
              onClick={fillFromBank}
              disabled={autoState === "loading"}
              className="rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold disabled:opacity-50"
            >
              {autoState === "loading" ? "Reading your bank…" : "Fill from my bank"}
            </button>
          )}
          {autoState === "filled" && (
            <p className="mt-2 text-xs text-green-700 dark:text-green-400">
              Filled from your bank (monthly average). Check the numbers below look right.
            </p>
          )}
          {autoState === "error" && (
            <p className="mt-2 text-xs text-red-600">Couldn&apos;t read your bank just now. You can type the numbers instead.</p>
          )}
        </section>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">Income (£/month)</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Employment" value={employmentIncome} onChange={setEmploymentIncome} />
              <Field label="Benefits" value={benefitsIncome} onChange={setBenefitsIncome} />
              <Field label="Other income" value={otherIncome} onChange={setOtherIncome} />
              <Field label="Deductions" value={deductions} onChange={setDeductions} />
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">Outgoings (£/month)</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fixed costs" value={fixedCosts} onChange={setFixedCosts} />
              <Field label="Flexible costs" value={flexibleCosts} onChange={setFlexibleCosts} />
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">
              Savings buffer (£5–£25/month)
            </h2>
            <input
              type="number"
              min={5}
              max={25}
              value={savingsBuffer}
              onChange={(e) => setSavingsBuffer(e.target.value)}
              className="w-32 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
            />
          </section>

          <section className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">Creditors</h2>
              <button
                type="button"
                onClick={() => setCreditors((rows) => [...rows, emptyCreditor()])}
                className="text-sm text-blue-600 hover:underline"
              >
                + Add creditor
              </button>
            </div>
            {creditors.map((c) => (
              <div key={c.id} className="grid grid-cols-12 gap-2 items-center">
                <input
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => updateCreditor(c.id, { name: e.target.value })}
                  className="col-span-4 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                />
                <select
                  value={c.category}
                  onChange={(e) => updateCreditor(c.id, { category: e.target.value as DebtCategory })}
                  className="col-span-3 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                >
                  <option value="non_priority">Non-priority</option>
                  <option value="priority">Priority</option>
                </select>
                <input
                  placeholder="Balance £"
                  type="number"
                  value={c.balance}
                  onChange={(e) => updateCreditor(c.id, { balance: e.target.value })}
                  className="col-span-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                />
                <input
                  placeholder="Token offer £"
                  type="number"
                  value={c.priority_token_offer}
                  onChange={(e) => updateCreditor(c.id, { priority_token_offer: e.target.value })}
                  className="col-span-2 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                />
                <label className="col-span-1 flex items-center gap-1 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={c.is_ccj}
                    onChange={(e) => updateCreditor(c.id, { is_ccj: e.target.checked })}
                  />
                  CCJ
                </label>
              </div>
            ))}
          </section>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 py-3 font-semibold disabled:opacity-50"
          >
            {loading ? "Calculating…" : "Calculate my SFS"}
          </button>
        </form>

        {result && (
          <section className="mt-8 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">Result</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Total income: £{result.total_income}</div>
              <div>Total outgoings: £{result.total_outgoings}</div>
              <div>Net disposable income: £{result.net_disposable_income}</div>
              <div>Savings buffer: £{result.savings_buffer}</div>
              <div className="col-span-2 font-semibold">
                Surplus available for creditors: £{result.surplus_for_creditors}
              </div>
            </div>
            {Number(result.surplus_for_creditors) <= 0 && (
              <div className="text-sm bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded p-3 space-y-1">
                <p className="font-semibold text-red-800 dark:text-red-200">
                  Your essentials use up all your income right now. That&apos;s not your fault, and there are options.
                </p>
                <p className="text-red-700 dark:text-red-300">
                  Talk to a free adviser today: National Debtline 0808 808 4000, or Citizens Advice. Ask about
                  Breathing Space, which can pause most creditor action, interest and charges for 60 days.
                </p>
              </div>
            )}
            {result.is_token_payment_territory && (
              <p className="text-amber-600 text-sm bg-amber-50 dark:bg-amber-950 rounded p-2">
                Your disposable income is low enough that token (nominal) payments to
                non-priority creditors may apply under MaPS SFS guidance.
              </p>
            )}
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-slate-500">
                  <th>Creditor</th>
                  <th>Share %</th>
                  <th>Suggested payment</th>
                </tr>
              </thead>
              <tbody>
                {result.allocations.map((a) => (
                  <tr key={a.creditor_id} className="border-t border-slate-100 dark:border-slate-700">
                    <td>{a.name}</td>
                    <td>{a.debt_share_pct}%</td>
                    <td>£{a.pragmatic_offer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Number(result.surplus_for_creditors) > 0 && (
              <Link
                href="/sweep"
                className="inline-block mt-2 text-blue-600 hover:underline text-sm font-semibold"
              >
                Put this plan on autopilot →
              </Link>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm text-slate-600 dark:text-slate-300">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
      />
    </label>
  );
}
