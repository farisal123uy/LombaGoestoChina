import postgres from "postgres";
import type { DeliveryReceipt, PaymentAttempt, PaymentPlan, PaymentTask, PaymentTaskStatus } from "@guardian-wallet/shared";

type Parameter = string | number | boolean | null;
// JSON parameters are encoded strings: cast through text so postgres.js does not
// infer jsonb and JSON.stringify the string a second time (unlike PGlite).
export interface QueryDatabase {
  query<T extends object>(statement: string, parameters?: Parameter[]): Promise<T[]>;
  transaction<T>(body: (db: QueryDatabase) => Promise<T>): Promise<T>;
}
export interface PaymentClaim {
  task: PaymentTask;
  accountKey: string;
  workerId: string;
  fence: string;
  attempt?: PaymentAttempt;
  signedPayload?: string;
}
export const accountKey = (chainId: number, account: string) => `${chainId}:${account.toLowerCase()}`;

/** SQL-backed queue. One durable in-flight attempt per account survives lease loss. */
export class PaymentStore {
  constructor(private readonly db: QueryDatabase, private readonly clock = Date.now) {}

  async createTask(task: PaymentTask): Promise<PaymentTask> {
    await this.db.query("INSERT INTO execution_locks (account_key,worker_id,fence,lease_until) VALUES ($1,'',0,to_timestamp(0)) ON CONFLICT (account_key) DO NOTHING", [accountKey(task.chainId, task.quote.account)]);
    await this.db.query("INSERT INTO payment_tasks (id, account_key, owner_address, payment_id, payload, status) VALUES ($1,$2,$3,$4,$5::text::jsonb,$6) ON CONFLICT (payment_id) DO NOTHING", [task.id, accountKey(task.chainId, task.quote.account), task.owner.toLowerCase(), task.paymentId, JSON.stringify(task), task.status]);
    const [row] = await this.db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE payment_id=$1 AND owner_address=$2", [task.paymentId, task.owner.toLowerCase()]);
    if (!row) throw new Error("PAYMENT_OWNERSHIP_CONFLICT");
    return row.payload;
  }

  async replaceUnsubmittedTask(task: PaymentTask) {
    await this.db.transaction(async (db) => {
      const key = accountKey(task.chainId, task.quote.account);
      const [lock] = await db.query<{ available: boolean }>("SELECT lease_until <= to_timestamp($2::double precision/1000) AS available FROM execution_locks WHERE account_key=$1 FOR UPDATE", [key, this.clock()]);
      if (!lock?.available) throw new Error("TASK_BUSY");
      const rows = await db.query(`UPDATE payment_tasks SET payload=$3::text::jsonb,status=$4 WHERE id=$1 AND owner_address=$2
        AND status IN ('queued','planned','waiting','needs_owner','rejected')
        AND NOT EXISTS (SELECT 1 FROM payment_attempts WHERE task_id=$1) RETURNING id`, [task.id, task.owner.toLowerCase(), JSON.stringify(task), task.status]);
      if (!rows.length) throw new Error("TASK_BUSY");
    });
  }

  async getTask(id: string, owner: string): Promise<PaymentTask | undefined> {
    const [row] = await this.db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE id=$1 AND owner_address=$2", [id, owner.toLowerCase()]);
    return row?.payload;
  }
  async getByPaymentId(id: string, owner: string) {
    const [row] = await this.db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE payment_id=$1 AND owner_address=$2", [id, owner.toLowerCase()]);
    return row?.payload;
  }

  async listTasks(owner: string): Promise<PaymentTask[]> {
    const rows = await this.db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE owner_address=$1 ORDER BY created_at DESC LIMIT 100", [owner.toLowerCase()]);
    return rows.map((r) => r.payload);
  }

  async getAttempt(id: string, owner: string): Promise<PaymentAttempt | undefined> {
    const [row] = await this.db.query<{ record: PaymentAttempt }>("SELECT a.record FROM payment_attempts a JOIN payment_tasks t ON t.id=a.task_id WHERE t.id=$1 AND t.owner_address=$2", [id, owner.toLowerCase()]);
    return row?.record;
  }

