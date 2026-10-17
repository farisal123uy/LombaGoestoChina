"use client";

import { useState } from "react";

export function CopyHashButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { setCopied(false); }
  }
  return <button className="evidence-copy" type="button" onClick={copy} aria-label={`Copy ${value}`}>{copied ? "Copied" : "Copy"}</button>;
}
