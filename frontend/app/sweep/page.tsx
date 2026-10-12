"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useLogin, usePrivy, useSendTransaction, WalletWithMetadata } from "@privy-io/react-auth";
import { createPublicClient, http, formatEther, parseEther, encodeFunctionData, encodeAbiParameters } from "viem";
import { monadTestnet } from "viem/chains";
import { DEBT_POTS_ABI, DEBT_POTS_ADDRESS, DEMO_CREDITOR_ADDRESS, GBP_TO_MON_RATE } from "../lib/contracts";
import { DEBT_POTS_BYTECODE } from "../lib/debtPotsBytecode";
import BankAutopay from "../components/BankAutopay";
import { SFS_RESULT_STORAGE_KEY, type SfsResult } from "../lib/api";

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });

interface SweepCreditorRow {
  id: string;
  wallet: string;
  label: string;
  debtBalanceGbp: string;
  proRataShareBps: number;
  priorityFixedAmountGbp: string;
  isPriority: boolean;
  sortCode: string;
  accountNo: string;
  reference: string;
  address: string;
  city: string;
  postcode: string;
}

type TxState = { status: "idle" | "pending" | "success" | "error"; hash?: string; error?: string };

const potStorageKey = (wallet: string) => `breathing-room:pot:${wallet.toLowerCase()}`;

function weiToGbp(wei: string | null): string {
  return (parseFloat(wei || "0") / GBP_TO_MON_RATE).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });
}

function gbpToWei(gbp: string): bigint {
  const mon = Number(gbp || 0) * GBP_TO_MON_RATE;
  return parseEther(mon.toFixed(18));
}

