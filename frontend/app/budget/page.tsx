"use client";

import Link from "next/link";
import { useState } from "react";

import { Card, ErrorBox, Field, PageShell, buttonClass, inputClass } from "../components/ui";
import { CreditorInput, SfsResult, calculateSfs, savePlan } from "../lib/api";

const money = (v: string) => `£${Number(v).toFixed(2)}`;

let nextId = 1;
const blankCreditor = (): CreditorInput => ({
  id: `c${nextId++}`,
  name: "",
  category: "non_priority",
  balance: "",
  priority_token_offer: null,
  is_ccj: false,
});

export default function BudgetPage() {
  const [income, setIncome] = useState({
    employment_income: "",
    benefits_income: "",
    other_income: "",
    deductions: "",
  });
  const [outgoings, setOutgoings] = useState({ fixed_costs: "", flexible_costs: "" });
  const [savingsBuffer, setSavingsBuffer] = useState("5.00");
  const [creditors, setCreditors] = useState<CreditorInput[]>([blankCreditor()]);
  const [result, setResult] = useState<SfsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Demo mode: the worked SFS example (£479.21 income, £6.23 for creditors).
  function loadDemo() {
    setIncome({ employment_income: "", benefits_income: "591.76", other_income: "", deductions: "112.55" });
    setOutgoings({ fixed_costs: "205.98", flexible_costs: "262.00" });
    setSavingsBuffer("5.00");
    setCreditors([
      { id: "hmrc", name: "HMRC Income Tax", category: "priority", balance: "1679.69", priority_token_offer: "1.00", is_ccj: false },
      { id: "aqua", name: "Aqua/NewDay (CCJ)", category: "non_priority", balance: "2834.00", priority_token_offer: null, is_ccj: true },
      { id: "halifax", name: "Halifax Overdraft", category: "non_priority", balance: "1096.23", priority_token_offer: null, is_ccj: false },
      { id: "paypal", name: "PayPal Loan", category: "non_priority", balance: "409.19", priority_token_offer: null, is_ccj: false },
      { id: "family", name: "Family / Personal", category: "non_priority", balance: "250.00", priority_token_offer: null, is_ccj: false },
      { id: "natwest", name: "NatWest Overdrafts", category: "non_priority", balance: "206.27", priority_token_offer: null, is_ccj: false },
    ]);
    setResult(null);
  }

  const updateCreditor = (id: string, patch: Partial<CreditorInput>) =>
    setCreditors((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const num = (v: string) => (v.trim() === "" ? "0" : v);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const plan = await calculateSfs({
        income: {
          employment_income: num(income.employment_income),
          benefits_income: num(income.benefits_income),
          other_income: num(income.other_income),
          deductions: num(income.deductions),
        },
        outgoings: {
          fixed_costs: num(outgoings.fixed_costs),
          flexible_costs: num(outgoings.flexible_costs),
        },
        creditors: creditors
          .filter((c) => c.name.trim())
          .map((c) => ({
            ...c,
            balance: num(c.balance),
            priority_token_offer:
              c.category === "priority" && c.priority_token_offer ? c.priority_token_offer : null,
          })),
        savings_buffer: savingsBuffer,
      });
      setResult(plan);
      savePlan(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const moneyInput = (value: string, onChange: (v: string) => void) => (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      placeholder="0.00"
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <PageShell
      title="Budget & payment plan"
      intro="Enter your monthly figures. We work out what you can afford using the Standard Financial Statement method, after protecting your essential living costs."
    >
      <button type="button" onClick={loadDemo} className="text-sm font-medium text-teal-700 hover:underline">
        Try it with example figures
      </button>
      <form onSubmit={submit} className="space-y-6">
        <Card title="Monthly income">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Wages / salary">
              {moneyInput(income.employment_income, (v) => setIncome({ ...income, employment_income: v }))}
            </Field>
            <Field label="Benefits (e.g. Universal Credit)">
              {moneyInput(income.benefits_income, (v) => setIncome({ ...income, benefits_income: v }))}
            </Field>
            <Field label="Other income">
              {moneyInput(income.other_income, (v) => setIncome({ ...income, other_income: v }))}
            </Field>
            <Field label="Deductions" hint="e.g. self-employed trading losses">
              {moneyInput(income.deductions, (v) => setIncome({ ...income, deductions: v }))}
            </Field>
          </div>
        </Card>

        <Card title="Monthly spending">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fixed costs" hint="Rent, council tax, energy, water">
              {moneyInput(outgoings.fixed_costs, (v) => setOutgoings({ ...outgoings, fixed_costs: v }))}
            </Field>
            <Field label="Flexible costs" hint="Food, housekeeping, phone, travel">
              {moneyInput(outgoings.flexible_costs, (v) => setOutgoings({ ...outgoings, flexible_costs: v }))}
            </Field>
            <Field label="Savings buffer" hint="£5–£25 a month, kept for emergencies">
              <input
                type="number"
                min="5"
                max="25"
                step="0.01"
                className={inputClass}
                value={savingsBuffer}
                onChange={(e) => setSavingsBuffer(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card title="Debts">
          <div className="space-y-4">
            {creditors.map((c) => (
              <div key={c.id} className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Who is it owed to?">
                    <input
                      className={inputClass}
                      placeholder="e.g. Camden Council PCN"
                      value={c.name}
                      onChange={(e) => updateCreditor(c.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Amount owed">
                    {moneyInput(c.balance, (v) => updateCreditor(c.id, { balance: v }))}
                  </Field>
                  <Field label="Type" hint="Priority debts (rent, council tax, energy) have serious consequences if unpaid">
                    <select
                      className={inputClass}
                      value={c.category}
                      onChange={(e) => updateCreditor(c.id, { category: e.target.value as CreditorInput["category"] })}
                    >
                      <option value="non_priority">Non-priority (cards, loans, catalogues)</option>
                      <option value="priority">Priority</option>
                    </select>
                  </Field>
                  {c.category === "priority" && (
                    <Field label="Fixed monthly offer">
                      {moneyInput(c.priority_token_offer ?? "", (v) => updateCreditor(c.id, { priority_token_offer: v }))}
                    </Field>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={c.is_ccj}
                      onChange={(e) => updateCreditor(c.id, { is_ccj: e.target.checked })}
                    />
                    This debt has a County Court Judgment (CCJ)
                  </label>
                  {creditors.length > 1 && (
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline"
                      onClick={() => setCreditors((cs) => cs.filter((x) => x.id !== c.id))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-sm font-medium text-teal-700 hover:underline"
              onClick={() => setCreditors((cs) => [...cs, blankCreditor()])}
            >
              + Add another debt
            </button>
          </div>
        </Card>

        <ErrorBox message={error} />
        <button type="submit" className={buttonClass} disabled={loading}>
          {loading ? "Calculating…" : "Calculate my plan"}
        </button>
      </form>

      {result && (
        <Card title="Your plan">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {[
              ["Income", result.total_income],
              ["Spending", result.total_outgoings],
              ["Left over", result.net_disposable_income],
              ["Savings buffer", result.savings_buffer],
              ["For creditors", result.surplus_for_creditors],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(value)}</dd>
              </div>
            ))}
          </dl>
          {result.is_token_payment_territory && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Your surplus is under £5 a month, so token payments (usually £1 per creditor) are the
              realistic offer. Consider speaking to a free debt adviser about a Breathing Space.
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Creditor</th>
                  <th className="py-2 pr-3 text-right">Owed</th>
                  <th className="py-2 pr-3 text-right">Share</th>
                  <th className="py-2 text-right">Monthly offer</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {result.allocations.map((a) => (
                  <tr key={a.creditor_id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="py-2 pr-3">
                      {a.name}
                      {a.category === "priority" && <span className="ml-2 text-xs text-teal-700">priority</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{money(a.balance)}</td>
                    <td className="py-2 pr-3 text-right">{Number(a.debt_share_pct).toFixed(1)}%</td>
                    <td className="py-2 text-right font-semibold">{money(a.pragmatic_offer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/sweep" className={`${buttonClass} mt-4 inline-block`}>
            Set up payday sweep →
          </Link>
        </Card>
      )}
    </PageShell>
  );
}
