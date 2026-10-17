import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./theme.css";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Guardian Wallet | Development Workspace",
  description: "A foundation for goal-aware financial delegation with bounded authority.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>{children}</body></html>;
}
