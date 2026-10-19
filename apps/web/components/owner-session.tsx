"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { WalletProvider } from "../lib/wallet";

interface Session { address: `0x${string}`; token: string; }
interface OwnerSessions {
  walletSession?: Session;
  setupSession?: Session;
  setWalletSession: Dispatch<SetStateAction<Session | undefined>>;
  setSetupSession: Dispatch<SetStateAction<Session | undefined>>;
}
const Context = createContext<OwnerSessions | undefined>(undefined);

/** Route navigation retains sign-in in memory; a reload or wallet change clears it. */
export function OwnerSessionProvider({ children }: { children: ReactNode }) {
  const [walletSession, setWalletSession] = useState<Session>();
  const [setupSession, setSetupSession] = useState<Session>();
  useEffect(() => {
    const wallet = (window as unknown as { ethereum?: WalletProvider }).ethereum;
    const clear = () => { setWalletSession(undefined); setSetupSession(undefined); };
    wallet?.on?.("accountsChanged", clear);
    wallet?.on?.("chainChanged", clear);
    return () => { wallet?.removeListener?.("accountsChanged", clear); wallet?.removeListener?.("chainChanged", clear); };
  }, []);
  const value = useMemo(() => ({ walletSession, setupSession, setWalletSession, setSetupSession }), [walletSession, setupSession]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOwnerSession() {
  const value = useContext(Context);
  if (!value) throw new Error("OWNER_SESSION_PROVIDER_REQUIRED");
  return value;
}
