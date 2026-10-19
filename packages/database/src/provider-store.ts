import type { DeliveryReceipt, OfferId, ServiceQuote } from "@guardian-wallet/shared";
import type { QueryDatabase } from "./payment-store.js";

export interface ProviderInvoice { requestId: string; accountKey: string; offerId: OfferId; quote: ServiceQuote; }
export interface ProviderNamespace { namespaceId: string; invoiceId: string; serviceHash: `0x${string}`; capacityBytes: number; receipt: DeliveryReceipt; ready?: boolean; activatedByTransaction?: `0x${string}`; }

export class ProviderStore {
  constructor(private readonly db: QueryDatabase) {}
  async invoice(id: string) {
    const [row] = await this.db.query<{ payload: ProviderInvoice }>("SELECT payload FROM provider_invoices WHERE invoice_id=$1", [id]);
    return row?.payload;
  }
  async saveInvoice(value: ProviderInvoice) {
    await this.db.query("INSERT INTO provider_invoices (invoice_id,account_key,request_id,payload) VALUES ($1,$2,$3,$4::text::jsonb) ON CONFLICT (account_key,request_id) DO NOTHING", [value.quote.invoiceId, value.accountKey, value.requestId, JSON.stringify(value)]);
    const saved = await this.invoice(value.quote.invoiceId);
    if (!saved || saved.offerId !== value.offerId) throw new Error("PROVIDER_REQUEST_ID_CONFLICT");
    return saved;
  }
  async saveNamespace(value: ProviderNamespace, ready = true) {
    await this.db.query("INSERT INTO provider_databases (namespace_id,invoice_id,payload,expires_at,ready) VALUES ($1,$2,$3::text::jsonb,to_timestamp($4),$5) ON CONFLICT (invoice_id) DO NOTHING", [value.namespaceId, value.invoiceId, JSON.stringify(value), value.receipt.expiresAt, ready]);
    const [row] = await this.db.query<{ payload: ProviderNamespace }>("SELECT payload FROM provider_databases WHERE invoice_id=$1", [value.invoiceId]);
    if (!row) throw new Error("PROVISIONING_FAILED");
    return row.payload;
  }
  async activateEscrow(invoiceId: string, releaseTransactionHash: `0x${string}`) {
    return this.db.transaction(async (db) => {
      const [row] = await db.query<{ payload: ProviderNamespace; ready: boolean; activated_by_transaction: string | null }>("SELECT payload,ready,activated_by_transaction FROM provider_databases WHERE invoice_id=$1 FOR UPDATE", [invoiceId]);
      if (!row || row.payload.receipt.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("SERVICE_NOT_AVAILABLE_OR_EXPIRED");
      if (row.ready) {
        if (row.activated_by_transaction?.toLowerCase() !== releaseTransactionHash.toLowerCase()) throw new Error("ESCROW_ACTIVATION_CONFLICT");
        return row.payload;
      }
      const payload = { ...row.payload, ready: true, activatedByTransaction: releaseTransactionHash };
      await db.query("UPDATE provider_databases SET payload=$2::text::jsonb,ready=true,activated_by_transaction=$3 WHERE invoice_id=$1", [invoiceId, JSON.stringify(payload), releaseTransactionHash]);
      return payload;
    });
  }
  async probe(id: string, probeId: string, allowPendingEscrow = false) {
    return this.db.transaction(async (db) => {
      const [row] = await db.query<{ payload: ProviderNamespace; data: Record<string, string>; probe_count: number }>("UPDATE provider_databases SET probe_count=probe_count+1,last_probe_id=$2 WHERE namespace_id=$1 AND expires_at>now() AND (ready=true OR $3=true) RETURNING payload,data,probe_count", [id, probeId, allowPendingEscrow]);
      if (!row) throw new Error("SERVICE_NOT_AVAILABLE_OR_EXPIRED");
      const [observed] = await db.query<{ last_probe_id: string }>("SELECT last_probe_id FROM provider_databases WHERE namespace_id=$1", [id]);
      if (observed?.last_probe_id !== probeId) throw new Error("SERVICE_PROBE_WRITE_READ_MISMATCH");
      return { namespaceId: id, serviceHash: row.payload.serviceHash, probeId, ready: true as const, probeCount: row.probe_count, capacityBytes: row.payload.capacityBytes, usedBytes: Buffer.byteLength(JSON.stringify(row.data)), expiresAt: row.payload.receipt.expiresAt };
    });
  }
  async values(id: string) {
    const [row] = await this.db.query<{ data: Record<string, string> }>("SELECT data FROM provider_databases WHERE namespace_id=$1 AND expires_at>now() AND ready=true", [id]);
    if (!row) throw new Error("SERVICE_NOT_AVAILABLE_OR_EXPIRED");
    return row.data;
  }
  async put(id: string, key: string, value: string) {
    return this.db.transaction(async (db) => {
      const [row] = await db.query<{ payload: ProviderNamespace; data: Record<string, string> }>("SELECT payload,data FROM provider_databases WHERE namespace_id=$1 AND expires_at>now() AND ready=true FOR UPDATE", [id]);
      if (!row) throw new Error("SERVICE_NOT_AVAILABLE_OR_EXPIRED");
      const data = { ...row.data, [key]: value };
      if (Buffer.byteLength(JSON.stringify(data)) > row.payload.capacityBytes) throw new Error("SERVICE_CAPACITY_EXCEEDED");
      await db.query("UPDATE provider_databases SET data=$2::text::jsonb WHERE namespace_id=$1", [id, JSON.stringify(data)]);
      return { stored: true, key };
    });
  }
}
