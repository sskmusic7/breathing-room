"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLogin, usePrivy, useSendTransaction, WalletWithMetadata } from "@privy-io/react-auth";
import { createPublicClient, encodeFunctionData, http, isAddress } from "viem";
import { monadTestnet } from "viem/chains";

import { Card, ErrorBox, Field, PageShell, buttonClass, inputClass } from "../components/ui";
import { SfsResult, loadPlan } from "../lib/api";
import { DEBTPOTS_ABI, DEBTPOTS_ADDRESS, MON_PER_GBP, gbpToWei, previewSweep, weiToGbp } from "../lib/debtpots";

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
const EXPLORER = "https://testnet.monadscan.com";
const gbp = (n: number) => `£${n.toFixed(2)}`;

interface HistoryEntry {
  txHash: string;
  label: string;
  amountGbp: number;
  ok: boolean;
}

export default function SweepPage() {
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { sendTransaction } = useSendTransaction();

  const [plan, setPlan] = useState<SfsResult | null>(null);
  const [wallets, setWallets] = useState<Record<string, string>>({});
  const [deposit, setDeposit] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const p = loadPlan();
    setPlan(p);
    if (p) setDeposit(Number(p.total_income).toFixed(2));
  }, []);

  const walletAddress = useMemo(
    () =>
      (user?.linkedAccounts.find(
        (a) => a.type === "wallet" && a.walletClientType === "privy" && a.chainType === "ethereum"
      ) as WalletWithMetadata | undefined)?.address,
    [user]
  );

  const preview = useMemo(() => (plan ? previewSweep(plan, Number(deposit) || 0) : []), [plan, deposit]);

  const loadHistory = useCallback(async () => {
    if (!DEBTPOTS_ADDRESS) return;
    try {
      const latest = await publicClient.getBlockNumber();
      // Public RPCs cap log ranges, so look back over a recent window only.
      const fromBlock = latest > BigInt(90) ? latest - BigInt(90) : BigInt(0);
      const [paid, failed] = await Promise.all([
        publicClient.getContractEvents({ address: DEBTPOTS_ADDRESS, abi: DEBTPOTS_ABI, eventName: "CreditorPaid", fromBlock }),
        publicClient.getContractEvents({ address: DEBTPOTS_ADDRESS, abi: DEBTPOTS_ABI, eventName: "PaymentFailed", fromBlock }),
      ]);
      const entries: HistoryEntry[] = [
        ...paid.map((l) => ({ txHash: l.transactionHash, label: l.args.label ?? "", amountGbp: weiToGbp(l.args.amount ?? BigInt(0)), ok: true })),
        ...failed.map((l) => ({ txHash: l.transactionHash, label: l.args.label ?? "", amountGbp: weiToGbp(l.args.amount ?? BigInt(0)), ok: false })),
      ];
      setHistory(entries.reverse());
    } catch (err) {
      console.error("Failed to load sweep history", err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function run(name: string, tx: { data?: `0x${string}`; value?: bigint }): Promise<boolean> {
    if (!DEBTPOTS_ADDRESS) return false;
    setError(null);
    setBusy(name);
    try {
      const result = await sendTransaction({ to: DEBTPOTS_ADDRESS, ...tx });
      setLastTx(result.hash);
      setTimeout(loadHistory, 3000);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function savePlanOnChain() {
    if (!plan) return;
    const missing = plan.allocations.filter((a) => !isAddress(wallets[a.creditor_id] ?? ""));
    if (missing.length) {
      setError(`Add a valid payment address for: ${missing.map((a) => a.name).join(", ")}`);
      return;
    }
    const allowanceSaved = await run("allowance", {
      data: encodeFunctionData({
        abi: DEBTPOTS_ABI,
        functionName: "setAllowance",
        args: [gbpToWei(plan.total_outgoings), gbpToWei(plan.savings_buffer)],
      }),
    });
    if (!allowanceSaved) return;
    await run("creditors", {
      data: encodeFunctionData({
        abi: DEBTPOTS_ABI,
        functionName: "setCreditors",
        args: [
          plan.allocations.map((a) => ({
            wallet: wallets[a.creditor_id] as `0x${string}`,
            label: a.name,
            debtBalanceWei: gbpToWei(a.balance),
            proRataShareBps: a.category === "priority" ? BigInt(0) : BigInt(a.pro_rata_share_bps),
            priorityFixedAmountWei: a.category === "priority" ? gbpToWei(a.pragmatic_offer) : BigInt(0),
            isPriority: a.category === "priority",
          })),
        ],
      }),
    });
  }

  if (!DEBTPOTS_ADDRESS) {
    return (
      <PageShell title="Payday sweep">
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            The payday sweep contract isn&apos;t configured yet. Deploy <code>DebtPots.sol</code> to Monad
            testnet and set <code>NEXT_PUBLIC_DEBTPOTS_ADDRESS</code> in <code>frontend/.env.local</code>.
          </p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Payday sweep"
      intro="On payday, your living costs and savings are protected first, then what's left is paid to your creditors automatically. You stay in control: only you can change the plan or withdraw."
    >
      {!ready ? null : !authenticated ? (
        <Card>
          <button className={buttonClass} onClick={() => login()}>Log in to continue</button>
        </Card>
      ) : (
        <>
          {!plan ? (
            <Card>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Work out your budget first, then come back here. <a href="/budget" className="text-teal-700 underline">Go to Budget &amp; plan</a>
              </p>
            </Card>
          ) : (
            <>
              <Card title="Where your next payday goes">
                <Field label="Payday amount (£)">
                  <input type="number" min="0" step="0.01" className={inputClass} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                </Field>
                {preview.length === 0 ? (
                  <p className="mt-3 text-sm text-amber-700">This amount doesn&apos;t cover your protected living costs, so nothing would go to creditors.</p>
                ) : (
                  <table className="mt-4 w-full text-sm">
                    <tbody className="tabular-nums">
                      {preview.map((l, i) => (
                        <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                          <td className="py-2">
                            {l.label}
                            {l.kind === "protected" && <span className="ml-2 text-xs text-teal-700">protected</span>}
                            {l.kind === "priority" && <span className="ml-2 text-xs text-teal-700">priority</span>}
                          </td>
                          <td className="py-2 text-right font-semibold">{gbp(l.amountGbp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-3 text-xs text-slate-500">Testnet demo: £1 is represented as {MON_PER_GBP} MON.</p>
              </Card>

              <Card title="Creditor payment addresses">
                <div className="space-y-3">
                  {plan.allocations.map((a) => (
                    <Field key={a.creditor_id} label={a.name}>
                      <input
                        className={`${inputClass} font-mono text-xs`}
                        placeholder="0x…"
                        value={wallets[a.creditor_id] ?? ""}
                        onChange={(e) => setWallets({ ...wallets, [a.creditor_id]: e.target.value.trim() })}
                      />
                    </Field>
                  ))}
                </div>
                <button className={`${buttonClass} mt-4`} disabled={busy !== null} onClick={savePlanOnChain}>
                  {busy === "allowance" || busy === "creditors" ? "Saving…" : "Save plan to my pot"}
                </button>
              </Card>

              <Card title="Run it">
                <div className="flex flex-wrap gap-3">
                  <button
                    className={buttonClass}
                    disabled={busy !== null || !Number(deposit)}
                    onClick={() => run("deposit", { value: gbpToWei(deposit) })}
                  >
                    {busy === "deposit" ? "Depositing…" : `Deposit ${gbp(Number(deposit) || 0)}`}
                  </button>
                  <button
                    className={buttonClass}
                    disabled={busy !== null}
                    onClick={() => run("sweep", { data: encodeFunctionData({ abi: DEBTPOTS_ABI, functionName: "sweep" }) })}
                  >
                    {busy === "sweep" ? "Sweeping…" : "Run payday sweep"}
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Once automation is registered, the sweep runs by itself when your pay lands.
                </p>
              </Card>
            </>
          )}

          <Card title="Emergency controls">
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
              Need your money back before a sweep? Withdraw from your pot at any time. Only you can do this.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Amount (£)">
                <input type="number" min="0" step="0.01" className={inputClass} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
              </Field>
              <button
                className={buttonClass}
                disabled={busy !== null || !Number(withdrawAmount)}
                onClick={() =>
                  run("withdraw", {
                    data: encodeFunctionData({ abi: DEBTPOTS_ABI, functionName: "withdraw", args: [gbpToWei(withdrawAmount)] }),
                  })
                }
              >
                {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
              </button>
            </div>
          </Card>

          <ErrorBox message={error} />
          {lastTx && (
            <p className="text-sm">
              Sent: <a className="text-teal-700 underline" href={`${EXPLORER}/tx/${lastTx}`} target="_blank" rel="noreferrer">view transaction</a>
            </p>
          )}

          <Card title="Recent payments">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No payments yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                    <span>
                      {h.label} {!h.ok && <span className="text-red-600">(failed — funds kept in pot)</span>}
                    </span>
                    <a className="tabular-nums text-teal-700 underline" href={`${EXPLORER}/tx/${h.txHash}`} target="_blank" rel="noreferrer">
                      {gbp(h.amountGbp)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {walletAddress && <p className="text-xs text-slate-500">Your wallet: <span className="font-mono">{walletAddress}</span></p>}
        </>
      )}
    </PageShell>
  );
}
