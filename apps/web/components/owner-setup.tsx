"use client";

import { useCallback, useEffect, useState } from "react";

type Hex = `0x${string}`;
interface WalletProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: () => void): void;
  removeListener?(event: string, callback: () => void): void;
}
interface SetupState {
  chainId: number; owner: Hex; kernel: Hex; guardian: Hex; token: Hex;
  providerSigner: Hex; recipient: Hex; sessionSigner: Hex; validUntil: number;
  installed: boolean; ready: boolean; sessionAuthorized: boolean; runtimeConfigured: boolean;
  gasMode: string; paymaster: Hex;
  limits: { initialTokenUnits: string; protectedUnits: string; perPaymentUnits: string; dailyUnits: string; decimals: number };
  operation?: { id: string; hash: Hex; status: string; preparedAt: number; maxGasCostEth: string; transactionHash?: Hex; reason?: string };
}
const coordinator = (process.env.NEXT_PUBLIC_ONBOARDING_URL || "http://127.0.0.1:4100").replace(/\/$/, "");
const activeStates = new Set(["submitting", "submitted", "unknown"]);
const toHex = (text: string) => `0x${Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
const units = (value: string) => {
  const amount = BigInt(value), base = BigInt(1000000);
  return `${amount / base}.${(amount % base).toString().padStart(6, "0").slice(0, 2)}`;
};

async function call<T>(path: string, token?: string, body?: object): Promise<T> {
  const response = await fetch(`${coordinator}${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(60000),
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "SETUP_REQUEST_FAILED");
  return result as T;
}
function provider() {
  const wallet = (window as unknown as { ethereum?: WalletProvider }).ethereum;
  if (!wallet) throw new Error("Install or enable MetaMask, then reload this page.");
  return wallet;
}
async function switchNetwork(wallet: WalletProvider) {
  try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x14a34", chainName: "Base Sepolia", rpcUrls: ["https://sepolia.base.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia.basescan.org"] }] });
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
  }
}

