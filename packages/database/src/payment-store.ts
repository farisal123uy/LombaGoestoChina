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
  batchCandidates?: PaymentTask[];
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
        AND status IN ('draft','queued','planned','waiting','needs_owner','rejected')
        AND NOT EXISTS (SELECT 1 FROM payment_attempts WHERE task_id=$1)
        AND NOT EXISTS (SELECT 1 FROM payment_attempt_members WHERE task_id=$1) RETURNING id`, [task.id, task.owner.toLowerCase(), JSON.stringify(task), task.status]);
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

  /** Owner-scoped operational actions never discard an existing operation. */
  async manageTask(id: string, owner: string, key: string, action: "cancel" | "retry_delivery"): Promise<PaymentTask> {
    return this.db.transaction(async (db) => {
      const [lock] = await db.query<{ available: boolean }>("SELECT lease_until <= to_timestamp($2::double precision/1000) AS available FROM execution_locks WHERE account_key=$1 FOR UPDATE", [key, this.clock()]);
      const [row] = await db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE id=$1 AND owner_address=$2 AND account_key=$3 FOR UPDATE", [id, owner.toLowerCase(), key]);
      if (!row) throw new Error("TASK_NOT_FOUND");
      const task = row.payload;
      if (action === "retry_delivery" && !task.offerId) throw new Error("CONFIRMED_PAYMENT_REQUIRED_FOR_DELIVERY");
      if (action === "cancel" && task.status === "cancelled") return task;
      if (action === "retry_delivery" && ["paid", "service_pending", "completed"].includes(task.status)) return task;
      if (!lock?.available) throw new Error("TASK_BUSY");
      const [attempt] = await db.query<{ record: PaymentAttempt }>(`SELECT a.record FROM payment_tasks t LEFT JOIN payment_attempt_members m ON m.task_id=t.id
        JOIN payment_attempts a ON a.task_id=COALESCE(m.attempt_task_id,t.id) WHERE t.id=$1`, [id]);
      let payload: PaymentTask;
      if (action === "cancel") {
        if (attempt || !["draft", "queued", "planned", "waiting", "needs_owner", "rejected"].includes(task.status)) throw new Error("TASK_ALREADY_SUBMITTED");
        payload = { ...task, status: "cancelled", reason: "CANCELLED_BY_OWNER" };
      } else {
        if (task.status !== "needs_owner" || !task.offerId || task.delivery || attempt?.record.status !== "confirmed" || !attempt.record.transactionHash) throw new Error("CONFIRMED_PAYMENT_REQUIRED_FOR_DELIVERY");
        if ((task.deliveryRetryCycles ?? 0) >= 3) throw new Error("DELIVERY_RETRY_LIMIT");
        payload = { ...task, status: "service_pending", reason: undefined, deliveryTotalAttempts: task.deliveryTotalAttempts ?? task.deliveryAttempts ?? 0, deliveryAttempts: 0, deliveryRetryCycles: (task.deliveryRetryCycles ?? 0) + 1 };
      }
      await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status=$3,next_action_at=to_timestamp($4::double precision/1000) WHERE id=$1", [id, JSON.stringify(payload), payload.status, this.clock()]);
      return payload;
    });
  }

  async listTasks(owner: string): Promise<PaymentTask[]> {
    const rows = await this.db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE owner_address=$1 ORDER BY created_at DESC LIMIT 100", [owner.toLowerCase()]);
    return rows.map((r) => r.payload);
  }

  async listAccountTasks(owner: string, key: string): Promise<PaymentTask[]> {
    const rows = await this.db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE owner_address=$1 AND account_key=$2 ORDER BY created_at DESC,id", [owner.toLowerCase(), key]);
    return rows.map((row) => row.payload);
  }

  async listActiveAttempts(key: string): Promise<PaymentAttempt[]> {
    const rows = await this.db.query<{ record: PaymentAttempt }>("SELECT record FROM payment_attempts WHERE account_key=$1 AND status NOT IN ('confirmed','failed')", [key]);
    return rows.map((row) => row.record);
  }

  /** Release only reviewed drafts/tasks; starting the scheduler is a separate operation. */
  async queueReviewedTasks(tasks: PaymentTask[], capacityUnits: string): Promise<PaymentTask[]> {
    if (!tasks.length || tasks.length > 10 || new Set(tasks.map((task) => task.id)).size !== tasks.length) throw new Error("INVALID_BATCH_SIZE");
    const first = tasks[0]!, key = accountKey(first.chainId, first.quote.account);
    if (tasks.some((task) => task.owner.toLowerCase() !== first.owner.toLowerCase() || accountKey(task.chainId, task.quote.account) !== key || task.quote.token.toLowerCase() !== first.quote.token.toLowerCase() || task.status !== "planned" || !task.plan)) throw new Error("TASK_BINDING");
    return this.db.transaction(async (db) => {
      const [lock] = await db.query<{ available: boolean }>("SELECT lease_until <= to_timestamp($2::double precision/1000) AS available FROM execution_locks WHERE account_key=$1 FOR UPDATE", [key, this.clock()]);
      if (!lock?.available) throw new Error("TASK_BUSY");
      const active = await db.query("SELECT task_id FROM payment_attempts WHERE account_key=$1 AND status NOT IN ('confirmed','failed')", [key]);
      if (active.length) throw new Error("TASK_BUSY");
      const rows = await db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE account_key=$1 AND owner_address=$2 FOR UPDATE", [key, first.owner.toLowerCase()]);
      const ids = new Set(tasks.map((task) => task.id));
      const pending = rows.map((row) => row.payload).filter((task) => !ids.has(task.id) && task.quote.token.toLowerCase() === first.quote.token.toLowerCase() && (["queued", "planned", "executing"].includes(task.status) || (task.status === "waiting" && task.reason === "WAITING_FEE")));
      const total = [...pending, ...tasks].reduce((sum, task) => sum + BigInt(task.quote.amountUnits), 0n);
      if (total > BigInt(capacityUnits)) throw new Error("QUEUE_BUDGET_CHANGED");
      for (const task of tasks) {
        const current = rows.find((row) => row.payload.id === task.id)?.payload;
        if (!current || !["draft", "queued", "planned", "waiting", "needs_owner", "rejected"].includes(current.status) || current.instruction !== task.instruction || current.paymentId !== task.paymentId || Object.entries(current.quote).some(([field, value]) => task.quote[field as keyof typeof task.quote] !== value)) throw new Error("TASK_BUSY");
        const plan = task.plan!;
        if (plan.taskId !== task.id || plan.chainId !== task.chainId || plan.account.toLowerCase() !== task.quote.account.toLowerCase() || plan.quotes.length !== 1 || Object.entries(task.quote).some(([field, value]) => plan.quotes[0]?.[field as keyof typeof task.quote] !== value) || plan.validUntil <= Math.floor(this.clock() / 1000)) throw new Error("INVALID_REVIEWED_PLAN");
        const attempts = await db.query("SELECT task_id FROM payment_attempts WHERE task_id=$1 UNION SELECT task_id FROM payment_attempt_members WHERE task_id=$1", [task.id]);
        if (attempts.length) throw new Error("TASK_BUSY");
        await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status='planned',next_action_at=to_timestamp($3::double precision/1000) WHERE id=$1", [task.id, JSON.stringify(task), this.clock()]);
      }
      return tasks;
    });
  }

  async getAttempt(id: string, owner: string): Promise<PaymentAttempt | undefined> {
    const [row] = await this.db.query<{ record: PaymentAttempt }>(`SELECT a.record FROM payment_tasks t
      LEFT JOIN payment_attempt_members m ON m.task_id=t.id JOIN payment_attempts a ON a.task_id=COALESCE(m.attempt_task_id,t.id)
      WHERE t.id=$1 AND t.owner_address=$2`, [id, owner.toLowerCase()]);
    return row && { ...row.record, taskId: id, ...(row.record.taskId !== id ? { leaderTaskId: row.record.taskId } : {}) };
  }

  async setPaused(key: string, paused: boolean) {
    await this.db.query("INSERT INTO worker_controls (account_key, paused) VALUES ($1,$2) ON CONFLICT (account_key) DO UPDATE SET paused=EXCLUDED.paused", [key, paused]);
  }

  async isPaused(key: string) {
    const [row] = await this.db.query<{ paused: boolean }>("SELECT paused FROM worker_controls WHERE account_key=$1", [key]);
    return row?.paused ?? true;
  }

  async claim(key: string, workerId: string, leaseMs = 90000, maxBatchSize = 1): Promise<PaymentClaim | undefined> {
    if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1 || maxBatchSize > 10) throw new Error("INVALID_BATCH_SIZE");
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
        if (control?.paused === false) [row] = await db.query<{ payload: PaymentTask }>(`SELECT payload FROM payment_tasks WHERE account_key=$1 AND
          (status IN ('queued','planned') OR (status='waiting' AND payload->>'reason'='WAITING_FEE' AND next_action_at<=to_timestamp($2::double precision/1000))) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`, [key, now]);
      }
      if (!row) {
        await db.query("UPDATE execution_locks SET lease_until=to_timestamp($3::double precision/1000) WHERE account_key=$1 AND worker_id=$2", [key, workerId, now]);
        return;
      }
      const extra = maxBatchSize > 1 && !row.record && ["queued", "planned", "waiting"].includes(row.payload.status)
        ? await db.query<{ payload: PaymentTask }>("SELECT payload FROM payment_tasks WHERE account_key=$1 AND owner_address=$2 AND id<>$3 AND status='planned' ORDER BY created_at,id LIMIT $4 FOR UPDATE SKIP LOCKED", [key, row.payload.owner.toLowerCase(), row.payload.id, maxBatchSize - 1]) : [];
      return { task: row.payload, accountKey: key, workerId, fence: lock.fence, attempt: row.record, signedPayload: row.signed_payload, batchCandidates: extra.map((item) => item.payload) };
    });
  }

  async updateTask(claim: PaymentClaim, status: PaymentTaskStatus, reason?: string, plan?: PaymentPlan) {
    await this.fenced(claim, async (db) => {
      const payload: PaymentTask = { ...claim.task, status, reason, plan: plan ?? claim.task.plan };
      await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status=$3,next_action_at=to_timestamp($4::double precision/1000) WHERE id=$1", [claim.task.id, JSON.stringify(payload), status, this.clock() + (reason === "WAITING_FEE" ? 10000 : 0)]);
      claim.task = payload;
    });
  }

  async prepare(claim: PaymentClaim, attempt: PaymentAttempt, signedPayload: string, batch?: { tasks: PaymentTask[]; plan: PaymentPlan }) {
    await this.fenced(claim, async (db) => {
      if (attempt.taskId !== claim.task.id || attempt.status !== "prepared") throw new Error("INVALID_ATTEMPT");
      const tasks = batch?.tasks || [claim.task], ids = tasks.map((task) => task.id);
      if (!ids.length || ids.length > 10 || ids[0] !== claim.task.id || new Set(ids).size !== ids.length || (batch && (batch.plan.taskId !== claim.task.id || batch.plan.quotes.length !== ids.length || batch.plan.batchTaskIds?.join() !== ids.join()))) throw new Error("INVALID_BATCH_MEMBERSHIP");
      if (batch && tasks.some((task, i) => Object.entries(task.quote).some(([key, value]) => batch.plan.quotes[i]?.[key as keyof typeof task.quote] !== value))) throw new Error("BATCH_QUOTE_BINDING_FAILED");
      for (const task of tasks) {
        const [row] = await db.query<{ payload: PaymentTask }>(`SELECT payload FROM payment_tasks WHERE id=$1 AND account_key=$2 AND owner_address=$3 AND status IN ('queued','planned','waiting') FOR UPDATE`, [task.id, claim.accountKey, claim.task.owner.toLowerCase()]);
        if (!row || (task.id !== claim.task.id && row.payload.status !== "planned") || Object.entries(task.quote).some(([key, value]) => row.payload.quote[key as keyof typeof task.quote] !== value)) throw new Error("BATCH_TASK_CHANGED");
      }
      const record = { ...attempt, taskIds: ids };
      await db.query("INSERT INTO payment_attempts (task_id,account_key,status,record,signed_payload) VALUES ($1,$2,$3,$4::text::jsonb,$5)", [attempt.taskId, claim.accountKey, attempt.status, JSON.stringify(record), signedPayload]);
      for (const task of tasks) {
        await db.query("INSERT INTO payment_attempt_members (task_id,attempt_task_id) VALUES ($1,$2)", [task.id, claim.task.id]);
        const payload = { ...task, status: "executing" as const, ...(task.id === claim.task.id && batch ? { plan: batch.plan } : {}) };
        await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status='executing' WHERE id=$1", [task.id, JSON.stringify(payload)]);
        if (task.id === claim.task.id) claim.task = payload;
      }
      claim.attempt = record;
      claim.signedPayload = signedPayload;
    });
  }

  async updateAttempt(claim: PaymentClaim, attempt: PaymentAttempt) {
    if (attempt.status === "confirmed" || attempt.status === "failed") throw new Error("USE_ATOMIC_FINISH");
    await this.fenced(claim, async (db) => {
      if (attempt.taskId !== claim.task.id || attempt.userOperationHash !== claim.attempt?.userOperationHash) throw new Error("ATTEMPT_BINDING");
      const record = { ...attempt, taskIds: claim.attempt?.taskIds || [claim.task.id] };
      await db.query("UPDATE payment_attempts SET status=$2,record=$3::text::jsonb WHERE task_id=$1", [attempt.taskId, attempt.status, JSON.stringify(record)]);
      claim.attempt = record;
    });
  }

  async finish(claim: PaymentClaim, attempt: PaymentAttempt, status: "paid" | "needs_owner") {
    await this.fenced(claim, async (db) => {
      if (attempt.taskId !== claim.task.id || attempt.userOperationHash !== claim.attempt?.userOperationHash || !["confirmed", "failed"].includes(attempt.status)) throw new Error("ATTEMPT_BINDING");
      if ((status === "paid") !== (attempt.status === "confirmed")) throw new Error("TERMINAL_STATUS_MISMATCH");
      const record = { ...attempt, taskIds: claim.attempt?.taskIds || [claim.task.id] };
      await db.query("UPDATE payment_attempts SET status=$2,record=$3::text::jsonb WHERE task_id=$1", [attempt.taskId, attempt.status, JSON.stringify(record)]);
      const rows = await db.query<{ payload: PaymentTask }>("SELECT t.payload FROM payment_tasks t JOIN payment_attempt_members m ON m.task_id=t.id WHERE m.attempt_task_id=$1 FOR UPDATE OF t", [claim.task.id]);
      for (const task of rows.length ? rows.map((row) => row.payload) : [claim.task]) {
        const payload = { ...task, status, reason: attempt.reason };
        await db.query("UPDATE payment_tasks SET payload=$2::text::jsonb,status=$3 WHERE id=$1", [task.id, JSON.stringify(payload), status]);
        if (task.id === claim.task.id) claim.task = payload;
      }
      claim.attempt = record;
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
      const payload: PaymentTask = { ...claim.task, status, delivery, deliveryAttempts: attempts, deliveryTotalAttempts: (claim.task.deliveryTotalAttempts ?? claim.task.deliveryAttempts ?? 0) + 1, reason };
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
