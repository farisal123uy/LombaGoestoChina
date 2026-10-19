import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinancialDashboard } from "../../components/financial-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Astra dashboard | Guardian Wallet", description: "Owner-only Guardian Wallet runtime dashboard." };
export default function DashboardPage() { if (process.env.REVIEW_ONLY === "true") redirect("/review"); return <FinancialDashboard />; }
