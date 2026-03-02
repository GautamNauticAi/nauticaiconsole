import dynamic from "next/dynamic";

const HullOrbit = dynamic(
  () => import("../components/HullOrbit").then((m) => m.HullOrbit),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Background gradient with image */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(248,250,252,0.3),transparent_55%),radial-gradient(circle_at_80%_15%,rgba(129,140,248,0.55),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(56,189,248,0.4),transparent_60%),linear-gradient(135deg,#020617,#020617)]" />
        <div className="absolute inset-0 opacity-40 mix-blend-soft-light [background-image:url('/bg_main.png')] bg-cover bg-center" />
      </div>

      <header className="sticky top-0 z-20 border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 text-xs font-semibold tracking-[0.18em] text-slate-900">
              NA
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-[0.08em] text-slate-50">
                NautiCAI
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                Hull Check
              </div>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-xs font-medium text-slate-300 sm:flex">
            <a href="#how" className="hover:text-slate-50">
              How it works
            </a>
            <a href="#benefits" className="hover:text-slate-50">
              Why hull teams use it
            </a>
            <a href="#who" className="hover:text-slate-50">
              Who it’s for
            </a>
            <a href="#contact" className="hover:text-slate-50">
              Contact
            </a>
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <a
              href="../index.html#dashboard"
              className="rounded-full border border-slate-500/70 bg-slate-900/70 px-3 py-1.5 text-[11px] font-medium text-slate-100"
            >
              Open Inspection App
            </a>
            <a
              href="#contact"
              className="rounded-full bg-gradient-to-tr from-indigo-500 via-violet-500 to-cyan-400 px-3.5 py-1.5 text-[11px] font-semibold text-slate-950 shadow-[0_10px_30px_rgba(79,70,229,0.7)]"
            >
              Talk to our team
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:pt-14">
        {/* HERO */}
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-slate-900/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
              Underwater hull anomaly detection
            </div>
            <h1 className="mt-5 text-balance font-semibold tracking-tight text-slate-50 sm:text-4xl sm:leading-tight lg:text-[2.6rem]">
              See hull problems{" "}
              <span className="block bg-gradient-to-tr from-slate-50 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                before they become costly.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200/85 sm:text-[0.95rem]">
              NautiCAI Hull Check turns underwater hull images and videos into a
              clear, simple view of corrosion, marine growth, and damage – with
              no complex dashboards or AI jargon.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="../index.html#dashboard"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 via-violet-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(79,70,229,0.9)]"
              >
                Start a hull inspection
              </a>
              <a
                href="#how"
                className="inline-flex items-center justify-center rounded-full border border-slate-500/70 bg-slate-950/70 px-4 py-2 text-xs font-medium text-slate-100"
              >
                See how it works
              </a>
            </div>
            <div className="mt-4 flex gap-3 rounded-2xl border border-amber-400/40 bg-slate-950/70 p-3 text-[11px] text-slate-100">
              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                Important
              </span>
              <p className="leading-relaxed">
                Hull Check is built only for below‑waterline hull inspection.
                Please upload underwater hull footage or stills (no above‑water
                scenes).
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <HullOrbit />
            <dl className="grid grid-cols-3 gap-2 text-[11px] text-slate-200/90 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-600/60 bg-slate-950/80 px-3 py-2">
                <dt className="text-[10px] text-slate-400">From upload to findings</dt>
                <dd className="mt-1 text-sm font-semibold">Minutes, not days</dd>
              </div>
              <div className="rounded-xl border border-slate-600/60 bg-slate-950/80 px-3 py-2">
                <dt className="text-[10px] text-slate-400">View of hull state</dt>
                <dd className="mt-1 text-sm font-semibold">Single, simple view</dd>
              </div>
              <div className="rounded-xl border border-slate-600/60 bg-slate-950/80 px-3 py-2">
                <dt className="text-[10px] text-slate-400">Language</dt>
                <dd className="mt-1 text-sm font-semibold">No AI jargon</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="mt-16 space-y-6">
          <div className="max-w-xl space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200">
              How it works
            </p>
            <h2 className="text-xl font-semibold text-slate-50 sm:text-2xl">
              From dive footage to a clear hull story
            </h2>
            <p className="text-sm text-slate-200/85">
              We keep the workflow simple so your team can focus on decisions,
              not software.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Upload hull images or video",
                body: "Upload underwater hull footage from divers, ROVs, or existing archives. All processing runs in the NautiCAI inspection app.",
              },
              {
                step: "02",
                title: "AI finds anomalies for you",
                body: "The model scans the hull surface and highlights corrosion, marine growth, dents, and debris with clear markers – no tuning needed.",
              },
              {
                step: "03",
                title: "Share a simple hull report",
                body: "Export findings into a straightforward report your technical and non‑technical stakeholders can both understand.",
              },
            ].map((item) => (
              <article
                key={item.step}
                className="rounded-2xl border border-slate-600/70 bg-slate-950/80 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.9)]"
              >
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-400/80 text-[11px] font-medium text-slate-200">
                  {item.step}
                </div>
                <h3 className="text-sm font-semibold text-slate-50">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-200/85">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* BENEFITS */}
        <section id="benefits" className="mt-16 space-y-6">
          <div className="max-w-2xl space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200">
              Why hull teams use NautiCAI
            </p>
            <h2 className="text-xl font-semibold text-slate-50 sm:text-2xl">
              Make every hull check faster, clearer, and easier to repeat.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Cut through hours of footage",
                body: "Jump straight to areas that matter instead of watching every minute of video yourself.",
              },
              {
                title: "Speak the same language",
                body: "Turn technical detections into a simple story for superintendents, owners, and port teams.",
              },
              {
                title: "Built only for underwater hulls",
                body: "The model is trained and tuned specifically for below‑waterline hull inspection, not general imagery.",
              },
              {
                title: "Works with your current process",
                body: "Use the same divers, ROVs, and cameras you already trust. Hull Check simply adds intelligence on top.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-indigo-400/60 bg-gradient-to-br from-slate-950 via-slate-950/90 to-slate-950/70 p-4 shadow-[0_22px_70px_rgba(15,23,42,0.95)]"
              >
                <h3 className="text-sm font-semibold text-slate-50">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-200/85">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* WHO IT'S FOR */}
        <section id="who" className="mt-16 space-y-6">
          <div className="max-w-xl space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200">
              Who it’s for
            </p>
            <h2 className="text-xl font-semibold text-slate-50 sm:text-2xl">
              Designed around real hull stakeholders.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Ship owners & operators",
                body: "Get a faster view of hull condition between dry docks and after incidents.",
              },
              {
                title: "Inspection companies",
                body: "Deliver richer hull reports without increasing time offshore or diver hours.",
              },
              {
                title: "Port & terminal teams",
                body: "Understand hull condition for visiting vessels and high‑risk assets.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-slate-600/70 bg-slate-950/80 p-4"
              >
                <h3 className="text-sm font-semibold text-slate-50">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-200/85">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* CONTACT */}
        <section
          id="contact"
          className="mt-16 grid gap-8 rounded-3xl border border-slate-700/70 bg-slate-950/90 p-5 shadow-[0_26px_80px_rgba(15,23,42,0.95)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
        >
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200">
              Next step
            </p>
            <h2 className="text-xl font-semibold text-slate-50 sm:text-2xl">
              Ready to see your next hull inspection in NautiCAI?
            </h2>
            <p className="text-sm text-slate-200/85">
              Share a sample hull video or image set with us. We will run it
              through Hull Check and walk you through the findings on a short
              call.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="mailto:contact@nauticai.com?subject=Hull%20Check%20Demo"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 via-violet-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950"
              >
                Request a demo run
              </a>
              <a
                href="https://www.nauticai-ai.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-slate-500/70 bg-slate-950/80 px-4 py-2 text-xs font-medium text-slate-100"
              >
                Learn more about NautiCAI
              </a>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/90 p-4">
            <h3 className="text-sm font-semibold text-slate-50">
              What we’ll prepare for you
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-slate-200/85">
              <li>Example hull inspection results on your own data.</li>
              <li>A walk‑through of the anomaly findings in plain language.</li>
              <li>Discussion on how Hull Check fits into your current workflow.</li>
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">
              No obligation, no technical setup on your side. Just send
              underwater hull footage and we do the rest.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 text-[11px] text-slate-400">
          <span>© 2026 NautiCAI Pte. Ltd.</span>
          <span>Underwater hull anomaly detection</span>
        </div>
      </footer>
    </div>
  );
}
