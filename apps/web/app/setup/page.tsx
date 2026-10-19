import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OwnerSetup } from "../../components/owner-setup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner setup | Guardian Wallet", description: "Owner-only Guardian Wallet deployment and bounded-session setup." };
export default function SetupPage() { if (process.env.REVIEW_ONLY === "true") redirect("/review"); return <OwnerSetup />; }