  async setPaused(key: string, paused: boolean) {
    await this.db.query("INSERT INTO worker_controls (account_key, paused) VALUES ($1,$2) ON CONFLICT (account_key) DO UPDATE SET paused=EXCLUDED.paused", [key, paused]);
  }

  async isPaused(key: string) {
    const [row] = await this.db.query<{ paused: boolean }>("SELECT paused FROM worker_controls WHERE account_key=$1", [key]);
    return row?.paused ?? true;
  }

  async claim(key: string, workerId: string, leaseMs = 90000): Promise<PaymentClaim | undefined> {
    return this.db.transaction(async (db) => {
      const now = this.clock();
      const [lock] = await db.query<{ fence: string }>(`INSERT INTO execution_locks (account_key, worker_id, fence, lease_until)
        VALUES ($1,$2,1,to_timestamp($3::double precision/1000))
        ON CONFLICT (account_key) DO UPDATE SET worker_id=EXCLUDED.worker_id, fence=execution_locks.fence+1, lease_until=EXCLUDED.lease_until
        WHERE execution_locks.lease_until <= to_timestamp($4::double precision/1000) RETURNING fence::text`, [key, workerId, now + leaseMs, now]);
      if (!lock) return;
      // Existing attempts always win, even when locally paused. Reconcile read-only.
      let [row] = await db.query<{ payload: PaymentTask; record?: PaymentAttempt; signed_payload?: string }>(`SELECT t.payload,a.record,a.signed_payload FROM payment_attempts a
        JOIN payment_tasks t ON t.id=a.task_id WHERE a.account_key=$1 AND a.status NOT IN ('confirmed','failed') LIMIT 1`, [key]);
      if (!row) {
        [row] = await db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE account_key=$1 AND status IN ('paid','service_pending') AND payload->>'offerId' IS NOT NULL AND next_action_at <= to_timestamp($2::double precision/1000) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED", [key, now]);
      }
      if (!row) {
        const [control] = await db.query<{ paused: boolean }>("SELECT paused FROM worker_controls WHERE account_key=$1", [key]);
        if (control?.paused === false) [row] = await db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE account_key=$1 AND status IN ('queued','planned') ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED", [key]);
      }
      if (!row) {
        await db.query("UPDATE execution_locks SET lease_until=to_timestamp($3::double precision/1000) WHERE account_key=$1 AND worker_id=$2", [key, workerId, now]);
        return;
      }
      return { task: row.payload, accountKey: key, workerId, fence: lock.fence, attempt: row.record, signedPayload: row.signed_payload };
    });
  }

  async updateTask(claim: PaymentClaim, status: PaymentTaskStatus, reason?: string, plan?: PaymentPlan) {
    await this.fenced(claim, async (db) => {
      const payload: PaymentTask = { ...claim.task, status, reason, plan: plan ?? claim.task.plan };
      await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status=$3 WHERE id=$1", [claim.task.id, JSON.stringify(payload), status]);
      claim.task = payload;
    });
  }

  async prepare(claim: PaymentClaim, attempt: PaymentAttempt, signedPayload: string) {
    await this.fenced(claim, async (db) => {
      if (attempt.taskId !== claim.task.id || attempt.status !== "prepared") throw new Error("INVALID_ATTEMPT");
      await db.query("INSERT INTO payment_attempts (task_id,account_key,status,record,signed_payload) VALUES ($1,$2,$3,$4::text::jsonb,$5)", [attempt.taskId, claim.accountKey, attempt.status, JSON.stringify(attempt), signedPayload]);
      const payload = { ...claim.task, status: "executing" as const };
      await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status='executing' WHERE id=$1", [claim.task.id, JSON.stringify(payload)]);
      claim.task = payload;
      claim.attempt = attempt;
      claim.signedPayload = signedPayload;
    });
  }

