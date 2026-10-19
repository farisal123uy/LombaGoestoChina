import type { CSSProperties } from "react";

export type IconName = "grid" | "shield" | "wallet" | "receipt" | "flask" | "arrow" | "spark" | "check" | "database" | "lock";
const paths: Record<IconName, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z M8 12l3 3 5-6",
  wallet: "M20 8V5H5a2 2 0 0 0 0 4h16v12H5a2 2 0 0 1-2-2V7 M16 12h5v5h-5z",
  receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2z M8 7h8 M8 11h8 M8 15h4",
  flask: "M9 3h6 M10 3v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3 M7 14h10",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  check: "m5 12 4 4L19 6",
  database: "M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3z M4 6v12c0 2 4 3 8 3s8-1 8-3V6 M4 12c0 2 4 3 8 3s8-1 8-3",
  lock: "M7 10V7a5 5 0 0 1 10 0v3 M5 10h14v11H5z M12 14v3",
};
export function UiIcon({ name, className, style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
