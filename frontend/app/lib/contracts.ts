// Trimmed from contracts/out/DebtPots.sol/DebtPots.json (forge build output) —
// only the fragments the sweep screen actually calls.
export const DEBT_POTS_ABI = [
  {
    type: "function",
    name: "creditorCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCreditor",
    inputs: [{ name: "index", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct DebtPots.Creditor",
        components: [
          { name: "wallet", type: "address", internalType: "address payable" },
          { name: "label", type: "string", internalType: "string" },
          { name: "debtBalanceWei", type: "uint256", internalType: "uint256" },
          { name: "proRataShareBps", type: "uint256", internalType: "uint256" },
          { name: "priorityFixedAmountWei", type: "uint256", internalType: "uint256" },
          { name: "isPriority", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "livingExpensesAllowanceWei",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "savingsBufferWei",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setAllowance",
    inputs: [
      { name: "_livingExpensesAllowanceWei", type: "uint256", internalType: "uint256" },
      { name: "_savingsBufferWei", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setCreditors",
    inputs: [
      {
        name: "_creditors",
        type: "tuple[]",
        internalType: "struct DebtPots.Creditor[]",
        components: [
          { name: "wallet", type: "address", internalType: "address payable" },
          { name: "label", type: "string", internalType: "string" },
          { name: "debtBalanceWei", type: "uint256", internalType: "uint256" },
          { name: "proRataShareBps", type: "uint256", internalType: "uint256" },
          { name: "priorityFixedAmountWei", type: "uint256", internalType: "uint256" },
          { name: "isPriority", type: "bool", internalType: "bool" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sweep",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const DEBT_POTS_ADDRESS = process.env.NEXT_PUBLIC_DEBT_POTS_ADDRESS as `0x${string}`;

// Demo-only GBP→MON conversion. Monad testnet MON has no real exchange rate —
// this constant exists purely so the SFS screen's GBP figures can be turned
// into on-chain wei amounts for the sweep demo, not a real FX rate.
export const GBP_TO_MON_RATE = 0.00001;

// Demo creditors are paid to the demo faucet wallet, so test payouts flow back
// into the faucet that tops up new testers instead of being lost.
export const DEMO_CREDITOR_ADDRESS = process.env.NEXT_PUBLIC_DEMO_CREDITOR_ADDRESS as `0x${string}`;

export interface OnChainCreditor {
  wallet: `0x${string}`;
  label: string;
  debtBalanceWei: bigint;
  proRataShareBps: bigint;
  priorityFixedAmountWei: bigint;
  isPriority: boolean;
}
