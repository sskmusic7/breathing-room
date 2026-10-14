"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import { DemoTag, TopBar, gbp } from "../components/ui";
import { DEBT_POTS_ABI, GBP_TO_MON_RATE } from "../lib/contracts";

// Reads go straight from this browser to Monad, not through our server.
const chain = createPublicClient({ chain: monadTestnet, transport: http() });
const weiToGbp = (wei: bigint) => Number(wei) / 1e18 / GBP_TO_MON_RATE;

interface OnChainCreditor {
  label: string;
  bps: number;
  priorityGbp: number;
  isPriority: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const REPO = "https://github.com/sskmusic7/breathing-room";

interface Proof {
  addresses: { pot: string; automation: string; receiver: string; forwarder: string };
  explorer: string;
  pot_balance_gbp: number;
  runs: { at: string; outcome: "paid" | "checked" | "error"; tx: string | null }[];
  ledger: { kind: "payday" | "paid"; label: string; amount_gbp: number; priority?: boolean; tx: string; at: number }[];
  transfers: { at: string; text: string }[];
  next_run_in: number;
}

type StageState = "done" | "active" | "waiting";

// Proof it's real: a public demo pot watched by the same Chainlink workflow as
// users' pots. Anyone can send it a test payday and watch every step happen,
// each one linked to its transaction on the public Monad ledger.
export default function ProofPage() {
  const [proof, setProof] = useState<Proof | null>(null);
  const [runStart, setRunStart] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [amount, setAmount] = useState("");
  const [block, setBlock] = useState<bigint | null>(null);
  const [potGbp, setPotGbp] = useState<number | null>(null);
  const [rules, setRules] = useState<OnChainCreditor[]>([]);
  const [verified, setVerified] = useState<Record<string, bigint>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/proof`);
      if (res.ok) setProof(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  // Live chain state: block height, the pot's balance and its payout rules,
  // all read directly from the contract.
  const pot = proof?.addresses.pot as `0x${string}` | undefined;
  useEffect(() => {
    if (!pot) return;
    let stop = false;
    const tick = async () => {
      try {
        const [b, bal] = await Promise.all([chain.getBlockNumber(), chain.getBalance({ address: pot })]);
        if (!stop) {
          setBlock(b);
          setPotGbp(weiToGbp(bal));
        }
      } catch {}
    };
    tick();
    const id = setInterval(tick, 2000);
    (async () => {
      try {
        const n = Number(await chain.readContract({ address: pot, abi: DEBT_POTS_ABI, functionName: "creditorCount" }));
        const list = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            chain.readContract({ address: pot, abi: DEBT_POTS_ABI, functionName: "getCreditor", args: [BigInt(i)] })
          )
        );
        if (!stop)
          setRules(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            list.map((c: any) => ({
              label: c.label,
              bps: Number(c.proRataShareBps),
              priorityGbp: weiToGbp(c.priorityFixedAmountWei),
              isPriority: c.isPriority,
            }))
          );
      } catch {}
    })();
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [pot]);

  // Every transaction on the page is checked against Monad from this browser.
  useEffect(() => {
    if (!proof) return;
    const hashes = new Set<string>([...proof.ledger.map((e) => e.tx), ...proof.runs.flatMap((r) => (r.tx ? [r.tx] : []))]);
    hashes.forEach(async (h) => {
      if (verified[h]) return;
      try {
        const r = await chain.getTransactionReceipt({ hash: h as `0x${string}` });
        if (r.status === "success") setVerified((v) => ({ ...v, [h]: r.blockNumber }));
      } catch {}
    });
  }, [proof, verified]);

  // What the contract's own rules will pay for the amount entered.
  const preview = useMemo(() => {
    const total = Number(amount);
    if (!(total > 0) || rules.length === 0) return [];
    let left = total;
    const out: { label: string; gbp: number; isPriority: boolean }[] = [];
    for (const c of rules.filter((r) => r.isPriority)) {
      const pay = Math.min(c.priorityGbp, left);
      out.push({ label: c.label, gbp: pay, isPriority: true });
      left -= pay;
    }
    for (const c of rules.filter((r) => !r.isPriority && r.bps > 0)) out.push({ label: c.label, gbp: (left * c.bps) / 10000, isPriority: false });
    return out;
  }, [amount, rules]);

  async function runIt() {
    setStarting(true);
    setRunError(null);
    try {
      const res = await fetch(`${API_URL}/proof/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_gbp: Number(amount) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Couldn't start a run just now.");
      setRunStart(Date.now() / 1000 - 5);
      refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  const tx = (hash: string) => `${proof?.explorer}/tx/${hash}`;
  const addr = (a: string) => `${proof?.explorer}/address/${a}`;

  // The cycle on show: the one the visitor started, or else the latest one.
  const lastPayday = proof?.ledger.find((e) => e.kind === "payday");
  const since = runStart ?? (lastPayday ? lastPayday.at - 1 : Infinity);
  const payday = proof?.ledger.find((e) => e.kind === "payday" && e.at >= since);
  const paidRun = proof?.runs.find((r) => r.outcome === "paid" && Date.parse(r.at) / 1000 >= since - 60);
  const payouts = proof?.ledger.filter((e) => e.kind === "paid" && e.at >= since) ?? [];
  const transfers = proof?.transfers.filter((t) => Date.parse(t.at) / 1000 >= since) ?? [];

  const done = [!!payday, !!paidRun || payouts.length > 0, payouts.length > 0, transfers.length >= Math.max(payouts.length, 1)];
  const first = done.indexOf(false);
  const state = (i: number): StageState => (done[i] ? "done" : i === first && (runStart || payday) ? "active" : "waiting");

  const lastCheck = proof?.runs[0];

  return (
    <div className="wrap">
      <TopBar back="/" />
      <h1 className="h2">See it working</h1>
      <p className="text-[15px] leading-[1.45] text-muted -mt-2">
        Don&apos;t take our word for it. This demo pot is watched by the same automation as every user&apos;s pot. Send it a test
        payday and watch each step happen, then check every one on the public Monad ledger.
      </p>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span className="flex items-center gap-1.5 font-semibold text-safe">
            <span className="w-2 h-2 rounded-full bg-safe animate-pulse" /> Live from Monad testnet
          </span>
          <span className="font-mono">block {block ? block.toLocaleString("en-GB") : "…"}</span>
        </div>
        <div className="row">
          <span>In the pot right now</span>
          <span>{potGbp === null ? "…" : gbp(potGbp, 2)}</span>
        </div>
        {rules.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">Payout rules, read from the contract</span>
            {rules
              .filter((r) => r.isPriority || r.bps > 0)
              .map((r) => (
                <div key={r.label} className="row text-[13px]">
                  <span>{r.label}</span>
                  <span>{r.isPriority ? `first ${gbp(r.priorityGbp, 2)} (priority)` : `${(r.bps / 100).toFixed(2)}% of the rest`}</span>
                </div>
              ))}
          </div>
        )}
      </section>

      <label className="field">
        Test payday amount (£10 to £500)
        <input
          type="number"
          inputMode="decimal"
          min={10}
          max={500}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="For example, 200"
          className="input"
        />
      </label>
      {preview.length > 0 && (
        <div className="card flex flex-col gap-1 text-[13px]">
          <span className="text-[12px] font-semibold text-muted">The contract will pay</span>
          {preview.map((p) => (
            <div key={p.label} className="row">
              <span>{p.label}</span>
              <span>{gbp(p.gbp, 2)}</span>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn"
        onClick={runIt}
        disabled={starting || !proof || !(Number(amount) >= 10 && Number(amount) <= 500)}
      >
        {starting ? "Sending the payday…" : amount ? `Send a ${gbp(Number(amount) || 0, 2)} test payday` : "Enter an amount to send"}
      </button>
      {runError && <p className="error -mt-2">{runError}</p>}

      <ProgressBar value={done.filter(Boolean).length} active={!!runStart && done.includes(false)} />

      <ol className="relative flex flex-col gap-0">
        <Stage
          n={1}
          state={state(0)}
          title="Payday lands in the pot"
          detail={payday ? `${gbp(payday.amount_gbp, 2)} arrived` : "Waiting for a payday"}
          link={payday && { href: tx(payday.tx), text: verified[payday.tx] ? `Deposit verified on-chain, block ${verified[payday.tx].toLocaleString("en-GB")}` : "Deposit transaction" }}
        />
        <Stage
          n={2}
          state={state(1)}
          title="Chainlink spots it and triggers payment"
          detail={
            paidRun
              ? `Triggered at ${new Date(paidRun.at).toLocaleTimeString("en-GB")}`
              : `Checks every 2 minutes${lastCheck ? `, last checked at ${new Date(lastCheck.at).toLocaleTimeString("en-GB")}` : ""}`
          }
          link={
            paidRun?.tx
              ? {
                  href: tx(paidRun.tx),
                  text: verified[paidRun.tx] ? `Chainlink report verified on-chain, block ${verified[paidRun.tx].toLocaleString("en-GB")}` : "Chainlink report transaction",
                }
              : undefined
          }
        />
        <Stage
          n={3}
          state={state(2)}
          title="The pot pays each creditor their share"
          detail={payouts.length ? "Priority debts first, then a fair split" : "Rules in the contract, nobody can change them"}
        >
          {payouts.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
              {[...payouts].reverse().map((p) => (
                <li key={p.tx + p.label} className="row">
                  <span>
                    {p.label}
                    {p.priority && <span className="ml-1.5 text-[10px] font-bold bg-butter text-ink px-1.5 py-0.5 rounded-[3px]">priority</span>}
                  </span>
                  <a href={tx(p.tx)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    {gbp(p.amount_gbp, 2)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Stage>
        <Stage
          n={4}
          state={state(3)}
          title="Creditors get a bank transfer in pounds"
          detail={transfers.length ? "With each creditor's own reference" : "Sent by bank transfer (Revolut Business sandbox)"}
          last
        >
          {transfers.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-muted">
              {transfers.map((t) => (
                <li key={t.at + t.text}>✓ {t.text}</li>
              ))}
            </ul>
          )}
        </Stage>
      </ol>

      <section className="card flex flex-col gap-2 text-[13px]">
        <h2 className="font-semibold text-[15px]">Check it yourself</h2>
        <a className="row underline-offset-2" href={proof ? addr(proof.addresses.pot) : "#"} target="_blank" rel="noopener noreferrer">
          <span>The pot (every payday and payout)</span>
          <span className="underline">MonadScan →</span>
        </a>
        <a className="row" href={proof ? addr(proof.addresses.automation) : "#"} target="_blank" rel="noopener noreferrer">
          <span>Automation contract</span>
          <span className="underline">MonadScan →</span>
        </a>
        <a className="row" href={proof ? addr(proof.addresses.receiver) : "#"} target="_blank" rel="noopener noreferrer">
          <span>Chainlink report receiver</span>
          <span className="underline">MonadScan →</span>
        </a>
        <a className="row" href={`${REPO}/blob/main/contracts/src/DebtPots.sol`} target="_blank" rel="noopener noreferrer">
          <span>The contract&apos;s code (and its tests)</span>
          <span className="underline">GitHub →</span>
        </a>
      </section>

      {proof && proof.runs.length > 0 && (
        <details className="card text-[13px]">
          <summary className="cursor-pointer font-semibold text-[15px]">Automation log</summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-[12px]">
            {proof.runs.map((r) => (
              <li key={r.at} className="flex justify-between gap-2">
                <span>{new Date(r.at).toLocaleTimeString("en-GB")}</span>
                {r.tx ? (
                  <a href={tx(r.tx)} target="_blank" rel="noopener noreferrer" className="underline text-safe font-semibold">
                    paid out →
                  </a>
                ) : (
                  <span className="text-muted">{r.outcome === "checked" ? "checked, nothing due" : "check failed"}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[12px] leading-[1.45] text-muted">
        Test network and sandbox banks: no real money moves. The pounds-to-tokens step is simulated. Chainlink&apos;s workflow runs in
        the official simulator and broadcasts its signed report through Chainlink&apos;s forwarder on Monad testnet.
      </p>
      <DemoTag />
    </div>
  );
}

function Stage({
  n,
  state,
  title,
  detail,
  link,
  last,
  children,
}: {
  n: number;
  state: StageState;
  title: string;
  detail: string;
  link?: { href: string; text: string } | false;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-5">
      {!last && (
        <span aria-hidden="true" className={`absolute left-[17px] top-9 bottom-0 w-[2px] ${state === "done" ? "bg-safe" : "bg-line"}`}>
          {state === "active" && <span className="flow-dot" />}
        </span>
      )}
      <span
        className={`relative z-10 flex-none w-9 h-9 rounded-full grid place-items-center text-sm font-bold ${
          state === "done" ? "bg-safe text-mint" : state === "active" ? "bg-butter text-ink animate-pulse" : "bg-card border-[1.5px] border-line text-muted"
        }`}
      >
        {state === "done" ? "✓" : n}
      </span>
      <div className="flex-1 min-w-0 pt-1">
        <p className={`font-semibold text-[15px] ${state === "waiting" ? "text-muted" : ""}`}>{title}</p>
        <p className="text-[13px] text-muted">{detail}</p>
        {link && (
          <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold underline underline-offset-2">
            {link.text} →
          </a>
        )}
        {children}
      </div>
    </li>
  );
}

function ProgressBar({ value, active }: { value: number; active: boolean }) {
  const pct = (value / 4) * 100;
  return (
    <div className="flex flex-col gap-1" aria-label={`${value} of 4 steps complete`}>
      <div className="relative h-3 rounded-full bg-line overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-safe transition-all duration-700" style={{ width: `${pct}%` }} />
        {active && <div className="progress-coin" style={{ left: `calc(${pct}% - 6px)` }} />}
      </div>
      <span className="text-[12px] text-muted">
        {value === 4 ? "All four steps complete." : active ? `Step ${value + 1} of 4 in progress…` : `${value} of 4 steps complete.`}
      </span>
    </div>
  );
}
