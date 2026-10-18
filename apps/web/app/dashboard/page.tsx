import type { Metadata } from "next";
import { FinancialDashboard } from "../../components/financial-dashboard";
export const metadata: Metadata = { title: "Astra dashboard | Guardian Wallet", description: "Owner-only Guardian Wallet runtime dashboard." };
export default function DashboardPage() { return <FinancialDashboard />; }
