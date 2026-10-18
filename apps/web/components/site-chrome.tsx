type Route = "/" | "/evidence" | "/setup" | "/dashboard";

function Link({ href, current, children }: { href: Route; current: Route; children: React.ReactNode }) {
  return <a href={href} aria-current={current === href ? "page" : undefined}>{children}</a>;
}

export function SiteHeader({ current }: { current: Route }) {
  return <header className="site-header">
    <a className="brand" href="/" aria-label="Guardian Wallet home"><span className="brand-mark" aria-hidden="true">G</span> Guardian<span>Wallet</span></a>
    <nav aria-label="Primary navigation">
      <Link href="/evidence" current={current}>Evidence</Link>
      <span className="runtime-nav" aria-label="Owner runtime"><span>Owner runtime</span><Link href="/setup" current={current}>Setup</Link><Link href="/dashboard" current={current}>Dashboard</Link></span>
    </nav>
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><span>MockUSD is a test token with no value. Recorded evidence is not live verification.</span><nav aria-label="Owner runtime"><a href="/setup">Setup</a><a href="/dashboard">Dashboard</a></nav></footer>;
}

export function OwnerRuntimeNotice() {
  return <aside className="owner-runtime-notice" aria-label="Owner runtime requirements">Owner-only live runtime. It needs the registered owner wallet and a running backend. Reviewing the project? <a href="/evidence">Start with the Evidence page.</a></aside>;
}
