import { Link } from 'react-router-dom';

const SAMPLE = [
  { m: 'M1', k: 'info', t: 'Querying Streamflow for mint 7xKq…9fB' },
  { m: 'M1', k: 'flag', t: 'locked = 0 SOL  |  claimed "20% locked 12mo"  →  MISMATCH' },
  { m: 'M1', k: 'flag', t: 'mint_authority = ACTIVE  (dev can mint unlimited)' },
  { m: 'M2', k: 'flag', t: 'repo created 2026-06-30  |  claims "8 months dev"  →  FLAG' },
  { m: 'M3', k: 'pass', t: '@zenith_protocol created 2026-06-29 (6d old)' },
] as const;

const PRINCIPLES = [
  { t: 'Evidence or it didn’t happen', d: 'No finding ships without a retrievable source and a raw snapshot stored at check time. Anyone can re-verify.' },
  { t: 'Deterministic core, narrative shell', d: 'Checks are deterministic code with structured output. The LLM only summarizes already-verified results — it never produces evidence.' },
  { t: 'Confidence-gated publishing', d: 'On-chain facts auto-post. Anything that names a person or asserts intent is held for human review. The tier gates the publisher, not just the report.' },
  { t: 'Throttle is a feature', d: 'Publishing is metered and capped, so we only post what’s airtight — high-conviction, evidence-backed verdicts only.' },
];

const MODULES = [
  { id: 'M1', name: 'On-chain', conf: 'high', d: 'Locks, mint/freeze authority, holder concentration — read directly from Solana.' },
  { id: 'M2', name: 'GitHub', conf: 'high', d: 'Repo age vs. claimed history; commit bursts and throwaway contributor accounts.' },
  { id: 'M3', name: 'X history', conf: 'high', d: 'Real account age + numeric id via the X API; rename/squat detection via web archives.' },
  { id: 'M4', name: 'KOL supply', conf: 'low→med', d: 'Top-holder wallets cross-referenced against known influencer wallets. Human-gated.' },
  { id: 'M5', name: 'Product', conf: 'low', d: 'Crawls the claimed site — a real interactive app vs. a static placeholder.' },
  { id: 'M6', name: 'AI copy', conf: 'low', d: 'Stylometric signal on project copy. Weak, labeled, never a basis for an accusation.' },
];

const STATS = [
  ['21,000+', 'launches / day'],
  ['~69%', 'dead after day one'],
  ['< 2%', 'ever graduate'],
  ['6', 'verification modules'],
];

export function Landing() {
  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="eyebrow">autonomous · falsifiable · sourced</div>
        <h1>On-chain due diligence that shows its work.</h1>
        <p className="sub">
          An always-on agent watches new Solana token launches, runs a battery of mechanical
          verification checks against the ones gaining traction, and publishes evidence-backed
          verdicts — every claim paired with a re-verifiable source and a raw snapshot. No trust
          scores. Just evidence.
        </p>
        <div className="hero-cta">
          <Link to="/app" className="btn btn--primary btn--lg">
            View live reports →
          </Link>
          <a href="#how" className="btn btn--lg">
            How it works
          </a>
        </div>

        <div className="term-wrap hero-term">
          <div className="term-bar">
            <span className="dots">
              <span className="tdot" />
              <span className="tdot" />
              <span className="tdot" />
            </span>
            <span className="title">dda-agent — live check stream</span>
          </div>
          <div className="term">
            {SAMPLE.map((l, i) => (
              <div key={i} className={`ln ${l.k}`}>
                <span className="mod">[{l.m}]</span> {l.k === 'flag' ? '✗' : l.k === 'pass' ? '✓' : '·'} {l.t}
              </div>
            ))}
            <span className="caret" />
          </div>
        </div>
      </section>

      {/* Principles */}
      <section>
        <div className="section-label">
          <span className="txt">why it’s credible</span>
          <span className="line" />
        </div>
        <div className="lgrid">
          {PRINCIPLES.map((p) => (
            <div key={p.t} className="panel lcard">
              <h3>{p.t}</h3>
              <p>{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how">
        <div className="section-label">
          <span className="txt">how it works</span>
          <span className="line" />
        </div>
        <div className="flow">
          {[
            ['Ingest', 'Watch every new mint + graduation on Solana / Pump.fun.'],
            ['Triage', '~99% dropped. Only tech projects with real traction proceed.'],
            ['Battery', 'Six deterministic modules run in parallel, streaming live.'],
            ['Publish', 'On-chain facts auto-post; accusatory claims go to human review.'],
          ].map(([t, d], i) => (
            <div key={t} className="flow-step">
              <div className="flow-n">{String(i + 1).padStart(2, '0')}</div>
              <div className="flow-t">{t}</div>
              <div className="flow-d">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section>
        <div className="section-label">
          <span className="txt">the six checks</span>
          <span className="line" />
          <span className="hint">confidence-graded</span>
        </div>
        <div className="modgrid">
          {MODULES.map((m) => (
            <div key={m.id} className="panel modcard">
              <div className="modcard-head">
                <span className="mtag">{m.id}</span>
                <span className="modcard-name">{m.name}</span>
                <span className="pill">{m.conf}</span>
              </div>
              <p>{m.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="stats">
        {STATS.map(([n, l]) => (
          <div key={l} className="stat">
            <div className="stat-n">{n}</div>
            <div className="stat-l">{l}</div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="cta-band panel">
        <h2>Watch the agent think.</h2>
        <p>Every qualifying launch, tested in public. Browse the archive or submit a mint.</p>
        <Link to="/app" className="btn btn--primary btn--lg">
          Open the terminal →
        </Link>
      </section>

      <div className="disclaimer">
        Not investment advice. Every report is a point-in-time snapshot; results can change as
        on-chain state and public records mutate. Findings are falsifiable facts, not conclusions
        about intent.
      </div>
    </div>
  );
}
