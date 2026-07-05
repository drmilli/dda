import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { AmbientCanvas } from './AmbientCanvas.js';

/** App shell — animated WebGL backdrop + sticky topbar + centered main column. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <AmbientCanvas />
      <div className="shell">
        <div className="fx-noise" aria-hidden />
        <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="dot" />
          DDA<span className="sub">// on-chain due diligence</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/app" className={({ isActive }) => (isActive ? 'active' : '')}>
            reports
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
            review
          </NavLink>
        </nav>
        <span className="spacer" />
        <span className="meta">evidence or it didn't happen</span>
      </header>
        <main className="main">{children}</main>
      </div>
    </>
  );
}

/** Reusable "facts vs framing" section divider. */
export function SectionLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="section-label">
      <span className="txt">{text}</span>
      <span className="line" />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
