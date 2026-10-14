"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "viem/chains";

export default function PrivyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BasePrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!}
      config={{
        // Crypto stays invisible: email login only (no "connect a wallet"),
        // and no wallet confirmation popups on each transaction.
        loginMethods: ["email"],
        appearance: { theme: "#F2F4FB", accentColor: "#2445B5", landingHeader: "Log in with your email" },
        // Create embedded wallets for users who don't have a wallet
        embeddedWallets: {
          showWalletUIs: false,
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          priceDisplay: {
            primary: "native-token",
            secondary: null,
          },
        },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
