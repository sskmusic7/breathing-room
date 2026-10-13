"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DemoTag, KettleIllustration, TopBar, gbp } from "../components/ui";
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

  if (result && Number(result.surplus_for_creditors) <= 0) {
    // C2b: warm and calm, nothing in red; the call is the primary action.
    return (
      <div className="wrap">
        <TopBar onBack={() => setResult(null)} />
        <KettleIllustration />
        <h1 className="h2 text-[24px]">Right now, there isn&apos;t money left over</h1>
        <p className="text-[15px] leading-[1.45] text-muted">
          <b className="text-ink">That&apos;s not your fault</b>, and it doesn&apos;t mean you&apos;re stuck. Free advisers can
          pause interest and collections, often through the Breathing Space scheme.
        </p>
        <div className="mt-auto flex flex-col gap-2.5">
          <a href="tel:08088084000" className="btn">
            Call National Debtline
            <br />
            <span className="font-normal text-[13px]">0808 808 4000 · free</span>
          </a>
          <a href="https://www.citizensadvice.org.uk/debt-and-money/" target="_blank" rel="noopener noreferrer" className="btn-ghost">
            Citizens Advice
          </a>
          <a
            href="https://www.gov.uk/government/publications/debt-respite-scheme-breathing-space-guidance/debt-respite-scheme-breathing-space-guidance-for-the-public"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            What is Breathing Space?
          </a>
          <button type="button" className="btn-link" onClick={() => setResult(null)}>
            Change my numbers
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    // C2: protected money is the hero; the creditor sum comes second.
    const protectedGbp = Number(result.total_outgoings) + Number(result.savings_buffer);
    return (
      <div className="wrap">
        <TopBar onBack={() => setResult(null)} />
        <h1 className="h2">Your plan</h1>
        <div className="safe-card flex flex-col gap-1">
          <span className="text-[13px] font-bold">Protected every month</span>
          <span className="font-serif text-[40px] leading-none">{gbp(protectedGbp)}</span>
          <span className="text-[13px] font-semibold">rent, bills, food and a {gbp(result.savings_buffer)} buffer</span>
        </div>
        <div className="card flex flex-col gap-2">
          <div className="row"><span>Money in</span><span>{gbp(result.total_income)}</span></div>
          <div className="row"><span>Living costs</span><span>− {gbp(result.total_outgoings)}</span></div>
          <div className="row"><span>Safety buffer</span><span>− {gbp(result.savings_buffer)}</span></div>
          <div className="h-px bg-line" />
          <div className="row"><span>For creditors</span><span className="font-bold">{gbp(result.surplus_for_creditors)} / mo</span></div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Split fairly</span>
          {result.allocations.map((a) => (
            <div key={a.creditor_id} className="row">
              <span>
                {a.name}{" "}
                {a.category === "priority" && (
                  <span className="text-[11px] font-bold bg-butter text-ink px-1.5 py-0.5 rounded-[5px]">priority</span>
                )}
              </span>
              <span>{gbp(a.pragmatic_offer)}</span>
            </div>
          ))}
        </div>
        {result.is_token_payment_territory && (
          <p className="text-[13px] leading-[1.45] text-muted">
            Money is tight, so small token payments to non-priority creditors may be fair under the MaPS guidance. An adviser
            can confirm this with your creditors.
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2">
          <Link href="/sweep" className="btn">
            Make it automatic
          </Link>
          <button type="button" className="btn-link" onClick={() => setResult(null)}>
            Change my numbers
          </button>
          <DemoTag />
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <TopBar back="/" />
      <h1 className="h2">What comes in, what goes out</h1>
      <p className="text-[15px] leading-[1.45] text-muted -mt-2">
        We use the Standard Financial Statement, the same method UK debt charities use. For regulated advice, National Debtline,
        StepChange and Citizens Advice are free.
      </p>

      <section className="card flex flex-col gap-2.5">
        <h2 className="font-semibold text-[15px]">Don&apos;t know your numbers?</h2>
        <p className="text-[13px] leading-[1.45] text-muted -mt-1">
          We can fill this in from your last 3 months of bank transactions, averaged per month. Read-only, through TrueLayer (FCA
          authorised). You can change anything after.
        </p>
        {!user ? (
          <button type="button" onClick={() => login()} className="btn">
            Fill from my bank
          </button>
        ) : !wallet ? (
          <p className="text-sm text-muted">Setting up your account…</p>
        ) : !bankConnected ? (
          <a href={bankConnectUrl(wallet, "sfs")} className="btn">
            Connect my bank
          </a>
        ) : (
          <button type="button" onClick={fillFromBank} disabled={autoState === "loading"} className="btn">
            {autoState === "loading" ? "Reading your bank…" : "Fill from my bank"}
          </button>
        )}
        {autoState === "filled" && (
          <p className="text-[13px] font-semibold text-safe">Filled from your bank (monthly average). Check the numbers look right.</p>
        )}
        {autoState === "error" && <p className="error">Couldn&apos;t read your bank just now. You can type the numbers instead.</p>}
      </section>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <section className="card flex flex-col gap-3">
          <h2 className="label-caps">Money in · per month</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Wages" value={employmentIncome} onChange={setEmploymentIncome} />
            <Field label="Benefits" value={benefitsIncome} onChange={setBenefitsIncome} />
            <Field label="Other income" value={otherIncome} onChange={setOtherIncome} />
            <Field label="Deductions" value={deductions} onChange={setDeductions} />
          </div>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="label-caps">Living costs · per month</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rent and bills" value={fixedCosts} onChange={setFixedCosts} />
            <Field label="Food and everyday" value={flexibleCosts} onChange={setFlexibleCosts} />
          </div>
          <label className="field">
            Safety buffer (£5 to £25)
            <input
              type="number"
              min={5}
              max={25}
              value={savingsBuffer}
              onChange={(e) => setSavingsBuffer(e.target.value)}
              className="input w-28"
            />
          </label>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="label-caps">Who you owe</h2>
          {creditors.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="grid grid-cols-5 gap-2">
                <input
                  placeholder="Who (e.g. Lambeth PCN)"
                  value={c.name}
                  onChange={(e) => updateCreditor(c.id, { name: e.target.value })}
                  className="input col-span-3"
                />
                <input
                  placeholder="Owed £"
                  type="number"
                  value={c.balance}
                  onChange={(e) => updateCreditor(c.id, { balance: e.target.value })}
                  className="input col-span-2"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <button
                  type="button"
                  className="chip text-[13px] px-3 py-1.5"
                  aria-pressed={c.category === "priority"}
                  onClick={() => updateCreditor(c.id, { category: c.category === "priority" ? "non_priority" : "priority" })}
                >
                  Priority (council tax, rent, energy)
                </button>
                <button
                  type="button"
                  className="chip text-[13px] px-3 py-1.5"
                  aria-pressed={c.is_ccj}
                  onClick={() => updateCreditor(c.id, { is_ccj: !c.is_ccj })}
                >
                  Court judgment (CCJ)
                </button>
              </div>
              {c.category === "priority" && (
                <input
                  placeholder="Agreed monthly payment £ (if any)"
                  type="number"
                  value={c.priority_token_offer}
                  onChange={(e) => updateCreditor(c.id, { priority_token_offer: e.target.value })}
                  className="input"
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCreditors((rows) => [...rows, emptyCreditor()])}
            className="self-start text-sm font-semibold underline underline-offset-[3px]"
          >
            + Add another
          </button>
        </section>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading} className="btn">
          {loading ? "Working it out…" : "See my plan"}
        </button>
      </form>
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
    <label className="field">
      {label}
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}
