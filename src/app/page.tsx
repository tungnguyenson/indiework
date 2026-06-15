import Link from 'next/link';
import '@/styles/landing.css';
import { BrandMark, Wordmark } from '@/components/ui/brand';
import { Ic } from '@/components/ui/icons';

const GITHUB_URL = 'https://github.com/tungnguyenson/indiework';

export default function LandingPage() {
  return (
    <div className="lp">
      <header>
        <nav className="lp-nav" aria-label="Primary">
          <Link href="/" className="lp-brand" aria-label="IndieWork home">
            <BrandMark size={28} />
            <Wordmark />
          </Link>
          <div className="lp-nav-links">
            <a className="lp-nav-link hide-sm" href="#how">How it works</a>
            <a className="lp-nav-link hide-sm" href="#frontends">Front doors</a>
            <a className="lp-nav-link hide-sm" href="#selfhost">Self-host</a>
            <a className="lp-nav-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link className="lp-btn lp-btn-ghost" href="/login">
              Log in
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <div>
            <span className="lp-eyebrow">
              <Ic.lock size={13} /> Single-user · self-hosted · open source
            </span>
            <h1 className="lp-h1">
              Project management that <span className="accent">gets out of your way.</span>
            </h1>
            <p className="lp-lede">
              IndieWork is a calm, single-person tool for solo indie devs. No assignees,
              no notifications, no team ceremony — just your projects, two ways to group
              them, and an inbox for everything else.
            </p>
            <div className="lp-cta-row">
              <Link className="lp-btn lp-btn-primary" href="/app">
                Open your workspace <Ic.arrowRight size={17} />
              </Link>
              <a className="lp-btn" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <Ic.globe size={16} /> View source
              </a>
            </div>
            <p className="lp-cta-note">
              <Ic.check size={14} /> Bring your own Postgres. <code>docker compose up</code> and it&apos;s yours.
            </p>
          </div>

          <AppPreview />
        </section>

        <section className="lp-section" id="how">
          <p className="lp-kicker">How it works</p>
          <h2 className="lp-h2">Built around how a solo dev actually works.</h2>
          <p className="lp-sub">
            Two independent axes instead of rigid folders. A frictionless inbox so ideas
            never block on triage. And a clear split between what&apos;s stuck now and what
            already happened.
          </p>

          <div className="lp-bento">
            <article className="lp-card third">
              <div className="lp-card-ic"><Ic.layers size={20} /></div>
              <h3>Module ⟂ Milestone</h3>
              <p>
                Group tasks by sub-system or by phase — independently. A task belongs to
                both, and you flip between the two views with one toggle.
              </p>
              <div className="lp-axes">
                <span className="lp-axis-chip"><Ic.cube size={13} /> Module</span>
                <span className="lp-axis-chip"><Ic.target size={13} /> Milestone</span>
              </div>
            </article>

            <article className="lp-card third">
              <div className="lp-card-ic"><Ic.inbox size={20} /></div>
              <h3>Capture now, sort later</h3>
              <p>
                Dump an idea into the Inbox with zero required fields — from the web, a
                REST call, or an AI agent. Triage it into a project when you&apos;re ready.
              </p>
              <div className="lp-axes">
                <span className="lp-axis-chip"><Ic.plus size={13} /> Quick capture</span>
                <span className="lp-axis-chip">
                  Press <code style={{ font: '500 11px var(--font-mono)' }}>c</code>
                </span>
              </div>
            </article>

            <article className="lp-card wide">
              <div className="lp-card-ic"><Ic.bolt size={20} /></div>
              <h3>What&apos;s blocking ≠ what happened</h3>
              <p>
                A pinned <strong>status note</strong> always answers “where is this right now?”.
                The <strong>timeline</strong> below keeps the running log of what you&apos;ve tried.
                Two different needs, never blurred together.
              </p>
              <div className="lp-vs">
                <div className="lp-note">
                  <div className="lp-note-label">
                    <Ic.bolt size={12} style={{ verticalAlign: '-2px' }} /> Current state
                  </div>
                  <p>Waiting on the upstream API key before I can finish auth.</p>
                </div>
                <div className="lp-log">
                  <div className="lp-log-item">
                    <span className="lp-log-day">6/12</span> tried approach A — failed on rate limits
                  </div>
                  <div className="lp-log-item">
                    <span className="lp-log-day">6/13</span> switched to a queue, looking better
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="lp-section" id="frontends">
          <p className="lp-kicker">One core, three front doors</p>
          <h2 className="lp-h2">Drive it from wherever you are.</h2>
          <p className="lp-sub">
            Every surface calls the same service layer — so the web app, a shell script,
            and an AI agent all do exactly the same thing, consistently.
          </p>
          <div className="lp-doors">
            <article className="lp-door">
              <div className="lp-card-ic"><Ic.globe size={20} /></div>
              <h4>Web UI</h4>
              <p>A fast, keyboard-friendly app with a slide-in detail panel and command palette.</p>
            </article>
            <article className="lp-door">
              <div className="lp-card-ic"><Ic.table size={20} /></div>
              <h4>REST API</h4>
              <p>
                Create tasks from Telegram, your editor, or a cron job. <code>POST /api/v1/tasks</code>.
              </p>
            </article>
            <article className="lp-door">
              <div className="lp-card-ic"><Ic.sparkle size={20} /></div>
              <h4>MCP server</h4>
              <p>Let an AI agent capture, update, and log progress in natural language.</p>
            </article>
          </div>
        </section>

        <section className="lp-host" id="selfhost">
          <div className="lp-host-card">
            <div>
              <p className="lp-kicker">Yours, end to end</p>
              <h2 className="lp-h2" style={{ maxWidth: '14ch' }}>Self-host it in a minute.</h2>
              <p className="lp-sub" style={{ marginBottom: 24 }}>
                No accounts, no SaaS, no telemetry. One password guards the door; your data
                lives in your Postgres. MIT licensed — fork it, change it, ship it.
              </p>
              <div className="lp-cta-row">
                <a className="lp-btn lp-btn-primary" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Ic.globe size={16} /> Get the code
                </a>
                <Link className="lp-btn" href="/login">
                  Open the app <Ic.arrowRight size={16} />
                </Link>
              </div>
            </div>
            <div className="lp-term" aria-hidden>
              <div className="lp-term-bar"><i /><i /><i /></div>
              <pre>
                {'$ git clone '}
                <span className="c-dim">indiework</span>
                {'\n$ cp .env.example .env   '}
                <span className="c-dim"># set a password</span>
                {'\n$ docker compose '}
                <span className="c-accent">up -d</span>
                {'\n\n'}
                <span className="c-accent">✓</span>
                {' indiework.space is live'}
              </pre>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <BrandMark size={22} />
          <Wordmark />
          <p>· calm PM for one.</p>
          <div className="lp-foot-links">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A faux, neutral app preview — no real project data, just the shape. */
function AppPreview() {
  return (
    <div className="lp-preview" aria-hidden>
      <aside className="lp-pv-side">
        <div className="lp-pv-ws">
          <BrandMark size={26} />
          <b>My Workspace</b>
        </div>
        <div className="lp-pv-row" data-on>
          <Ic.inbox size={14} /> Inbox <span className="lp-pv-badge">3</span>
        </div>
        <div className="lp-pv-glabel">Projects</div>
        <div className="lp-pv-row">
          <span className="lp-pv-dot" style={{ background: '#3FB984' }} /> Landing site
        </div>
        <div className="lp-pv-row">
          <span className="lp-pv-dot" style={{ background: '#A06BF0' }} /> API rewrite
        </div>
        <div className="lp-pv-row">
          <span className="lp-pv-dot" style={{ background: '#4C8DFF' }} /> Mobile app
        </div>
      </aside>
      <div className="lp-pv-main">
        <div className="lp-pv-title">
          🚀 Landing site{' '}
          <span style={{ font: '500 10px var(--font-mono)', color: 'var(--text-faint)' }}>SITE</span>
        </div>
        <div className="lp-pv-sec">
          <span className="lp-pv-dot" style={{ background: '#4C8DFF' }} /> Core UI · 2/3
        </div>
        <div className="lp-pv-task" data-done>
          <span className="lp-pv-check" data-done /> <span>Wire up the hero section</span>
          <span className="lp-pv-ref">SITE-1</span>
        </div>
        <div className="lp-pv-task" data-done>
          <span className="lp-pv-check" data-done /> <span>Pick the type scale</span>
          <span className="lp-pv-ref">SITE-2</span>
        </div>
        <div className="lp-pv-task">
          <span className="lp-pv-check" /> <span>Ship the pricing page</span>
          <span className="lp-pv-tag">Phase 2</span>
          <span className="lp-pv-ref">SITE-3</span>
        </div>
      </div>
    </div>
  );
}
