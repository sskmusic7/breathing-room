"use client";

import { useCallback, useEffect, useState } from "react";
import {
  bankConnectUrl,
  checkPaydayNow,
  getBankStatus,
  saveBankPlan,
  startBankMandate,
  type BankStatus,
} from "../lib/api";

// Connect bank (read-only) -> approve automatic payday collection (VRP
// mandate) -> the backend spots payday and collects only the surplus.
export default function BankAutopay({
  wallet,
  potAddress,
  surplusGbp,
  defaultEmail,
}: {
  wallet: string;
  potAddress: string;
  surplusGbp: number | null;
  defaultEmail?: string;
}) {
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [provider, setProvider] = useState<string | null>(null);

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

  // Keep the backend's plan in step with the pot and the latest SFS surplus.
  useEffect(() => {
    if (!status?.bank_connected || !surplusGbp) return;
    if (status.plan?.pot_address === potAddress && status.plan?.surplus_gbp === surplusGbp) return;
    saveBankPlan({ wallet, pot_address: potAddress, surplus_gbp: surplusGbp }).then(refresh).catch(() => {});
  }, [status, wallet, potAddress, surplusGbp, refresh]);

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

  const button =
    "rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold disabled:opacity-50";

  if (!status) return null;
  if (!status.configured) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-4 shadow-sm text-sm text-slate-500">
        Bank connection is being set up on our side. Check back shortly.
      </section>
    );
  }

  const approved = status.mandate_status === "authorized";

  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-4 shadow-sm">
      <h2 className="font-semibold text-slate-700 dark:text-slate-200">Your bank</h2>

      {!status.bank_connected ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Link your bank so we can spot payday. Read-only, through TrueLayer (FCA authorised). We can never move
            money without your approval.
          </p>
          <a href={bankConnectUrl(wallet)} className={`inline-block ${button}`}>
            Connect my bank
          </a>
        </>
      ) : !approved ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Bank connected. Now approve automatic payday collection, once, in your bank. We only ever take your
            surplus{surplusGbp ? ` (up to £${surplusGbp.toFixed(2)} a month)` : ""}. Your essentials stay put.
          </p>
          {!surplusGbp ? (
            <p className="text-sm text-slate-400">Work out your budget first so we know your surplus.</p>
          ) : status.providers.length === 0 ? (
            <p className="text-sm text-slate-400">Payment collection is being set up on our side. Check back shortly.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                Full name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
                />
              </label>
              <label className="text-sm">
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
                />
              </label>
              {status.providers.length > 1 && (
                <fieldset className="col-span-2 text-sm">
                  <legend className="mb-1">How should we collect?</legend>
                  {status.providers.map((p) => (
                    <label key={p.name} className="mr-4">
                      <input
                        type="radio"
                        name="provider"
                        checked={(provider ?? status.providers[0].name) === p.name}
                        onChange={() => setProvider(p.name)}
                        className="mr-1"
                      />
                      {p.label}
                    </label>
                  ))}
                </fieldset>
              )}
              <button onClick={onApprove} disabled={busy || !name || !email} className={`col-span-2 ${button}`}>
                {busy ? "Opening your bank…" : "Approve in my bank"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-green-700 dark:text-green-400 mb-1">
            ✅ Automatic payday collection is on.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            When your wages land we collect your £{(status.plan?.surplus_gbp ?? surplusGbp ?? 0).toFixed(2)} surplus
            and your creditors are paid automatically. {status.collecting ? "Collection in progress…" : ""}
          </p>
          <button onClick={onCheckNow} disabled={busy} className={button}>
            {busy ? "Checking…" : "Check for payday now"}
          </button>
        </>
      )}

      {status.events.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 dark:border-slate-700 pt-3">
          {status.events.slice(0, 6).map((e) => (
            <li key={e.at + e.text} className="text-xs text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">{new Date(e.at).toLocaleString("en-GB")}</span> · {e.text}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
