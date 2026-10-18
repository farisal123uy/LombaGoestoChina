import type { Metadata } from "next";
import { OwnerSetup } from "../../components/owner-setup";

export const metadata: Metadata = { title: "Owner setup | Guardian Wallet", description: "Owner-only Guardian Wallet deployment and bounded-session setup." };
export default function SetupPage() { return <OwnerSetup />; }
