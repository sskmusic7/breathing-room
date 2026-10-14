"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useLogin, usePrivy, useSendTransaction, WalletWithMetadata } from "@privy-io/react-auth";
import { createPublicClient, http, formatEther, parseEther, encodeFunctionData, encodeAbiParameters } from "viem";
import { monadTestnet } from "viem/chains";
import { DEBT_POTS_ABI, DEBT_POTS_ADDRESS, DEMO_CREDITOR_ADDRESS, GBP_TO_MON_RATE } from "../lib/contracts";
import { DEBT_POTS_BYTECODE } from "../lib/debtPotsBytecode";
import BankAutopay from "../components/BankAutopay";
import { DemoTag, Sheet, TopBar, gbp } from "../components/ui";
import { getMe, readLocalSfs, saveMeCreditors, type SavedPayee, type SfsResult } from "../lib/api";

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

// v2 = pausable pot; older saved pots predate the pause switch and are replaced.
const potStorageKey = (wallet: string) => `breathing-room:pot:v2:${wallet.toLowerCase()}`;

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
  const { ready, user, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const { sendTransaction } = useSendTransaction();

  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [livingAllowanceGbp, setLivingAllowanceGbp] = useState("1000");
  const [savingsBufferGbp, setSavingsBufferGbp] = useState("10");
  const [depositGbp, setDepositGbp] = useState("1500");
  const [creditors, setCreditors] = useState<SweepCreditorRow[]>([]);
  const [surplusGbp, setSurplusGbp] = useState<number | null>(null);
  const [protectedGbp, setProtectedGbp] = useState<number | null>(null);
  const [potBalance, setPotBalance] = useState<string | null>(null);
  const [potOpen, setPotOpen] = useState(false);
  const [withdrawAll, setWithdrawAll] = useState(true);
  const [withdrawGbp, setWithdrawGbp] = useState("");
  const [withdrawTx, setWithdrawTx] = useState<TxState>({ status: "idle" });

  const [potAddress, setPotAddress] = useState<`0x${string}` | null>(null);
  const [planPaused, setPlanPaused] = useState(false);
  const [pauseTx, setPauseTx] = useState<TxState>({ status: "idle" });
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
        // Make sure the demo gas money has actually arrived before deploying;
        // an empty wallet makes Privy show its own funding screen instead.
        const NEEDED = parseEther("0.21");
        if ((await publicClient.getBalance({ address: walletAddress })) < NEEDED) {
          await fetch("/api/demo-top-up", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: walletAddress }),
          }).catch(() => {});
          let funded = false;
          for (let i = 0; i < 20 && !funded; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            funded = (await publicClient.getBalance({ address: walletAddress })) >= NEEDED;
          }
          if (!funded) throw new Error("We couldn't get your account ready just now. Please wait a minute and try again.");
        }
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

  const fetchPotBalance = useCallback(async () => {
    if (!potAddress) return;
    setPotBalance(formatEther(await publicClient.getBalance({ address: potAddress })));
  }, [potAddress]);

  useEffect(() => {
    fetchPotBalance();
    const id = setInterval(fetchPotBalance, 15000);
    return () => clearInterval(id);
  }, [fetchPotBalance]);

  // Debtor-controlled emergency brake (mentor licensing guidance: the user can
  // pause, change or cancel the plan before anything pays out).
  useEffect(() => {
    if (!potAddress) return;
    (publicClient.readContract({ address: potAddress, abi: DEBT_POTS_ABI, functionName: "paused" }) as Promise<boolean>)
      .then(setPlanPaused)
      .catch(() => {});
  }, [potAddress]);

  async function onTogglePause() {
    if (!potAddress) return;
    setPauseTx({ status: "pending" });
    try {
      const data = encodeFunctionData({ abi: DEBT_POTS_ABI, functionName: "setPaused", args: [!planPaused] });
      const result = await sendTransaction({ to: potAddress, data, value: 0 });
      setPlanPaused(!planPaused);
      setPauseTx({ status: "success", hash: result.hash });
    } catch (err) {
      setPauseTx({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

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

  // What each creditor gets from one payday's collection (priority first, then pro-rata).
  function creditorAmount(c: SweepCreditorRow): number {
    if (c.isPriority) return Number(c.priorityFixedAmountGbp) || 0;
    const priorityTotal = creditors.filter((x) => x.isPriority).reduce((sum, x) => sum + (Number(x.priorityFixedAmountGbp) || 0), 0);
    return Math.max((surplusGbp ?? 0) - priorityTotal, 0) * (c.proRataShareBps / 10000);
  }

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

  // Prefill the creditor table from the last budget (this device first, then
  // the saved account), then bring back each creditor's saved bank details.
  const applySfs = useCallback((sfs: SfsResult) => {
    // Collect only what the plan pays out (payments are capped at what's owed),
    // and give the contract each non-priority creditor's share of that.
    const offers = sfs.allocations.map((a) => Number(a.pragmatic_offer) || 0);
    const total = offers.reduce((s, x) => s + x, 0);
    const npTotal = sfs.allocations.reduce((s, a, i) => s + (a.category === "priority" ? 0 : offers[i]), 0);
    setSurplusGbp(Math.round(total * 100) / 100 || null);
    setProtectedGbp(Number(sfs.total_outgoings) + Number(sfs.savings_buffer) || null);
    setCreditors(
      sfs.allocations.map((a) => ({
        id: a.creditor_id,
        wallet: "",
        label: a.name,
        debtBalanceGbp: a.balance,
        proRataShareBps: a.category === "priority" || !npTotal ? 0 : Math.round((Number(a.pragmatic_offer) / npTotal) * 10000),
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

  useEffect(() => {
    const sfs = readLocalSfs();
    if (sfs) applySfs(sfs);
  }, [applySfs]);

  const [payeesLoaded, setPayeesLoaded] = useState(false);
  useEffect(() => {
    if (!user || payeesLoaded) return;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const me = await getMe(token).catch(() => null);
      if (!me) return;
      // Logged in: the plan saved to the account wins over whatever this
      // device last had, so a phone and a laptop never fight over the plan.
      if (me.sfs?.result) applySfs(me.sfs.result);
      const saved = me.creditors ?? {};
      setCreditors((rows) =>
        rows.map((r) => {
          const p = saved[r.id];
          return p
            ? { ...r, sortCode: p.sort_code, accountNo: p.account_no, reference: p.reference, address: p.address, city: p.city, postcode: p.postcode }
            : r;
        })
      );
      setPayeesLoaded(true);
    })();
  }, [user, payeesLoaded, getAccessToken, applySfs]);

  // Save creditors' bank details as they're typed, so they survive the tab closing.
  useEffect(() => {
    if (!payeesLoaded || creditors.length === 0) return;
    const id = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) return;
      const map: Record<string, SavedPayee> = {};
      for (const c of creditors)
        map[c.id] = { sort_code: c.sortCode, account_no: c.accountNo, reference: c.reference, address: c.address, city: c.city, postcode: c.postcode };
      saveMeCreditors(token, map).catch(() => {});
    }, 1000);
    return () => clearTimeout(id);
  }, [creditors, payeesLoaded, getAccessToken]);

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

  // Withdrawing is never blocked: the pot is the user's own money.
  async function onWithdraw() {
    if (!potAddress) return;
    setWithdrawTx({ status: "pending" });
    try {
      const amount = withdrawAll ? parseEther(potBalance || "0") : gbpToWei(withdrawGbp);
      const data = encodeFunctionData({ abi: DEBT_POTS_ABI, functionName: "withdraw", args: [amount] });
      const result = await sendTransaction({ to: potAddress, data, value: 0 });
      setWithdrawTx({ status: "success", hash: result.hash });
      setTimeout(fetchPotBalance, 3000);
    } catch (err) {
      setWithdrawTx({ status: "error", error: err instanceof Error ? err.message : String(err) });
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

  if (!ready) return <div className="wrap"><div className="card h-40 animate-pulse" /></div>;

  const potGbp = parseFloat(potBalance || "0") / GBP_TO_MON_RATE;
  const creditorsSaved = creditorsTx.status === "success";

  return (
    <div className="wrap">
      <TopBar />

      {!user ? (
        <>
          <h1 className="h2">Put your plan on autopilot</h1>
          <p className="text-[15px] leading-[1.45] text-muted">
            On payday we collect only what&apos;s left after your essentials, and pay each creditor their fair share, with a
            receipt for every penny. Log in with your email to start.
          </p>
          <div className="mt-auto">
            <button onClick={() => login()} className="btn">
              Log in with email
            </button>
          </div>
        </>
      ) : setupError ? (
        <>
          <h1 className="h2">Setup hit a snag</h1>
          <p className="error">{setupError}</p>
          <button onClick={() => window.location.reload()} className="btn">
            Try again
          </button>
        </>
      ) : !walletAddress || !potAddress ? (
        <>
          <h1 className="h2">Setting up your account…</h1>
          <p className="text-[15px] text-muted">This takes a few seconds the first time.</p>
          <div className="card h-40 animate-pulse" />
        </>
      ) : (
        <>
          <BankAutopay
            wallet={walletAddress}
            potAddress={potAddress}
            surplusGbp={surplusGbp}
            protectedGbp={protectedGbp}
            paused={planPaused}
            defaultEmail={user.email?.address}
            payees={payees}
          />

          <details className="card" open={creditors.length > 0 && !creditorsSaved}>
            <summary className="cursor-pointer font-semibold flex items-center justify-between">
              <span>Your creditors</span>
              <span className="text-sm text-muted font-medium">{creditorsSaved ? "Saved ✓" : `${creditors.length} creditor${creditors.length === 1 ? "" : "s"}`}</span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {creditors.length === 0 ? (
                <p className="text-sm text-muted">
                  No creditors yet.{" "}
                  <Link href="/sfs" className="font-semibold underline underline-offset-[3px] text-ink">
                    Work out your budget
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <>
                  <p className="text-[13px] leading-[1.45] text-muted">
                    Please check this before you confirm. Each payday we will collect {gbp(surplusGbp ?? 0, 2)}. Priority debts are
                    paid first, and the remainder is shared in proportion to what you owe. Payments are made a few minutes after your
                    pay arrives.
                  </p>
                  <p className="text-[13px] leading-[1.45] text-muted">
                    You can find each creditor&apos;s bank details on their letter, usually under &quot;How to pay&quot;. Every
                    payment is sent by bank transfer with your reference, so that the creditor can match it to your account.
                  </p>
                  {creditors.map((c) => (
                    <div key={c.id} className="flex flex-col gap-2 border-t border-line pt-3">
                      <div className="row">
                        <span className="font-semibold !text-ink truncate">
                          {c.label}
                          {c.isPriority && <span className="ml-1.5 text-[11px] font-bold bg-butter text-ink px-1.5 py-0.5 rounded-[3px]">priority</span>}
                        </span>
                        <span>{gbp(c.debtBalanceGbp)} owed</span>
                      </div>
                      <div className="row text-[13px] -mt-1">
                        <span>Payment each payday</span>
                        <span className="font-bold">{gbp(creditorAmount(c), 2)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Creditor's sort code" value={c.sortCode} inputMode="numeric" onChange={(e) => updateCreditor(c.id, { sortCode: e.target.value })} className="input" />
                        <input placeholder="Creditor's account number" value={c.accountNo} inputMode="numeric" onChange={(e) => updateCreditor(c.id, { accountNo: e.target.value })} className="input" />
                        <input placeholder="Your reference (for example, PCN or account number)" value={c.reference} onChange={(e) => updateCreditor(c.id, { reference: e.target.value })} className="input col-span-2" />
                        <input placeholder="Creditor's address" value={c.address} onChange={(e) => updateCreditor(c.id, { address: e.target.value })} className="input col-span-2" />
                        <input placeholder="Town or city" value={c.city} onChange={(e) => updateCreditor(c.id, { city: e.target.value })} className="input" />
                        <input placeholder="Postcode" value={c.postcode} onChange={(e) => updateCreditor(c.id, { postcode: e.target.value })} className="input" />
                      </div>
                    </div>
                  ))}
                  <button onClick={onSetCreditors} disabled={creditorsTx.status === "pending"} className="btn">
                    {creditorsTx.status === "pending" ? "Saving…" : creditorsSaved ? "Saved ✓ (save again)" : "Confirm creditors"}
                  </button>
                  {creditorsTx.status === "error" && <p className="error">{creditorsTx.error}</p>}
                </>
              )}
            </div>
          </details>

          <button type="button" onClick={() => setPotOpen(true)} className="card flex items-center justify-between font-semibold text-left">
            <span>Your pot</span>
            <span>{gbp(potGbp)} →</span>
          </button>

          <div className="mt-auto flex flex-col gap-2">
            <button onClick={onTogglePause} disabled={pauseTx.status === "pending"} className="btn-ghost">
              {pauseTx.status === "pending" ? "Saving…" : planPaused ? "Resume payouts" : "Pause this month"}
            </button>
            <p className="text-center text-[12px] text-muted">
              {planPaused
                ? "Paused: nothing goes to creditors until you resume. Only you can do this."
                : "Pausing stops payouts from your pot. A bank payment already on its way may still arrive."}
            </p>
            {pauseTx.status === "error" && <p className="error">{pauseTx.error}</p>}
            <DemoTag />
          </div>

          <Sheet open={potOpen} onClose={() => setPotOpen(false)} title="Of course, it's your money">
            <div>
              <span className="label-caps">Your pot</span>
              <div className="font-serif text-[44px] leading-[1.15]">{gbp(potGbp)}</div>
              <p className="text-sm leading-[1.45] text-muted">
                This is yours. {planPaused ? "Payouts are paused, so it stays here until you resume." : "It usually goes out to your creditors within a few minutes."}
              </p>
            </div>
            <p className="text-sm text-muted">Just so you know what&apos;s coming:</p>
            <div className="bg-paper rounded-[6px] px-3.5 py-3 flex flex-col gap-1.5">
              <div className="row"><span>Next payments go out</span><span className="font-bold">Payday</span></div>
              <div className="row"><span>Needed in your pot by then</span><span className="font-bold">{gbp(surplusGbp ?? 0)}</span></div>
              <div className="row">
                <span>Left after this</span>
                <span>{gbp(withdrawAll ? 0 : Math.max(0, potGbp - Number(withdrawGbp || 0)))}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" className="chip text-[13px] px-3 py-[7px]" aria-pressed={withdrawAll} onClick={() => setWithdrawAll(true)}>
                All {gbp(potGbp)}
              </button>
              <button type="button" className="chip text-[13px] px-3 py-[7px]" aria-pressed={!withdrawAll} onClick={() => setWithdrawAll(false)}>
                Part of it
              </button>
              {!withdrawAll && (
                <input value={withdrawGbp} onChange={(e) => setWithdrawGbp(e.target.value)} placeholder="£" inputMode="decimal" className="input py-1.5 w-24" />
              )}
            </div>
            <button
              onClick={onWithdraw}
              disabled={withdrawTx.status === "pending" || potGbp <= 0 || (!withdrawAll && !(Number(withdrawGbp) > 0))}
              className="btn"
            >
              {withdrawTx.status === "pending" ? "Withdrawing…" : "Withdraw"}
            </button>
            {withdrawTx.status === "success" && <p className="text-[13px] font-semibold text-safe text-center">Done. It&apos;s on its way back to you.</p>}
            {withdrawTx.status === "error" && <p className="error">{withdrawTx.error}</p>}
            <a href="tel:08088084000" className="btn-link">
              Something came up? Talk to National Debtline (free)
            </a>
          </Sheet>

          <details className="text-xs text-muted">
            <summary className="cursor-pointer text-center">Demo controls (manual payday)</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-center">Demo money in your account: {balanceLoading ? "…" : weiToGbp(balance)}</p>
              <ActionCard step={1} title="Payday lands" description="Pretend it's payday: move your wages into your pot." tx={forwardTx}>
                <div className="flex gap-2 items-end">
                  <label className="field flex-1">
                    Amount (£)
                    <input type="number" value={depositGbp} onChange={(e) => setDepositGbp(e.target.value)} className="input" />
                  </label>
                  <button onClick={onForwardFunds} disabled={forwardTx.status === "pending"} className="btn w-auto px-5 py-2.5">
                    {forwardTx.status === "pending" ? "Moving…" : "Pay in"}
                  </button>
                </div>
              </ActionCard>
              <ActionCard
                step={2}
                title="Protect your essentials"
                description="Ring-fence living costs and a buffer inside the pot (only needed when wages go straight into the pot)."
                tx={allowanceTx}
              >
                <div className="grid grid-cols-2 gap-2">
                  <label className="field">
                    Living allowance (£)
                    <input type="number" value={livingAllowanceGbp} onChange={(e) => setLivingAllowanceGbp(e.target.value)} className="input" />
                  </label>
                  <label className="field">
                    Savings buffer (£)
                    <input type="number" value={savingsBufferGbp} onChange={(e) => setSavingsBufferGbp(e.target.value)} className="input" />
                  </label>
                </div>
                <button onClick={onSetAllowance} disabled={allowanceTx.status === "pending"} className="btn mt-2">
                  {allowanceTx.status === "pending" ? "Saving…" : "Save"}
                </button>
              </ActionCard>
              <ActionCard step={3} title="Pay your creditors" description="This normally happens by itself a couple of minutes after money lands. Tap to do it now." tx={sweepTx}>
                <button onClick={onSweep} disabled={sweepTx.status === "pending"} className="btn">
                  {sweepTx.status === "pending" ? "Paying…" : "Pay now"}
                </button>
              </ActionCard>
            </div>
          </details>
          <p className="text-[11px] text-muted text-center">Payments settle on Monad. Automation by Chainlink. Accounts by Privy.</p>
        </>
      )}
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
    <section className="card text-ink">
      <h2 className="font-semibold text-[15px]">
        {step > 0 ? `${step}. ` : ""}{title}
      </h2>
      <p className="text-xs text-muted mb-3">{description}</p>
      {children}
      {tx.status === "success" && tx.hash && (
        <a
          href={`https://testnet.monadscan.com/tx/${tx.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 text-xs font-semibold text-safe underline"
        >
          ✅ Done. View the receipt
        </a>
      )}
      {tx.status === "error" && <p className="mt-2 error">{tx.error}</p>}
    </section>
  );
}
