"use client";

import Image from "next/image";
import Link from "next/link";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes float-a {
    0%,100% { transform: translateY(0px);  }
    50%      { transform: translateY(-9px); }
  }
  @keyframes float-b {
    0%,100% { transform: translateY(-5px); }
    50%      { transform: translateY(6px);  }
  }
  @keyframes float-c {
    0%,100% { transform: translateY(3px);  }
    50%      { transform: translateY(-8px); }
  }
  @keyframes orbit-cw  { from { transform: rotate(0deg); }   to { transform: rotate(360deg);  } }
  @keyframes orbit-ccw { from { transform: rotate(0deg); }   to { transform: rotate(-360deg); } }
  @keyframes glow-pulse {
    0%,100% { box-shadow: 0 0 12px 3px rgba(196,181,253,0.45); }
    50%      { box-shadow: 0 0 28px 7px rgba(196,181,253,0.85); }
  }
  @keyframes btn-pulse {
    0%,100% { box-shadow: 0 6px 28px rgba(255,255,255,0.18); }
    50%      { box-shadow: 0 8px 38px rgba(255,255,255,0.38); }
  }

  .nav-link:hover  { opacity: 0.75; }
  .cta-ghost:hover { color: rgba(255,255,255,0.90) !important; }
`;

export default function Home() {
  return (
    <>
      <style>{CSS}</style>

      <div style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}>

        {/* ── BACKGROUND ── */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <Image
            src="/background.png"
            alt=""
            fill
            priority
            style={{ objectFit: "cover", objectPosition: "center" }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(135deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.32) 100%)",
          }} />
        </div>

        {/* ── NAVBAR ── */}
        <header style={{
          position: "relative", zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 56px",
          height: 68,
          flexShrink: 0,
          animation: "fade-in 0.6s ease both",
        }}>
          <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
              <Image src="/logo.png" alt="NautiCAI" width={34} height={34}
                style={{ objectFit: "cover", width: "100%", height: "100%" }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
              NautiCAI
            </span>
          </a>

          <nav style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 36,
          }}>
            {[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Inspect",   href: "/inspect"   },
              { label: "Reports",   href: "/reports"   },
              { label: "About",     href: "https://www.nauticai-ai.com/" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="nav-link" style={{
                fontSize: 13, fontWeight: 600,
                background: "linear-gradient(160deg, #ffffff 0%, #e2e8f0 50%, #94a3b8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textDecoration: "none",
                letterSpacing: "-0.005em",
                transition: "opacity 0.2s",
              }}>{l.label}</Link>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Link href="/login" className="nav-link" style={{
              fontSize: 13, fontWeight: 600,
              background: "linear-gradient(160deg, #ffffff 0%, #e2e8f0 50%, #94a3b8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textDecoration: "none",
              transition: "opacity 0.2s",
            }}>Log In</Link>
            <a href="mailto:contact@nauticai.com" style={{
              fontSize: 13, fontWeight: 700, color: "#0d0422",
              background: "#fff",
              borderRadius: 999, padding: "8px 20px",
              textDecoration: "none",
              animation: "btn-pulse 3s ease-in-out infinite",
            }}>
              Talk to our team
            </a>
          </div>
        </header>

        {/* ── HERO ── */}
        <main style={{
          position: "relative", zIndex: 10,
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          alignItems: "center",
          padding: "0 56px",
          gap: 40,
        }}>
          <div>
            <h1 style={{
              fontSize: "clamp(2.6rem, 3.5vw, 4.1rem)",
              fontWeight: 800,
              lineHeight: 1.07,
              letterSpacing: "-0.03em",
              textShadow: "0 2px 24px rgba(0,0,0,0.35)",
              animation: "fade-up 0.7s ease 0.1s both",
            }}>
              Spot Every<br />
              Hull Defect –<br />
              Before it Becomes<br />
              <span style={{ color: "#1e1b4b" }}>
                an Expensive Problem.
              </span>
            </h1>

            <p style={{
              marginTop: 20,
              maxWidth: 400,
              fontSize: 13.5,
              lineHeight: 1.75,
              color: "rgba(226,238,255,0.82)",
              textShadow: "0 1px 10px rgba(0,0,0,0.45)",
              animation: "fade-up 0.7s ease 0.25s both",
            }}>
              NautiCAI turns underwater hull footage into clear, plain-language
              findings for corrosion, marine growth, and damage — no technical
              background needed.
            </p>

            <div style={{
              marginTop: 32,
              display: "flex", alignItems: "center", gap: 22,
              animation: "fade-up 0.7s ease 0.4s both",
            }}>
              <Link href="/inspect" style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                fontSize: 13, fontWeight: 700, color: "#0d0422",
                background: "#fff",
                borderRadius: 999, padding: "10px 24px",
                textDecoration: "none",
                animation: "btn-pulse 3s ease-in-out 1s infinite",
              }}>
                Start Inspection
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06L7.28 12.78a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </Link>
              <Link className="cta-ghost" href="/dashboard" style={{
                fontSize: 13, fontWeight: 500,
                color: "rgba(186,230,255,0.72)",
                textDecoration: "none", transition: "color 0.2s",
              }}>
                See how it works
              </Link>
            </div>
          </div>

          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            animation: "fade-in 0.9s ease 0.3s both",
          }}>
            <AnimatedOrbit />
          </div>
        </main>

        {/* ── FOOTER ── */}
        <footer style={{
          position: "relative", zIndex: 10,
          flexShrink: 0,
          padding: "13px 56px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 24,
          animation: "fade-in 0.7s ease 0.6s both",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>NautiCAI Pte. Ltd.</span>
            <span style={{ fontSize: 11, color: "rgba(186,230,255,0.50)" }}>
              AI-powered underwater vision &amp; mapping · Singapore
            </span>
          </div>

          <p style={{
            fontSize: 11, color: "rgba(186,230,255,0.44)",
            textAlign: "center", maxWidth: 370, lineHeight: 1.55,
          }}>
            Preventing underwater hazards for safer ports, coasts, and oceans.
            Building the foundation of a digital twin of the seas.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
            {[
              { label: "nauticai-ai.com ↗", href: "https://www.nauticai-ai.com/" },
              { label: "Contact",           href: "https://www.nauticai-ai.com/#contact" },
              { label: "contact@nauticai.com", href: "mailto:contact@nauticai.com" },
            ].map((l) => (
              <a key={l.label} href={l.href}
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.55)", textDecoration: "none", transition: "color 0.2s" }}>
                {l.label}
              </a>
            ))}
            <span style={{ fontSize: 11, color: "rgba(186,230,255,0.30)" }}>© 2026</span>
          </div>
        </footer>

      </div>
    </>
  );
}

/* ──────────────────────────────────────────
   ANIMATED ORBIT
────────────────────────────────────────── */
function AnimatedOrbit() {
  const SIZE = 420;

  const chips = [
    { label: "Marine growth",   sub: "Detected in clusters", dot: "#7c3aed", anim: "float-a 4s ease-in-out infinite",       style: { top: "6%",  right: "3%" } },
    { label: "Corrosion zones", sub: "High-risk steel",       dot: "#dc2626", anim: "float-b 4.5s ease-in-out 0.6s infinite", style: { bottom: "10%", right: "3%" } },
    { label: "Hull debris",     sub: "Foreign objects",       dot: "#d97706", anim: "float-c 3.8s ease-in-out 1.2s infinite", style: { bottom: "12%", left: "3%" } },
  ];

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>

      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.09)" }} />
      <div style={{ position: "absolute", inset: "10%", borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.18)", animation: "orbit-cw 40s linear infinite" }} />
      <div style={{ position: "absolute", inset: "22%", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.22)", animation: "orbit-ccw 28s linear infinite" }} />

      {/* Satellite 1 */}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, animation: "orbit-cw 12s linear infinite" }}>
        <div style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: "radial-gradient(circle, #fff 0%, #c4b5fd 60%)", boxShadow: "0 0 14px 4px rgba(196,181,253,0.85)", animation: "glow-pulse 2s ease-in-out infinite", left: -179, top: -5 }} />
      </div>
      {/* Satellite 2 */}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, animation: "orbit-ccw 18s linear infinite" }}>
        <div style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "radial-gradient(circle, #fff 0%, #a78bfa 70%)", boxShadow: "0 0 10px 3px rgba(167,139,250,0.7)", left: -208, top: -3.5 }} />
      </div>
      {/* Satellite 3 */}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, animation: "orbit-cw 8s linear infinite" }}>
        <div style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px 2px rgba(255,255,255,0.6)", left: -121, top: -3 }} />
      </div>

      {/* Centre stat */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 150, height: 150, borderRadius: "50%",
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.18)",
        backdropFilter: "blur(14px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        animation: "glow-pulse 4s ease-in-out infinite",
      }}>
        <span style={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1, color: "#fff" }}>99%</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", color: "rgba(186,230,255,0.65)", textTransform: "uppercase", marginTop: 5 }}>Hull coverage</span>
      </div>

      {/* Clean surface pill */}
      <div style={{
        position: "absolute", top: "4%", left: "30%",
        background: "rgba(14,116,144,0.72)", border: "1px solid rgba(103,232,249,0.35)",
        borderRadius: 999, padding: "5px 14px",
        fontSize: 11, fontWeight: 700, color: "#cffafe",
        boxShadow: "0 4px 20px rgba(6,182,212,0.40)",
        animation: "float-a 4.2s ease-in-out 0.3s infinite",
      }}>Clean surface ✓</div>

      {/* Icon left */}
      <div style={{ position: "absolute", top: "43%", left: "-3%", width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", animation: "float-b 5s ease-in-out 1s infinite" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,183,0.85)" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      {/* Icon right */}
      <div style={{ position: "absolute", top: "43%", right: "-3%", width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", animation: "float-c 4.7s ease-in-out 0.5s infinite" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(196,181,253,0.85)" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
        </svg>
      </div>

      {/* Dents pill */}
      <div style={{ position: "absolute", bottom: "1%", left: "27%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 13px", fontSize: 11, fontWeight: 600, color: "rgba(214,236,255,0.82)", animation: "float-b 4s ease-in-out 0.8s infinite" }}>
        Dents &amp; damage
      </div>

      {/* Chips */}
      {chips.map((c) => (
        <div key={c.label} style={{
          position: "absolute", ...c.style,
          display: "flex", alignItems: "center", gap: 9,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)",
          backdropFilter: "blur(10px)", borderRadius: 14, padding: "7px 12px",
          animation: c.anim,
        }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: c.dot, flexShrink: 0, boxShadow: `0 0 10px 2px ${c.dot}88` }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#f0f9ff", lineHeight: 1.3 }}>{c.label}</div>
            <div style={{ fontSize: 10, color: "rgba(186,230,255,0.60)", lineHeight: 1.3 }}>{c.sub}</div>
          </div>
        </div>
      ))}

    </div>
  );
}
