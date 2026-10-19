import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNavigation } from "../components/app-navigation";
import { OwnerSessionProvider } from "../components/owner-session";
import "./theme.css";
import "./globals.css";
import "./workspace.css";
import "./light-theme.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guardian Wallet | Bounded AI Authority",
  description: "Policy-bound AI procurement, independently inspectable evidence and a disposable reviewer workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>
    <OwnerSessionProvider>
      <a className="skip-link" href="#app-content">Skip to content</a>
      <AppNavigation reviewOnly={process.env.REVIEW_ONLY === "true"} />
      <div id="app-content" className="app-content" tabIndex={-1}>{children}</div>
    </OwnerSessionProvider>
  </body></html>;
}