export default function SweepPage() {
  const { ready, user } = usePrivy();
  const { login } = useLogin();
  const { sendTransaction } = useSendTransaction();

  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [livingAllowanceGbp, setLivingAllowanceGbp] = useState("1000");
  const [savingsBufferGbp, setSavingsBufferGbp] = useState("10");
  const [depositGbp, setDepositGbp] = useState("1500");
  const [creditors, setCreditors] = useState<SweepCreditorRow[]>([]);
  const [surplusGbp, setSurplusGbp] = useState<number | null>(null);

  const [potAddress, setPotAddress] = useState<`0x${string}` | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [forwardTx, setForwardTx] = useState<TxState>({ status: "idle" });
  const [allowanceTx, setAllowanceTx] = useState<TxState>({ status: "idle" });
  const [creditorsTx, setCreditorsTx] = useState<TxState>({ status: "idle" });
  const [sweepTx, setSweepTx] = useState<TxState>({ status: "idle" });

  const ethereumEmbeddedWallets = useMemo<WalletWithMetadata[]>(
    () =>
      (user?.linkedAccounts.filter(
        (account) =>
          account.type === "wallet" &&
          account.walletClientType === "privy" &&
          account.chainType === "ethereum"
      ) as WalletWithMetadata[]) ?? [],
    [user]
  );
  const walletAddress = ethereumEmbeddedWallets[0]?.address as `0x${string}` | undefined;

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;
    setBalanceLoading(true);
    try {
      const wei = await publicClient.getBalance({ address: walletAddress });
      setBalance(formatEther(wei));
    } finally {
      setBalanceLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) fetchBalance();
  }, [walletAddress, fetchBalance]);

  // DebtPots is single-debtor, so the original demo pot only works for its owner.
  // Every other tester gets their own pot, deployed from their wallet on first visit.
  useEffect(() => {
    if (!walletAddress || potAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const owner = (await publicClient.readContract({
          address: DEBT_POTS_ADDRESS,
          abi: DEBT_POTS_ABI,
          functionName: "owner",
        })) as string;
        if (owner.toLowerCase() === walletAddress.toLowerCase()) {
          if (!cancelled) setPotAddress(DEBT_POTS_ADDRESS);
          return;
        }
        const saved = localStorage.getItem(potStorageKey(walletAddress)) as `0x${string}` | null;
        if (saved && (await publicClient.getCode({ address: saved }))) {
          if (!cancelled) setPotAddress(saved);
          return;
        }
        await fetch("/api/demo-top-up", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: walletAddress }),
        });
        const constructorArgs = encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
          [walletAddress, BigInt(0), BigInt(0)]
        );
        const { hash } = await sendTransaction({
          data: DEBT_POTS_BYTECODE + constructorArgs.slice(2),
          value: 0,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        if (!receipt.contractAddress) throw new Error("Account setup failed. Please refresh and try again.");
        localStorage.setItem(potStorageKey(walletAddress), receipt.contractAddress);
        if (!cancelled) {
          setPotAddress(receipt.contractAddress);
          fetchBalance();
        }
      } catch (err) {
        if (!cancelled) setSetupError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, potAddress, sendTransaction, fetchBalance]);

  // With bank collection only the surplus enters the pot (essentials never
  // leave the bank), so the pot itself must not hold anything back.
  useEffect(() => {
    if (!potAddress) return;
    (async () => {
      const [living, buffer] = await Promise.all(
        (["livingExpensesAllowanceWei", "savingsBufferWei"] as const).map(
          (fn) => publicClient.readContract({ address: potAddress, abi: DEBT_POTS_ABI, functionName: fn }) as Promise<bigint>
        )
      );
      if (living + buffer === BigInt(0)) return;
      const data = encodeFunctionData({ abi: DEBT_POTS_ABI, functionName: "setAllowance", args: [BigInt(0), BigInt(0)] });
      await sendTransaction({ to: potAddress, data, value: 0 }).catch(() => {});
    })();
  }, [potAddress, sendTransaction]);

  function updateCreditor(id: string, patch: Partial<SweepCreditorRow>) {
    setCreditors((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const payees = useMemo(
    () =>
      creditors.map((c) => ({
        label: c.label,
        sort_code: c.sortCode,
        account_no: c.accountNo,
        reference: c.reference,
        address: c.address,
        city: c.city,
        postcode: c.postcode,
      })),
    [creditors]
  );

  // Prefill the creditor table from whatever the SFS screen last calculated.
  useEffect(() => {
    const raw = sessionStorage.getItem(SFS_RESULT_STORAGE_KEY);
    if (!raw) return;
    const sfs: SfsResult = JSON.parse(raw);
    setSurplusGbp(Number(sfs.surplus_for_creditors) || null);
    setCreditors(
      sfs.allocations.map((a) => ({
        id: a.creditor_id,
        wallet: "",
        label: a.name,
        debtBalanceGbp: a.balance,
        proRataShareBps: a.category === "priority" ? 0 : a.pro_rata_share_bps,
        priorityFixedAmountGbp: a.category === "priority" ? a.pragmatic_offer : "0",
        isPriority: a.category === "priority",
        sortCode: "",
        accountNo: "",
        reference: "",
        address: "",
        city: "",
        postcode: "",
      }))
    );
  }, []);

  async function onForwardFunds() {
    setForwardTx({ status: "pending" });
    try {
      const result = await sendTransaction({
        to: potAddress!,
        value: gbpToWei(depositGbp),
      });
      setForwardTx({ status: "success", hash: result.hash });
      setTimeout(fetchBalance, 3000);
    } catch (err) {
      setForwardTx({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function onSetAllowance() {
    setAllowanceTx({ status: "pending" });
    try {
      const data = encodeFunctionData({
        abi: DEBT_POTS_ABI,
        functionName: "setAllowance",
        args: [gbpToWei(livingAllowanceGbp), gbpToWei(savingsBufferGbp)],
      });
      const result = await sendTransaction(
        { to: potAddress!, data, value: 0 });
      setAllowanceTx({ status: "success", hash: result.hash });
    } catch (err) {
      setAllowanceTx({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function onSetCreditors() {
    setCreditorsTx({ status: "pending" });
    try {
      const args = [
        creditors.map((c) => ({
          wallet: (c.wallet || DEMO_CREDITOR_ADDRESS) as `0x${string}`,
          label: c.label,
          debtBalanceWei: gbpToWei(c.debtBalanceGbp),
          proRataShareBps: BigInt(c.proRataShareBps),
          priorityFixedAmountWei: gbpToWei(c.priorityFixedAmountGbp),
          isPriority: c.isPriority,
        })),
      ] as const;
      const data = encodeFunctionData({ abi: DEBT_POTS_ABI, functionName: "setCreditors", args });
      const result = await sendTransaction(
        { to: potAddress!, data, value: 0 });
      setCreditorsTx({ status: "success", hash: result.hash });
    } catch (err) {
      setCreditorsTx({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function onSweep() {
    setSweepTx({ status: "pending" });
    try {
      const data = encodeFunctionData({ abi: DEBT_POTS_ABI, functionName: "sweep", args: [] });
      const result = await sendTransaction(
        { to: potAddress!, data, value: 0 });
      setSweepTx({ status: "success", hash: result.hash });
      setTimeout(fetchBalance, 3000);
    } catch (err) {
      setSweepTx({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!ready) return <div className="p-8">Loading…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Home
        </Link>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-2 mb-2">Payday sweep</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Your pot only holds your money between payday landing and it paying out,
          following the plan you set. Breathing Room never holds your money or
          negotiates with your creditors for you.
        </p>

        {!user ? (
          <button
            onClick={() => login()}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6"
          >
            Log in to continue
          </button>
        ) : setupError ? (
          <p className="text-red-600 text-sm">{setupError}</p>
        ) : !walletAddress || !potAddress ? (
          <p className="text-slate-500">Setting up your account… this takes a few seconds the first time.</p>
        ) : (
          <>
            <section className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Your balance (demo money)</p>
                  <p className="font-semibold text-lg">{balanceLoading ? "…" : weiToGbp(balance)}</p>
                </div>
              </div>
              <button onClick={fetchBalance} className="text-xs text-blue-600 hover:underline mt-1">
                Refresh
              </button>
            </section>

            <BankAutopay
              wallet={walletAddress}
              potAddress={potAddress}
              surplusGbp={surplusGbp}
              defaultEmail={user.email?.address}
              payees={payees}
            />

            <ActionCard
              step={1}
              title="Confirm your creditors"
              description="Pulled in from your budget. Each creditor gets their fair share of whatever's left after your essentials."
              tx={creditorsTx}
            >
              {creditors.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No creditors yet —{" "}
                  <Link href="/sfs" className="text-blue-600 hover:underline">
                    calculate your SFS
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <div className="space-y-2">
                  {creditors.map((c) => (
                    <div key={c.id} className="text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                      <div className="flex justify-between">
                        <span className="truncate font-medium">{c.label}</span>
                        <span>£{c.debtBalanceGbp} owed</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <input
                          placeholder="Their sort code"
                          value={c.sortCode}
                          onChange={(e) => updateCreditor(c.id, { sortCode: e.target.value })}
                          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-xs"
                        />
                        <input
                          placeholder="Their account no."
                          value={c.accountNo}
                          onChange={(e) => updateCreditor(c.id, { accountNo: e.target.value })}
                          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-xs"
                        />
                        <input
                          placeholder="Your reference (PCN / account no.)"
                          value={c.reference}
                          onChange={(e) => updateCreditor(c.id, { reference: e.target.value })}
                          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-xs"
                        />
                        <input
                          placeholder="Their address"
                          value={c.address}
                          onChange={(e) => updateCreditor(c.id, { address: e.target.value })}
                          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-xs"
                        />
                        <input
                          placeholder="Town / city"
                          value={c.city}
                          onChange={(e) => updateCreditor(c.id, { city: e.target.value })}
                          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-xs"
                        />
                        <input
                          placeholder="Postcode"
                          value={c.postcode}
                          onChange={(e) => updateCreditor(c.id, { postcode: e.target.value })}
                          className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-slate-400">
                    Find these on the creditor&apos;s letter under &quot;how to pay&quot;. Each payment is sent by bank transfer
                    with your reference, so they can match it.
                  </p>
                  <button
                    onClick={onSetCreditors}
                    disabled={creditorsTx.status === "pending"}
                    className="mt-2 rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold disabled:opacity-50"
                  >
                    {creditorsTx.status === "pending" ? "Saving…" : "Confirm creditors"}
                  </button>
                </div>
              )}
            </ActionCard>

            <details className="mb-4">
              <summary className="text-xs text-slate-400 cursor-pointer mb-2">Demo controls (manual payday)</summary>
            <ActionCard
              step={1}
              title="Payday lands"
              description="Pretend it's payday: move your wages into your pot."
              tx={forwardTx}
            >
              <div className="flex gap-2 items-end">
                <label className="text-sm flex-1">
                  Amount (£)
                  <input
                    type="number"
                    value={depositGbp}
                    onChange={(e) => setDepositGbp(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
                  />
                </label>
                <button
                  onClick={onForwardFunds}
                  disabled={forwardTx.status === "pending"}
                  className="rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold disabled:opacity-50"
                >
                  {forwardTx.status === "pending" ? "Moving…" : "Pay in"}
                </button>
              </div>
            </ActionCard>

            <ActionCard
              step={2}
              title="Protect your essentials"
              description="Ring-fence your essential living costs and savings buffer — these always come back to you first."
              tx={allowanceTx}
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  Living allowance (£)
                  <input
                    type="number"
                    value={livingAllowanceGbp}
                    onChange={(e) => setLivingAllowanceGbp(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
                  />
                </label>
                <label className="text-sm">
                  Savings buffer (£)
                  <input
                    type="number"
                    value={savingsBufferGbp}
                    onChange={(e) => setSavingsBufferGbp(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 mt-1"
                  />
                </label>
              </div>
              <button
                onClick={onSetAllowance}
                disabled={allowanceTx.status === "pending"}
                className="mt-2 rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold disabled:opacity-50"
              >
                {allowanceTx.status === "pending" ? "Saving…" : "Save"}
              </button>
            </ActionCard>


            <ActionCard
              step={4}
              title="Pay your creditors"
              description="This normally happens by itself a couple of minutes after payday lands. Tap to do it now."
              tx={sweepTx}
            >
              <button
                onClick={onSweep}
                disabled={sweepTx.status === "pending"}
                className="rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 font-semibold disabled:opacity-50"
              >
                {sweepTx.status === "pending" ? "Paying…" : "Pay now"}
              </button>
            </ActionCard>
            </details>
            <p className="text-[11px] text-slate-400 text-center mt-6">
              Payments settle on Monad. Automation by Chainlink. Accounts by Privy.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  step,
  title,
  description,
  tx,
  children,
}: {
  step: number;
  title: string;
  description: string;
  tx: TxState;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-4 shadow-sm">
      <h2 className="font-semibold text-slate-700 dark:text-slate-200">
        {step}. {title}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{description}</p>
      {children}
      {tx.status === "success" && tx.hash && (
        <a
          href={`https://testnet.monadscan.com/tx/${tx.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 text-xs text-green-600 hover:underline"
        >
          ✅ Done · view receipt
        </a>
      )}
      {tx.status === "error" && <p className="mt-2 text-xs text-red-600">{tx.error}</p>}
    </section>
  );
}
