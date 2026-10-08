import { type NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

// Demo-only: gives a new tester's embedded wallet enough testnet MON for gas
// (their own DebtPots deploy + a few transactions). Only tops up wallets that
// are nearly empty, so repeat calls don't drain the faucet.
const TOP_UP = parseEther("0.3");
const ONLY_BELOW = parseEther("0.25");

export const POST = async (req: NextRequest) => {
  const key = process.env.DEMO_FAUCET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return NextResponse.json({ error: "Faucet not configured" }, { status: 503 });

  const { address } = (await req.json()) as { address?: string };
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
  const balance = await publicClient.getBalance({ address });
  if (balance >= ONLY_BELOW) return NextResponse.json({ toppedUp: false });

  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http() });
  const hash = await wallet.sendTransaction({ to: address, value: TOP_UP });
  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ toppedUp: true, hash });
};
