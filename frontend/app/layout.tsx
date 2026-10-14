import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import PrivyProvider from "./components/privy-provider";
import BottomNav from "./components/BottomNav";
import { DemoBanner } from "./components/ui";

const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-bricolage" });

const APP_NAME = "Breathing Room";
const APP_DEFAULT_TITLE = "Breathing Room";
const APP_TITLE_TEMPLATE = "%s - Breathing Room";
const APP_DESCRIPTION = "Debts managed, on autopilot.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
    // startUpImage: [],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#2445B5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${atkinson.variable} ${bricolage.variable}`}
      >
        <PrivyProvider>
          <DemoBanner />
          {children}
          <BottomNav />
        </PrivyProvider>
      </body>
    </html>
  );
}
