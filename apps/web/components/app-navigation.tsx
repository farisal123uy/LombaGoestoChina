"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UiIcon, type IconName } from "./ui-icon";

const ownerRoutes = [
  { href: "/setup", label: "Setup", icon: "shield" as IconName },
  { href: "/dashboard", label: "Wallet", icon: "wallet" as IconName },
];

export function AppNavigation({ reviewOnly = false }: { reviewOnly?: boolean }) {
  const pathname = usePathname() || "/";
  const sandbox = reviewOnly || pathname === "/review" || pathname.startsWith("/review/");
  const items = [
    { href: "/", label: "Overview", icon: "grid" as IconName },
    ...(reviewOnly ? [] : ownerRoutes),
    { href: "/evidence", label: "Evidence", icon: "receipt" as IconName },
    { href: "/review", label: reviewOnly ? "Workspace" : "Review", icon: "flask" as IconName },
  ];

  return <div className="app-nav-frame">
    <header className="app-navigation">
      <Link className="app-brand" href="/" aria-label="Guardian Wallet overview">
        <span className="brand-mark" aria-hidden="true">G</span>
        <span className="app-brand-copy"><strong>Guardian <span>Wallet</span></strong><small>POLICY CONTROL</small></span>
      </Link>
      <nav className="app-nav-links" aria-label="Main navigation">
        {items.map(({ href, label, icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} className={`app-nav-link${active ? " is-active" : ""}`} href={href} aria-current={active ? "page" : undefined}>
            <UiIcon name={icon} />{label}
          </Link>;
        })}
      </nav>
      <div className={`app-network-chip${sandbox ? " is-sandbox" : ""}`}>
        <span className="app-network-dot" aria-hidden="true" />
        <span>{sandbox ? "ISOLATED FORK" : "BASE SEPOLIA"}</span>
        <span className="app-network-divider" aria-hidden="true" />
        <small>{sandbox ? "SANDBOX" : "TESTNET"}</small>
      </div>
    </header>
  </div>;
}
