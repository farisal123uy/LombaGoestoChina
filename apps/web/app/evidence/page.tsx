import type { Metadata } from "next";
import { EvidenceLedger } from "../../components/evidence-ledger";
import { loadEvidence } from "../../lib/evidence";
import "./evidence.css";

export const metadata: Metadata = { title: "Evidence ledger | Guardian Wallet", description: "Recorded public, local-fork, and local-inference evidence with explicit boundaries." };

export default async function EvidencePage() {
  return <EvidenceLedger evidence={await loadEvidence()} />;
}
