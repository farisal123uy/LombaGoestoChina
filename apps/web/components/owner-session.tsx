"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { WalletProvider } from "../lib/wallet";
import { onboardingBase, sessionInvalidEvent, walletApiBase } from "../lib/api-error";

interface Session { address: `0x${string}`; token: string; expiresAt: number; }
interface OwnerSessions {
  walletSession?: Session;
  setupSession?: Session;
  setWalletSession: Dispatch<SetStateAction<Session | undefined>>;
  setSetupSession: Dispatch<SetStateAction<Session | undefined>>;
  restoring: boolean;
}
const Context = createContext<OwnerSessions | undefined>(undefined);

/** Retain each service's short-lived login in this tab; restore only after wallet and server validation. */
export function OwnerSessionProvider({ children }: { children: ReactNode }) {
  const [walletSession, setWalletSession] = useState<Session>();
  const [setupSession, setSetupSession] = useState<Session>();
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    let stopped = false;
    const wallet = (window as unknown as { ethereum?: WalletProvider }).ethereum;
    const key = (base: string) => `guardian-owner-session:${base}`;
    const remove = (base: string) => { try { sessionStorage.removeItem(key(base)); } catch { /* Storage may be disabled. */ } };
    const clear = () => {
      stopped = true; setRestoring(false); setWalletSession(undefined); setSetupSession(undefined);
      remove(walletApiBase); remove(onboardingBase);
    };
    const invalid = (event: Event) => {
      const base = (event as CustomEvent<{ base: string }>).detail.base;
      if (base === walletApiBase) setWalletSession(undefined);
      if (base === onboardingBase) setSetupSession(undefined);
      remove(base);
    };
    const restore = async (base: string, set: Dispatch<SetStateAction<Session | undefined>>) => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(key(base)) || "null") as Session | null;
        if (!saved || !wallet || typeof saved.token !== "string" || !/^0x[0-9a-f]{40}$/i.test(saved.address) || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) { remove(base); return; }
        const [accounts, chain] = await Promise.all([wallet.request({ method: "eth_accounts" }), wallet.request({ method: "eth_chainId" })]);
        if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== saved.address.toLowerCase() || Number(chain) !== 84532) { remove(base); return; }
        const response = await fetch(`${base}/auth/session`, { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${saved.token}` } });
        if (!response.ok) { remove(base); return; }
        const current = await response.json() as { address: string };
        if (current.address.toLowerCase() !== saved.address.toLowerCase() || saved.expiresAt <= Date.now()) { remove(base); return; }
        if (!stopped) set(saved);
      } catch { remove(base); }
    };
    void Promise.all([restore(walletApiBase, setWalletSession), restore(onboardingBase, setSetupSession)]).finally(() => { if (!stopped) setRestoring(false); });
    wallet?.on?.("accountsChanged", clear);
    wallet?.on?.("chainChanged", clear);
    wallet?.on?.("disconnect", clear);
    window.addEventListener(sessionInvalidEvent, invalid);
    return () => { stopped = true; wallet?.removeListener?.("accountsChanged", clear); wallet?.removeListener?.("chainChanged", clear); wallet?.removeListener?.("disconnect", clear); window.removeEventListener(sessionInvalidEvent, invalid); };
  }, []);
  useEffect(() => {
    if (restoring) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const [base, session, set] of [[walletApiBase, walletSession, setWalletSession], [onboardingBase, setupSession, setSetupSession]] as const) {
      try { if (session) sessionStorage.setItem(`guardian-owner-session:${base}`, JSON.stringify(session)); else sessionStorage.removeItem(`guardian-owner-session:${base}`); } catch { /* In-memory sign-in still works without storage. */ }
      if (session) timers.push(setTimeout(() => set(undefined), Math.max(0, session.expiresAt - Date.now())));
    }
    return () => timers.forEach(clearTimeout);
  }, [walletSession, setupSession, restoring]);
  const value = useMemo(() => ({ walletSession, setupSession, setWalletSession, setSetupSession, restoring }), [walletSession, setupSession, restoring]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOwnerSession() {
  const value = useContext(Context);
  if (!value) throw new Error("OWNER_SESSION_PROVIDER_REQUIRED");
  return value;
}
