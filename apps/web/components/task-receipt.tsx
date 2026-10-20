import { developmentChain, type PaymentAttempt, type PaymentTask } from "@guardian-wallet/shared";
import { CopyHashButton } from "./copy-hash-button";
import { UiIcon } from "./ui-icon";
import { explainWalletError } from "../lib/api-error";

function Transaction({ label, hash, linkLabel, local }: { label: string; hash: string; linkLabel: string; local: boolean }) {
  return <div className="transaction-receipt"><span className="label">{label}</span><div className="receipt-hash"><code>{hash}</code><CopyHashButton value={hash} /></div>{local ? <small>Confirmed local-fork transaction</small> : <a className="setup-link" href={`${developmentChain.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">{linkLabel} ↗</a>}</div>;
}

export function TaskReceipt({ task, operation, local }: { task: PaymentTask; operation?: PaymentAttempt; local: boolean }) {
  const escrow = task.escrow;
  const stages = escrow ? [
    { label: "Funds locked", done: Boolean(escrow.lockTransactionHash), icon: "lock" as const },
    { label: escrow.status === "refunded" ? "Refund confirmed" : "Provider release", done: escrow.status === "released" || escrow.status === "refunded", icon: "receipt" as const },
    { label: "Service verified", done: task.status === "completed", icon: "database" as const },
  ] : [
    { label: "Invoice planned", done: Boolean(task.plan), icon: "receipt" as const },
    { label: "Payment confirmed", done: operation?.status === "confirmed", icon: "wallet" as const },
    { label: "Service verified", done: task.status === "completed", icon: "database" as const },
  ];
  return <div className="task-receipt-content">
    <span className="label">Task status</span><h3 className={`receipt-status status-${task.status}`}>{task.status.replaceAll("_", " ")}</h3>
    <p className="setup-detail">{task.reason ? explainWalletError(task.reason) : task.plan?.summary}</p>
    {["draft", "queued", "planned", "waiting", "needs_owner", "rejected"].includes(task.status) && task.quote.validUntil <= Date.now() / 1000 && <p className="setup-error">This invoice expired at {new Date(task.quote.validUntil * 1000).toLocaleString()}. Request a new database quote; this old invoice cannot be executed.</p>}
    <ol className="settlement-timeline" aria-label="Settlement progress">{stages.map((stage) => <li className={stage.done ? "is-complete" : ""} key={stage.label}><span><UiIcon name={stage.done ? "check" : stage.icon} /></span>{stage.label}</li>)}</ol>
    <details className="receipt-invoice"><summary>Invoice and operation details</summary><span className="label">Invoice ID</span><code>{task.quote.invoiceId}</code>{operation && <><span className="label">{operation.settlementMode === "escrow" ? "Escrow lock operation" : "Operation"} · {operation.status}</span><code>{operation.userOperationHash}</code></>}</details>
    {operation?.transactionHash && <Transaction label="Confirmed transaction" hash={operation.transactionHash} linkLabel="Inspect public transaction" local={local} />}
    {escrow && <><div className="escrow-status-bar"><UiIcon name="shield" /><strong>Service escrow · {escrow.status}</strong></div><p className="setup-detail">Refund deadline: {new Date(escrow.refundAfter * 1000).toLocaleString()}</p>
      {escrow.lockTransactionHash && <Transaction label="Escrow lock" hash={escrow.lockTransactionHash} linkLabel="View escrow lock on Base Sepolia" local={local} />}
      {escrow.releaseTransactionHash && <Transaction label="Escrow release" hash={escrow.releaseTransactionHash} linkLabel="View escrow release on Base Sepolia" local={local} />}
      {escrow.refundTransactionHash && <Transaction label="Escrow refund" hash={escrow.refundTransactionHash} linkLabel="View escrow refund on Base Sepolia" local={local} />}
    </>}
  </div>;
}
