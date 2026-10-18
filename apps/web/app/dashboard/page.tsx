import { FinancialDashboard } from "../../components/financial-dashboard";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Astra dashboard | Guardian Wallet" };
export default function DashboardPage() { if (process.env.REVIEW_ONLY === "true") redirect("/review"); return <FinancialDashboard />; }