export function OwnerSetup() {
  const [state, setState] = useState<SetupState>();
  const [login, setLogin] = useState<{ address: Hex; token: string }>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { setState(await call<SetupState>("/state")); }, []);
  useEffect(() => { refresh().catch(() => setError("Start the local coordinator with npm.cmd run onboarding, then refresh.")); }, [refresh]);
  useEffect(() => {
    const wallet = (window as unknown as { ethereum?: WalletProvider }).ethereum;
    const changed = () => { setLogin(undefined); setError("Wallet account changed. Reconnect using the configured owner."); };
    wallet?.on?.("accountsChanged", changed);
    return () => wallet?.removeListener?.("accountsChanged", changed);
  }, []);
  const operationStatus = state?.operation?.status;
  useEffect(() => {
    if (!login || !operationStatus || !activeStates.has(operationStatus)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await call<SetupState>("/reconcile", login.token, {});
        if (!cancelled) {
          setState(next);
          if (next.operation && activeStates.has(next.operation.status)) timer = setTimeout(poll, 3000);
        }
      } catch { if (!cancelled) setError("Reconciliation is paused. Reconnect if your sign-in expired, then use Check transaction. Do not submit a new operation while the outcome is unknown."); }
    };
    timer = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [login, operationStatus]);

  async function action(label: string, body: () => Promise<void>) {
    setBusy(label); setError("");
    try { await body(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Wallet/setup request failed."); }
    finally { setBusy(""); }
  }
  async function assertOwner() {
    if (!login || !state) throw new Error("Connect the owner wallet first.");
    const wallet = provider();
    const accounts = await wallet.request({ method: "eth_accounts" }) as string[];
    if (accounts[0]?.toLowerCase() !== state.owner.toLowerCase() || login.address.toLowerCase() !== state.owner.toLowerCase()) throw new Error("Reconnect with the configured owner account.");
    await switchNetwork(wallet);
    return wallet;
  }
  const connect = () => action("Connect and sign in", async () => {
    const current = await call<SetupState>("/state"); setState(current);
    const wallet = provider();
    const accounts = await wallet.request({ method: "eth_requestAccounts" }) as Hex[];
    const address = accounts[0];
    if (!address || address.toLowerCase() !== current.owner.toLowerCase()) throw new Error(`Select the configured owner: ${current.owner}`);
    await switchNetwork(wallet);
    const challenge = await call<{ nonce: string; message: string }>("/auth/nonce", undefined, { address });
    const signature = await wallet.request({ method: "personal_sign", params: [toHex(challenge.message), address] });
    const auth = await call<{ token: string }>("/auth/verify", undefined, { address, nonce: challenge.nonce, signature });
    setLogin({ address, token: auth.token });
  });
  const prepare = () => action("Prepare sponsored deployment", async () => {
    await assertOwner();
    setState(await call<SetupState>("/prepare", login!.token, {}));
  });
  const signAndDeploy = () => action("Sign deployment in MetaMask", async () => {
    const wallet = await assertOwner();
    if (!state?.operation || state.operation.status !== "prepared") throw new Error("Prepare the operation first.");
    const signature = await wallet.request({ method: "personal_sign", params: [state.operation.hash, login!.address] });
    setState(await call<SetupState>("/submit", login!.token, { id: state.operation.id, signature }));
  });
  const authorize = () => action("Authorize Astra in MetaMask", async () => {
    const wallet = await assertOwner();
    const data = await call<{ typedData: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> } }>("/session/authorization", login!.token, {});
    const domainTypes = [
      { name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" }, { name: "salt", type: "bytes32" },
    ].filter((item) => item.name in data.typedData.domain);
    const payload = { ...data.typedData, types: { ...data.typedData.types, EIP712Domain: domainTypes } };
    const signature = await wallet.request({ method: "eth_signTypedData_v4", params: [login!.address, JSON.stringify(payload)] });
    setState(await call<SetupState>("/session/approve", login!.token, { signature }));
  });

  return <main className="setup-shell">
    <header className="setup-header"><a href="/" className="brand"><span className="brand-mark">G</span> Guardian Wallet</a><span className="badge">Base Sepolia · owner setup</span></header>
    <section className="setup-intro"><p className="eyebrow">OWNER-CONTROLLED ONBOARDING</p><h1>Authorize once.<br /><span>Keep authority bounded.</span></h1><p>Deploy the wallet and policy contracts with project-sponsored gas. Your owner wallet signs in MetaMask. Native ETH in the owner wallet is not required for a sponsored UserOperation.</p></section>
    {error && <div className="setup-error" role="alert">{error}</div>}
    {busy && <p role="status" className="setup-progress">{busy}…</p>}
    <div className="setup-columns">
      <section className="setup-panel"><p className="eyebrow">THREE STEPS</p>
        <article className="setup-step"><span>01</span><div><h2>Connect owner</h2><p>Sign the domain-bound login message. This establishes access to the local coordinator.</p><button disabled={!!busy || !state} onClick={connect}>{login ? "Reconnect owner" : "Connect MetaMask & sign in"}</button>{login && <p className="setup-ok">Owner connected</p>}</div></article>
        <article className="setup-step"><span>02</span><div><h2>Deploy with sponsored gas</h2><p>Create Kernel, deploy Guardian and the fixed-supply test token, then install the policy. Preparing can reserve project sponsorship quota; the displayed gas bound is not a fiat pricing guarantee.</p><div className="setup-buttons"><button disabled={!!busy || !login || state?.ready || (operationStatus !== undefined && activeStates.has(operationStatus))} onClick={prepare}>Prepare deployment</button><button disabled={!!busy || !login || operationStatus !== "prepared"} onClick={signAndDeploy}>Sign & submit deployment</button></div>{state?.operation && <p className="setup-detail">Operation: <strong>{state.operation.status}</strong><br />Maximum native gas exposure: {state.operation.maxGasCostEth} ETH<br />UserOperation hash: <code>{state.operation.hash}</code></p>}{state?.operation?.transactionHash && <a className="setup-link" target="_blank" rel="noreferrer" href={`https://sepolia.basescan.org/tx/${state.operation.transactionHash}`}>View transaction on explorer ↗</a>}</div></article>
        <article className="setup-step"><span>03</span><div><h2>Delegate to Astra</h2><p>Sign the scoped permission for the session address below. Direct transfers, approvals and administration are outside this session. The owner retains policy and revocation authority.</p><button disabled={!!busy || !login || !state?.ready || state.sessionAuthorized} onClick={authorize}>Authorize Astra session</button>{state?.sessionAuthorized && <p className="setup-ok">Session authorization recorded</p>}{state?.sessionAuthorized && !state.runtimeConfigured && <button disabled={!!busy || !login} onClick={() => action("Synchronize runtime", async () => setState(await call<SetupState>("/runtime/sync", login!.token, {})))}>Retry runtime synchronization</button>}{state?.runtimeConfigured && <div className="setup-success"><strong>Runtime configuration ready.</strong><p>Start or restart the API and worker to load the deployed addresses and session: <code>npm.cmd run dev:api</code> and <code>npm.cmd run dev:worker</code>. Scheduling starts paused until you sign in to the API and start the agent.</p></div>}</div></article>
        <div className="setup-buttons"><button className="secondary" disabled={!!busy} onClick={() => action("Refresh", refresh)}>Refresh status</button><button className="secondary" disabled={!!busy || !login} onClick={() => action("Check transaction", async () => setState(await call<SetupState>("/reconcile", login!.token, {})))}>Check transaction</button></div>
      </section>
      <aside className="setup-panel"><p className="eyebrow">REVIEW BEFORE SIGNING</p>{state ? <>
        <dl className="setup-addresses">{[["Owner", state.owner], ["Kernel account", state.kernel], ["Guardian executor", state.guardian], ["MockUSD test token", state.token], ["Provider / recipient", state.recipient], ["Astra session signer", state.sessionSigner], ["Gas paymaster", state.paymaster]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd><code>{value}</code></dd></div>)}</dl>
        <div className="setup-limits"><div><span>Initial test-token mint</span><strong>{units(state.limits.initialTokenUnits)}</strong></div><div><span>Protected balance</span><strong>{units(state.limits.protectedUnits)}</strong></div><div><span>Per-payment limit</span><strong>{units(state.limits.perPaymentUnits)}</strong></div><div><span>UTC-day limit</span><strong>{units(state.limits.dailyUnits)}</strong></div></div>
        <p className="setup-detail">Authority expires: {new Date(state.validUntil * 1000).toLocaleString()}<br />Policy: {state.installed ? "installed on-chain" : "planned, awaiting deployment"}<br />All amounts are MockUSD test units, not redeemable dollars.</p>
      </> : <p>Waiting for the local coordinator. In a second terminal, run <code>npm.cmd run onboarding</code>.</p>}</aside>
    </div><footer>Guardian Wallet · owner keys remain in the wallet · session execution is policy-bound</footer>
  </main>;
}
