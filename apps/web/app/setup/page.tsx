import { OwnerSetup } from "../../components/owner-setup";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

export const metadata = { title: "Owner setup | Guardian Wallet" };
export default function SetupPage() { if (process.env.REVIEW_ONLY === "true") redirect("/review"); return <OwnerSetup />; }
