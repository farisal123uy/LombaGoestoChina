import { createHash, randomBytes } from "node:crypto";
import { verifyMessage, type Address, type Hex } from "viem";

export class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}

/** Single-instance short-lived login sessions; no transaction authority is granted. */
export class OwnerAuth {
  private readonly challenges = new Map<string, { address: Address; message: string; expires: number }>();
  private readonly sessions = new Map<string, { address: Address; expires: number }>();
  constructor(private readonly owner: Address, private readonly domain: string, private readonly chainId: number, private readonly clock = Date.now) {}

  private prune() {
    for (const [id, item] of this.challenges) if (item.expires <= this.clock()) this.challenges.delete(id);
    for (const [id, item] of this.sessions) if (item.expires <= this.clock()) this.sessions.delete(id);
  }
  challenge(address: Address) {
    this.prune();
    if (address.toLowerCase() !== this.owner.toLowerCase()) throw new ApiError(403, "OWNER_NOT_REGISTERED");
    if (this.challenges.size >= 64) throw new ApiError(429, "TOO_MANY_CHALLENGES");
    const nonce = randomBytes(24).toString("hex");
    const expires = this.clock() + 300000;
    const message = `${this.domain} requests Guardian Wallet sign-in.\nAddress: ${address}\nChain ID: ${this.chainId}\nNonce: ${nonce}\nIssued at: ${new Date(this.clock()).toISOString()}\nExpires at: ${new Date(expires).toISOString()}\nThis signature authenticates API access. It does not authorize transactions or change wallet policy.`;
    this.challenges.set(nonce, { address, message, expires });
    return { nonce, message, expiresAt: new Date(expires).toISOString() };
  }
  async verify(address: Address, nonce: string, signature: Hex) {
    this.prune();
    const challenge = this.challenges.get(nonce);
    // Consume synchronously before async verification to stop concurrent replay.
    this.challenges.delete(nonce);
    if (!challenge || challenge.address.toLowerCase() !== address.toLowerCase() || challenge.expires <= this.clock()) throw new ApiError(401, "INVALID_NONCE");
    if (!await verifyMessage({ address, message: challenge.message, signature })) throw new ApiError(401, "INVALID_SIGNATURE");
    if (this.sessions.size >= 64) throw new ApiError(429, "TOO_MANY_SESSIONS");
    const token = randomBytes(32).toString("hex");
    this.sessions.set(createHash("sha256").update(token).digest("hex"), { address, expires: this.clock() + 900000 });
    return { token, expiresInSeconds: 900 };
  }
  authenticate(header: string | undefined) {
    this.prune();
    const token = header?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
    if (!token) throw new ApiError(401, "AUTH_REQUIRED");
    const session = this.sessions.get(createHash("sha256").update(token).digest("hex"));
    if (!session || session.expires <= this.clock()) throw new ApiError(401, "SESSION_EXPIRED");
    return session.address;
  }
}