  async updateAttempt(claim: PaymentClaim, attempt: PaymentAttempt) {
    if (attempt.status === "confirmed" || attempt.status === "failed") throw new Error("USE_ATOMIC_FINISH");
    await this.fenced(claim, async (db) => {
      if (attempt.taskId !== claim.task.id || attempt.userOperationHash !== claim.attempt?.userOperationHash) throw new Error("ATTEMPT_BINDING");
      await db.query("UPDATE payment_attempts SET status=$2,record=$3::text::jsonb WHERE task_id=$1", [attempt.taskId, attempt.status, JSON.stringify(attempt)]);
      claim.attempt = attempt;
    });
  }

  async finish(claim: PaymentClaim, attempt: PaymentAttempt, status: "paid" | "needs_owner") {
    await this.fenced(claim, async (db) => {
      if (attempt.taskId !== claim.task.id || attempt.userOperationHash !== claim.attempt?.userOperationHash || !["confirmed", "failed"].includes(attempt.status)) throw new Error("ATTEMPT_BINDING");
      const payload = { ...claim.task, status, reason: attempt.reason };
      await db.query("UPDATE payment_attempts SET status=$2,record=$3::text::jsonb WHERE task_id=$1", [attempt.taskId, attempt.status, JSON.stringify(attempt)]);
      await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status=$3 WHERE id=$1", [claim.task.id, JSON.stringify(payload), status]);
      claim.task = payload;
      claim.attempt = attempt;
    });
  }

  async release(claim: PaymentClaim) {
    await this.db.query("UPDATE execution_locks SET lease_until=to_timestamp($4::double precision/1000) WHERE account_key=$1 AND worker_id=$2 AND fence=$3::bigint", [claim.accountKey, claim.workerId, claim.fence, this.clock()]);
  }
  async deliveryResult(claim: PaymentClaim, delivery?: DeliveryReceipt, reason?: string) {
    await this.fenced(claim, async (db) => {
      if (!["paid", "service_pending"].includes(claim.task.status)) throw new Error("TASK_NOT_PAID");
      const attempts = (claim.task.deliveryAttempts || 0) + 1;
      const status = delivery ? "completed" : attempts >= 5 ? "needs_owner" : "service_pending";
      const payload: PaymentTask = { ...claim.task, status, delivery, deliveryAttempts: attempts, reason };
      await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status=$3,next_action_at=to_timestamp($4::double precision/1000) WHERE id=$1", [claim.task.id, JSON.stringify(payload), status, this.clock() + Math.min(60000, 2000 * 2 ** attempts)]);
      claim.task = payload;
    });
  }

  async assertLease(claim: PaymentClaim) { await this.fenced(claim, async () => {}); }

  private async fenced<T>(claim: PaymentClaim, body: (db: QueryDatabase) => Promise<T>) {
    return this.db.transaction(async (db) => {
      const [row] = await db.query("SELECT fence FROM execution_locks WHERE account_key=$1 AND worker_id=$2 AND fence=$3::bigint AND lease_until > to_timestamp($4::double precision/1000) FOR UPDATE", [claim.accountKey, claim.workerId, claim.fence, this.clock()]);
      if (!row) throw new Error("LEASE_LOST");
      return body(db);
    });
  }
}

export function createPostgresQueryDatabase(url: string) {
  const sql = postgres(url, { prepare: false, connect_timeout: 10, max: 3, idle_timeout: 20 });
  function wrap(connection: Pick<typeof sql, "unsafe">, insideTransaction = false): QueryDatabase {
    return {
      query: async <T extends object>(statement: string, parameters: Parameter[] = []) => Array.from(await connection.unsafe(statement, parameters)) as T[],
      transaction: async (body) => {
        if (insideTransaction) throw new Error("NESTED_TRANSACTION_NOT_SUPPORTED");
        return sql.begin(async (tx) => body(wrap(tx, true))) as Promise<Awaited<ReturnType<typeof body>>>;
      },
    };
  }
  return { database: wrap(sql), close: () => sql.end() };
}
export function createPostgresPaymentStore(url: string) {
  const connection = createPostgresQueryDatabase(url);
  return { store: new PaymentStore(connection.database), close: connection.close };
}
