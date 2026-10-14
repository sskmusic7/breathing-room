"use client";

import { useCallback, useEffect, useState } from "react";
import {
  bankConnectUrl,
  checkPaydayNow,
  getBankStatus,
  saveBankPlan,
  startBankMandate,
  type BankStatus,
  type CreditorPayee,
} from "../lib/api";
import { gbp } from "./ui";

type StepState = "done" | "active" | "todo";

// C4 · Autopilot. Connect bank (read-only) -> approve automatic payday
// collection once -> the backend spots payday and collects only the surplus.
// The activity feed doubles as the progress bar; safety comes first.
export default function BankAutopay({
  wallet,
  potAddress,
  surplusGbp,
  protectedGbp,
  paused,
  defaultEmail,
  payees,
}: {
  wallet: string;
  potAddress: string;
  surplusGbp: number | null;
  protectedGbp: number | null;
  paused: boolean;
  defaultEmail?: string;
  payees: CreditorPayee[];
}) {
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [provider, setProvider] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getBankStatus(wallet));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  // Keep the backend's plan in step with the pot, the latest SFS surplus and
  // where each creditor is paid (debounced while bank details are typed).
  useEffect(() => {
    if (!status?.bank_connected || !surplusGbp) return;
    const same =
      status.plan?.pot_address === potAddress &&
      status.plan?.surplus_gbp === surplusGbp &&
      JSON.stringify(status.plan?.creditors ?? []) === JSON.stringify(payees);
    if (same) return;
    const id = setTimeout(() => {
      saveBankPlan({ wallet, pot_address: potAddress, surplus_gbp: surplusGbp, creditors: payees })
        .then(refresh)
        .catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [status, wallet, potAddress, surplusGbp, payees, refresh]);

  async function onApprove() {
    if (!surplusGbp) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = provider ?? status?.providers[0]?.name;
      const { url } = await startBankMandate({ wallet, name, email, max_monthly_gbp: surplusGbp, provider: chosen });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function onCheckNow() {
    setBusy(true);
    try {
      setStatus(await checkPaydayNow(wallet));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <div className="card h-40 animate-pulse" />;
  if (!status.configured) {
    return <div className="card text-sm text-muted">Bank connection is being set up on our side. Check back shortly.</div>;
  }

  const approved = status.mandate_status === "authorized";
  const surplus = status.plan?.surplus_gbp ?? surplusGbp ?? 0;

  // This month's progress, read from the activity feed (newest first).
  const spottedIdx = status.events.findIndex((e) => e.text.startsWith("Payday spotted"));
  const cycle = spottedIdx >= 0 ? status.events.slice(0, spottedIdx) : [];
  const spottedIn = spottedIdx >= 0 ? status.events[spottedIdx].text.match(/£([\d.]+)/)?.[1] : null;
  const moved = cycle.some((e) => e.text.includes("moved into your pot"));
  const paid = cycle.some((e) => e.text.includes(" paid to "));
  const failed = cycle.some((e) => e.text.startsWith("Bank collection") && e.text.includes("failed"));

  const steps: { label: string; done: boolean }[] = [
    { label: "Bank connected", done: status.bank_connected },
    { label: "Collection approved in your bank", done: approved },
    { label: spottedIn ? `Payday spotted: ${gbp(spottedIn)} received` : "Payday spotted", done: spottedIdx >= 0 },
    { label: `Collecting ${gbp(surplus)}`, done: moved },
    { label: "Moved into your pot", done: moved },
    { label: "Creditors paid", done: paid },
  ];
  const activeIdx = steps.findIndex((s) => !s.done);
  const stepState = (i: number): StepState => (steps[i].done ? "done" : i === activeIdx ? "active" : "todo");

  const [kicker, headline] = paused
    ? ["Paused", "Nothing goes out until you resume"]
    : !status.bank_connected || !approved
      ? ["Almost done", "Set up automatic payments"]
      : paid
        ? ["All done this month", "Your creditors have been paid"]
        : spottedIdx >= 0 && !failed
          ? ["Payday spotted", moved ? "Paying your creditors now" : `Moving ${gbp(surplus)} for you now`]
          : ["Autopilot is on", "Waiting for payday"];

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[13px] font-bold">
          <span className={`w-2 h-2 rounded-full ${paused ? "bg-butter" : "bg-safe"}`} />
          {kicker}
        </span>
        <h1 className="h2">{headline}</h1>
      </div>

      <div className="safe-card flex items-center gap-2.5 text-[15px] font-semibold leading-[1.4]">
        <span className="w-[22px] h-[22px] flex-none rounded-full bg-safe text-mint grid place-items-center text-[13px]">✓</span>
        <span>
          {protectedGbp ? `${gbp(protectedGbp)} protected for rent, bills and food` : "Your rent, bills and food money stays in your bank"}
        </span>
      </div>

      <div className="card flex flex-col gap-2">
        {steps.map((s, i) => {
          const st = stepState(i);
          return (
            <div
              key={s.label}
              className={`flex items-center gap-2.5 text-sm ${st === "active" ? "font-bold text-ink" : st === "done" ? "font-medium text-ink" : "font-medium text-muted"}`}
            >
              <span className={`w-5 text-center ${st === "done" ? "text-safe" : st === "active" ? "text-ink" : "text-muted"}`}>
                {st === "done" ? "✓" : st === "active" ? "●" : "○"}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>

      {!status.bank_connected ? (
        <div className="card flex flex-col gap-2.5">
          <p className="text-[13px] leading-[1.45] text-muted">
            Connect your bank so that we can tell when you have been paid. This is read-only access through TrueLayer, which is
            authorised by the FCA. We can never move money without your approval.
          </p>
          <a href={bankConnectUrl(wallet)} className="btn">
            Connect my bank
          </a>
        </div>
      ) : !approved ? (
        <div className="card flex flex-col gap-2.5">
          <p className="text-[13px] leading-[1.45] text-muted">
            Next, approve automatic collection with your bank. You only need to do this once. We will only ever collect your
            surplus{surplusGbp ? ` (up to ${gbp(surplusGbp, 2)} a month)` : ""}, so the money for your essentials stays in your account.
          </p>
          {!surplusGbp ? (
            <a href="/sfs" className="btn">
              Work out my budget first
            </a>
          ) : status.providers.length === 0 ? (
            <p className="text-sm text-muted">Payment collection is being set up on our side. Check back shortly.</p>
          ) : (
            <>
              <label className="field">
                Full name
                <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" />
              </label>
              <label className="field">
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
              </label>
              {status.providers.length > 1 && (
                <div className="field">
                  How would you like to pay?
                  <div className="flex flex-wrap gap-1.5">
                    {status.providers.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="chip text-[13px]"
                        aria-pressed={(provider ?? status.providers[0].name) === p.name}
                        onClick={() => setProvider(p.name)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(provider ?? status.providers[0].name) === "gocardless" && (
                <details className="text-[12px] leading-[1.45] text-muted">
                  <summary className="cursor-pointer font-semibold text-ink">The Direct Debit Guarantee</summary>
                  <ul className="list-disc pl-4 mt-1 flex flex-col gap-1">
                    <li>This Guarantee is offered by all banks and building societies that accept instructions to pay Direct Debits.</li>
                    <li>
                      If there are any changes to the amount, date or frequency of your Direct Debit, Breathing Room will notify you 3
                      working days in advance of your account being debited or as otherwise agreed.
                    </li>
                    <li>
                      If an error is made in the payment of your Direct Debit, by Breathing Room or your bank or building society, you
                      are entitled to a full and immediate refund of the amount paid from your bank or building society.
                    </li>
                    <li>If you receive a refund you are not entitled to, you must pay it back when asked.</li>
                    <li>You can cancel a Direct Debit at any time by simply contacting your bank or building society. Please also tell us.</li>
                  </ul>
                </details>
              )}
              <label className="flex items-start gap-2.5 text-[13px] leading-[1.45]">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 w-4 h-4 accent-ink" />
                <span>
                  I&apos;m 18 or over, I&apos;ve read the{" "}
                  <a href="/terms" target="_blank" className="font-semibold underline underline-offset-2">
                    Key Facts and terms
                  </a>
                  , and I agree to collect up to {surplusGbp ? gbp(surplusGbp, 2) : "my surplus"} each payday for the creditors I confirm.
                </span>
              </label>
              <button onClick={onApprove} disabled={busy || !name || !email || !accepted} className="btn">
                {busy ? "Opening your bank…" : "Approve in my bank"}
              </button>
            </>
          )}
        </div>
      ) : (
        <button onClick={onCheckNow} disabled={busy} className="btn-ghost">
          {busy ? "Checking…" : status.collecting ? "Collecting… check again" : "Check for payday now"}
        </button>
      )}

      {status.events.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer font-semibold">Activity</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {status.events.slice(0, 8).map((e) => (
              <li key={e.at + e.text} className="leading-[1.4]">
                <span className="text-muted">
                  {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>{" "}
                : {e.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}
