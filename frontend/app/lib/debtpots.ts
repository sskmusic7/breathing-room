import { parseAbi, parseEther } from "viem";

import { SfsResult } from "./api";

export const DEBTPOTS_ADDRESS = process.env.NEXT_PUBLIC_DEBTPOTS_ADDRESS as `0x${string}` | undefined;

// Testnet MON stands in for pounds. Default: £1 = 0.001 MON, so a full demo
// sweep costs a fraction of one faucet drip.
export const MON_PER_GBP = process.env.NEXT_PUBLIC_MON_PER_GBP ?? "0.001";

export const DEBTPOTS_ABI = parseAbi([
  "struct Creditor { address wallet; string label; uint256 debtBalanceWei; uint256 proRataShareBps; uint256 priorityFixedAmountWei; bool isPriority; }",
  "function setAllowance(uint256 livingExpensesAllowanceWei, uint256 savingsBufferWei)",
  "function setCreditors(Creditor[] creditors)",
  "function sweep()",
  "function withdraw(uint256 amount)",
  "function owner() view returns (address)",
  "function livingExpensesAllowanceWei() view returns (uint256)",
  "function savingsBufferWei() view returns (uint256)",
  "function creditorCount() view returns (uint256)",
  "event CreditorPaid(address indexed wallet, string label, uint256 amount, bool isPriority)",
  "event PaymentFailed(address indexed wallet, string label, uint256 amount)",
  "event Disbursed(uint256 totalIn, uint256 reserved, uint256 priorityPaid, uint256 nonPriorityPaid)",
]);

/** Converts a pound amount (decimal string) to testnet wei at MON_PER_GBP. */
export function gbpToWei(gbp: string): bigint {
  const pennies = BigInt(Math.round(Number(gbp) * 100));
  return (pennies * parseEther(MON_PER_GBP)) / BigInt(100);
}

export function weiToGbp(wei: bigint): number {
  return Number((wei * BigInt(100)) / parseEther(MON_PER_GBP)) / 100;
}

export interface PreviewLine {
  label: string;
  amountGbp: number;
  kind: "protected" | "priority" | "pro_rata";
}

/**
 * Mirrors DebtPots.sweep() for a given deposit so the user can see exactly
 * where the money goes before anything moves: living costs + buffer back to
 * the debtor, priority fixed offers, then pro-rata by basis points.
 */
export function previewSweep(plan: SfsResult, depositGbp: number): PreviewLine[] {
  const reserved = Number(plan.total_outgoings) + Number(plan.savings_buffer);
  if (depositGbp < reserved) return [];
  let surplus = depositGbp - reserved;
  const lines: PreviewLine[] = [{ label: "You (living costs + savings)", amountGbp: reserved, kind: "protected" }];

  for (const a of plan.allocations) {
    const fixed = Number(a.pragmatic_offer);
    if (a.category === "priority" && fixed > 0 && surplus >= fixed) {
      surplus -= fixed;
      lines.push({ label: a.name, amountGbp: fixed, kind: "priority" });
    }
  }

  const totalBps = plan.allocations
    .filter((a) => a.category === "non_priority")
    .reduce((sum, a) => sum + a.pro_rata_share_bps, 0);
  if (totalBps > 0) {
    for (const a of plan.allocations) {
      if (a.category === "non_priority" && a.pro_rata_share_bps > 0) {
        lines.push({
          label: a.name,
          amountGbp: Math.floor(((surplus * a.pro_rata_share_bps) / totalBps) * 100) / 100,
          kind: "pro_rata",
        });
      }
    }
  }
  return lines;
}
