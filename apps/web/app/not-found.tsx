import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../components/site-chrome";

export const metadata: Metadata = { title: "Page not found | Guardian Wallet", description: "Return to Guardian Wallet evidence or overview." };

export default function NotFound() {
  return <main className="shell"><SiteHeader current="/" /><section className="not-found"><p className="eyebrow">404</p><h1>Page not found.</h1><p>The requested page is not part of this recorded workspace.</p><p><a className="action-primary" href="/">Home</a><a className="action-secondary" href="/evidence">Evidence</a></p></section><SiteFooter /></main>;
}
