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
  getMe,
  readLetterCreditors,
  saveMeSfs,
  writeLocalSfs,
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
  const [formStep, setFormStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto SFS: fill income/outgoings from the user's real bank transactions
  // (TrueLayer Data API, read-only) instead of asking them to know the numbers.
  const { user, getAccessToken } = usePrivy();
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

  // Keep the figures on this device too, so going back never empties the form.
  const LOCAL_INPUTS_KEY = "breathing-room:sfs-inputs";
  const [localLoaded, setLocalLoaded] = useState(false);
  useEffect(() => {
    try {
      const i = JSON.parse(localStorage.getItem(LOCAL_INPUTS_KEY) || "null");
      if (i) {
        setEmploymentIncome(i.employmentIncome ?? "");
        setBenefitsIncome(i.benefitsIncome ?? "");
        setOtherIncome(i.otherIncome ?? "");
        setDeductions(i.deductions ?? "");
        setFixedCosts(i.fixedCosts ?? "");
        setFlexibleCosts(i.flexibleCosts ?? "");
        setSavingsBuffer(i.savingsBuffer ?? "5");
        if (i.creditors?.length) setCreditors(i.creditors);
      }
    } catch {}
    setLocalLoaded(true);
  }, []);
  useEffect(() => {
    if (!localLoaded) return;
    try {
      localStorage.setItem(
        LOCAL_INPUTS_KEY,
        JSON.stringify({ employmentIncome, benefitsIncome, otherIncome, deductions, fixedCosts, flexibleCosts, savingsBuffer, creditors })
      );
    } catch {}
  }, [localLoaded, employmentIncome, benefitsIncome, otherIncome, deductions, fixedCosts, flexibleCosts, savingsBuffer, creditors]);

  // Bring back this person's saved budget when they log in (any device).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!user || restored) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const me = await getMe(token).catch(() => null);
      setRestored(true);
      const saved = me?.sfs;
      if (!saved) return;
      const i = saved.inputs as Record<string, string> & { creditors?: CreditorRow[] };
      setEmploymentIncome(i.employmentIncome ?? "");
      setBenefitsIncome(i.benefitsIncome ?? "");
      setOtherIncome(i.otherIncome ?? "");
      setDeductions(i.deductions ?? "");
      setFixedCosts(i.fixedCosts ?? "");
      setFlexibleCosts(i.flexibleCosts ?? "");
      setSavingsBuffer(i.savingsBuffer ?? "5");
      if (i.creditors?.length) setCreditors(i.creditors);
      if (saved.result) {
        setResult(saved.result);
        writeLocalSfs(saved.result);
      }
    })();
  }, [user, restored, getAccessToken]);

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
      writeLocalSfs(sfsResult);
      const token = user ? await getAccessToken() : null;
      if (token) {
        const inputs = { employmentIncome, benefitsIncome, otherIncome, deductions, fixedCosts, flexibleCosts, savingsBuffer, creditors };
        saveMeSfs(token, inputs, sfsResult).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Token plan for when nothing is left over: each creditor's token offer
  // (usually £1) becomes the plan, so autopilot can still keep things moving.
  const tokenTotal = result
    ? result.allocations.reduce((sum, a) => sum + (Number(a.pragmatic_offer) || 1), 0).toFixed(0)
    : "0";
  function startTokenPlan() {
    if (!result) return;
    const allocations = result.allocations.map((a) => ({
      ...a,
      pragmatic_offer: String(Number(a.pragmatic_offer) || 1),
      pro_rata_share_bps: 0,
    }));
    // Non-priority shares of the token pot, by their token amount.
    const nonPriority = allocations.filter((a) => a.category !== "priority");
    const npTotal = nonPriority.reduce((s, a) => s + Number(a.pragmatic_offer), 0);
    for (const a of nonPriority) a.pro_rata_share_bps = npTotal ? Math.round((Number(a.pragmatic_offer) / npTotal) * 10000) : 0;
    const tokenPlan = { ...result, surplus_for_creditors: tokenTotal, allocations };
    writeLocalSfs(tokenPlan);
    window.location.href = "/sweep";
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
          pause interest and collections, often through the government&apos;s Breathing Space scheme.
        </p>
        <div className="card flex flex-col gap-2">
          <h2 className="font-semibold text-[15px]">What we can do now</h2>
          <p className="text-[13px] leading-[1.45] text-muted">
            Creditors usually accept a token £1 a month while money is this tight. We can pay those for you automatically, so
            you stay on track without going short.
          </p>
          <button type="button" className="btn" onClick={startTokenPlan}>
            Set up £{tokenTotal} token payments
          </button>
          <Link href="/appeal" className="btn-ghost">
            Challenge a charge that isn&apos;t fair
          </Link>
        </div>
        <div className="mt-auto flex flex-col gap-2.5">
          <a href="tel:08088084000" className="btn-ghost">
            Call National Debtline
            <br />
            <span className="font-normal text-[13px]">0808 808 4000 (free)</span>
          </a>
          <a href="https://www.citizensadvice.org.uk/debt-and-money/" target="_blank" rel="noopener noreferrer" className="btn-ghost">
            Citizens Advice
          </a>
          <a
            href="https://www.gov.uk/government/publications/debt-respite-scheme-breathing-space-guidance"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            What is the Breathing Space scheme?
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
          <span className="text-[13px] font-semibold">for rent, bills, food and a {gbp(result.savings_buffer)} savings buffer</span>
        </div>
        <div className="card flex flex-col gap-2">
          <div className="row"><span>Money in</span><span>{gbp(result.total_income)}</span></div>
          <div className="row"><span>Living costs</span><span>− {gbp(result.total_outgoings)}</span></div>
          <div className="row"><span>Savings buffer</span><span>− {gbp(result.savings_buffer)}</span></div>
          <div className="h-px bg-line" />
          <div className="row"><span>For creditors</span><span className="font-bold">{gbp(result.surplus_for_creditors)} a month</span></div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Split fairly</span>
          {result.allocations.map((a) => (
            <div key={a.creditor_id} className="row">
              <span>
                {a.name}{" "}
                {a.category === "priority" && (
                  <span className="text-[11px] font-bold bg-butter text-ink px-1.5 py-0.5 rounded-[3px]">priority</span>
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
        <details className="text-[13px] leading-[1.45] text-muted">
          <summary className="cursor-pointer font-semibold text-ink">Good to know before you start</summary>
          <ul className="list-disc pl-4 mt-1 flex flex-col gap-1">
            <li>You stay responsible for your debts. A plan doesn&apos;t stop interest or action unless a creditor agrees.</li>
            <li>Creditors may not accept reduced payments, and paying less than agreed may show on your credit file.</li>
            <li>If your income or costs change, update your figures and we will recalculate your plan. You can pause at any time.</li>
            <li>Free advice is always available from National Debtline, StepChange and Citizens Advice.</li>
          </ul>
        </details>
        <p className="text-[12px] text-muted">
          Free to you. Creditors fund Breathing Room with 5% of what they receive (&quot;Fair Share&quot;); it never reduces what
          goes to your debt, and it never changes your split.
        </p>
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

  // Form wizard (Jay): one section at a time with a progress bar.
  const STEPS = ["Money in", "Living costs", "Who you owe"];
  const filled = (v: string) => v.trim() !== "";
  const stepReady = [
    filled(employmentIncome),
    filled(fixedCosts) && filled(flexibleCosts),
    creditors.some((c) => c.name.trim() && c.balance.trim()),
  ][formStep];

  return (
    <div className="wrap">
      <TopBar back={formStep === 0 ? "/" : undefined} onBack={formStep > 0 ? () => setFormStep(formStep - 1) : undefined} />
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((label, i) => (
            <span key={label} className={`h-1.5 flex-1 rounded-full ${i <= formStep ? "bg-ink" : "bg-line"}`} />
          ))}
        </div>
        <span className="text-[13px] font-semibold text-muted">
          Step {formStep + 1} of {STEPS.length}: {STEPS[formStep]}
        </span>
      </div>

      {formStep === 0 && (
        <>
          <h1 className="h2">What comes in each month?</h1>
          <section className="card flex flex-col gap-2.5">
            <h2 className="font-semibold text-[15px]">Not sure of your figures?</h2>
            <p className="text-[13px] leading-[1.45] text-muted -mt-1">
              We can fill in your monthly averages from the last three months of your bank transactions. This uses read-only access
              through TrueLayer, which is authorised by the FCA. You can change any figure afterwards.
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
              <p className="text-[13px] font-semibold text-safe">We have filled in your monthly averages from your bank. Please check that they look right.</p>
            )}
            {autoState === "error" && <p className="error">We could not read your bank account just now. Please enter your figures instead.</p>}
          </section>
          <section className="card flex flex-col gap-3">
            <Field label="Wages (monthly, after tax)" required hint="Your take-home pay in a typical month. Enter 0 if you are not working." placeholder="For example, 1,640" value={employmentIncome} onChange={setEmploymentIncome} />
            <Field label="Benefits (monthly)" hint="For example, Universal Credit, PIP or Child Benefit." placeholder="For example, 350" value={benefitsIncome} onChange={setBenefitsIncome} />
            <Field label="Other income (monthly)" hint="For example, maintenance payments you receive or a pension." placeholder="For example, 0" value={otherIncome} onChange={setOtherIncome} />
            <Field
              label="Deductions (monthly)"
              hint="Money taken from your income before you receive it, such as Universal Credit advance repayments or a self-employed loss."
              placeholder="For example, 0"
              value={deductions}
              onChange={setDeductions}
            />
          </section>
        </>
      )}

      {formStep === 1 && (
        <>
          <h1 className="h2">What has to go out?</h1>
          <section className="card flex flex-col gap-3">
            <Field label="Rent and bills (monthly)" required hint="For example, rent or mortgage, council tax, energy, water and phone." placeholder="For example, 1,100" value={fixedCosts} onChange={setFixedCosts} />
            <Field label="Food and everyday costs (monthly)" required hint="For example, food, travel, school costs and toiletries." placeholder="For example, 400" value={flexibleCosts} onChange={setFlexibleCosts} />
            <label className="field">
              Savings buffer (between £5 and £25 a month)
              <span className="font-normal text-xs">A small amount set aside each month for unexpected costs.</span>
              <input type="number" min={5} max={25} value={savingsBuffer} onChange={(e) => setSavingsBuffer(e.target.value)} className="input w-28" />
            </label>
          </section>
        </>
      )}

      {formStep === 2 && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" id="sfs-form">
          <h1 className="h2">Who do you owe?</h1>
          <LettersToAdd
            existing={creditors.map((c) => c.name.toLowerCase())}
            onAdd={(name, amount) =>
              setCreditors((rows) => {
                const blank = rows.findIndex((r) => !r.name.trim() && !r.balance.trim());
                const row = { ...emptyCreditor(), name, balance: amount };
                return blank >= 0 ? rows.map((r, i) => (i === blank ? row : r)) : [...rows, row];
              })
            }
          />
          <section className="card flex flex-col gap-3">
            <p className="text-xs text-muted">
              For example, &quot;Lambeth PCN&quot; and the amount you still owe. Add at least one creditor. Fields marked <span className="text-rust">*</span> are required.
            </p>
            {creditors.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="grid grid-cols-5 gap-2">
                  <input
                    placeholder="Creditor name *"
                    value={c.name}
                    onChange={(e) => updateCreditor(c.id, { name: e.target.value })}
                    className="input col-span-3"
                  />
                  <input
                    placeholder="Amount owed (£) *"
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
                    placeholder="Agreed monthly payment in £ (if you have one)"
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
              + Add another creditor
            </button>
          </section>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {formStep < 2 ? (
          <button type="button" className="btn" disabled={!stepReady} onClick={() => setFormStep(formStep + 1)}>
            Next
          </button>
        ) : (
          <button type="submit" form="sfs-form" disabled={loading || !stepReady} className="btn">
            {loading ? "Calculating your plan…" : "See my plan"}
          </button>
        )}
        {!stepReady && <p className="text-center text-xs text-muted">Please complete the fields marked *. You can enter 0 where it applies.</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="text-rust"> *</span>}
      </span>
      {hint && <span className="font-normal text-xs -mt-1">{hint}</span>}
      <input type="number" inputMode="decimal" required={required} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}

// Creditors from letters the user has scanned: one tap adds them to the plan.
function LettersToAdd({ existing, onAdd }: { existing: string[]; onAdd: (name: string, amount: string) => void }) {
  const [letters, setLetters] = useState<{ name: string; amount: number | null }[]>([]);
  useEffect(() => setLetters(readLetterCreditors()), []);
  const toAdd = letters.filter((l) => !existing.includes(l.name.toLowerCase()));
  if (toAdd.length === 0) return null;
  return (
    <section className="card flex flex-col gap-2">
      <h2 className="font-semibold text-[15px]">From the letters you scanned</h2>
      {toAdd.map((l) => (
        <button
          key={l.name}
          type="button"
          className="btn-ghost text-left flex justify-between"
          onClick={() => onAdd(l.name, l.amount != null ? String(l.amount) : "")}
        >
          <span>+ {l.name}</span>
          <span>{l.amount != null ? gbp(l.amount, 2) : ""}</span>
        </button>
      ))}
    </section>
  );
}
