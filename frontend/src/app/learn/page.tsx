"use client";

import Image from "next/image";
import { PageShell } from "@/components/PageShell";

const LEARN_IMAGES = {
  step1: "/step1-upload.png",
  step2: "/step2-pipeline.svg",
  step3Dashboard: "/step3-dashboard.png",
  step3Reports: "/step3-reports.png",
};

export default function LearnPage() {
  return (
    <PageShell backgroundSrc="/bg3.avif">
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "40px 40px 56px",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "rgba(186,230,255,0.65)",
            }}
          >
            Learn
          </p>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: 6,
            }}
          >
            How NautiCAI Works
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "rgba(226,238,255,0.88)",
              maxWidth: 540,
            }}
          >
            From raw underwater footage to a structured hull inspection report — this page
            walks through the full flow your demo will show.
          </p>
        </div>

        {/* 1. Capture & Upload */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1.2fr)",
            gap: 24,
            marginBottom: 32,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              background: "rgba(8,16,40,0.95)",
              borderRadius: 18,
              border: "1px solid rgba(148,163,184,0.55)",
              padding: 22,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "rgba(186,230,255,0.65)",
                marginBottom: 4,
              }}
            >
              Step 1 · Capture & upload
            </p>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              You film once. NautiCAI does the rest.
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "rgba(226,238,255,0.85)",
                lineHeight: 1.7,
              }}
            >
              Divers or ROVs capture a simple hull sweep — bow to stern, port and starboard.
              You upload the raw video or still frames into the{" "}
              <strong>Detection Console</strong>. The app accepts typical inspection formats
              (JPG / PNG / WebP / MP4) and stores them securely together with vessel
              metadata in your Neon Postgres database.
            </p>
            <ul
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "rgba(186,230,255,0.85)",
                paddingLeft: 18,
              }}
            >
              <li>Vessel name and notes are stored with every inspection.</li>
              <li>Uploads are authenticated via your manual login (no Supabase).</li>
              <li>Each upload is given a unique inspection ID for traceability.</li>
            </ul>
          </div>

          {/* Step 1 image: Detection Console upload */}
          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(148,163,184,0.45)",
              background: "rgba(15,23,42,0.90)",
              overflow: "hidden",
              minHeight: 200,
            }}
          >
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/10" }}>
              <Image
                src={LEARN_IMAGES.step1}
                alt="Detection Console — upload hull footage"
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                style={{ objectFit: "cover" }}
                unoptimized
                onError={(e) => {
                  const t = e.target as HTMLImageElement;
                  t.style.display = "none";
                  if (t.nextElementSibling) (t.nextElementSibling as HTMLElement).style.display = "flex";
                }}
              />
              <div
                style={{
                  display: "none",
                  position: "absolute",
                  inset: 0,
                  background: "rgba(15,23,42,0.95)",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(191,219,254,0.85)",
                  fontSize: 12,
                  textAlign: "center",
                  padding: 16,
                }}
              >
                Add <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>step1-upload.jpg</code> in <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>public/learn/</code>
              </div>
            </div>
          </div>
        </section>

        {/* 2. YOLOv8 detection */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.4fr)",
            gap: 24,
            marginBottom: 32,
            alignItems: "stretch",
          }}
        >
          {/* Step 2 image: YOLOv8 pipeline (520×280 SVG — show full width, no crop) */}
          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(148,163,184,0.45)",
              background: "rgba(15,23,42,0.90)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ position: "relative", width: "100%", aspectRatio: "52/28" }}>
              <Image
                src={LEARN_IMAGES.step2}
                alt="YOLOv8 pipeline — model to inspections table"
                fill
                sizes="(max-width: 640px) 100vw, 45vw"
                style={{ objectFit: "contain" }}
                unoptimized
                onError={(e) => {
                  const t = e.target as HTMLImageElement;
                  t.style.display = "none";
                  if (t.nextElementSibling) (t.nextElementSibling as HTMLElement).style.display = "flex";
                }}
              />
              <div
                style={{
                  display: "none",
                  position: "absolute",
                  inset: 0,
                  background: "rgba(15,23,42,0.95)",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(191,219,254,0.85)",
                  fontSize: 12,
                  textAlign: "center",
                  padding: 16,
                }}
              >
                Add <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>step2-pipeline.jpg</code> in <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>public/learn/</code>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "rgba(8,16,40,0.95)",
              borderRadius: 18,
              border: "1px solid rgba(148,163,184,0.55)",
              padding: 22,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "rgba(186,230,255,0.65)",
                marginBottom: 4,
              }}
            >
              Step 2 · Automated detection
            </p>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              YOLOv8 scans every frame for hull anomalies.
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "rgba(226,238,255,0.85)",
                lineHeight: 1.7,
              }}
            >
              Behind the scenes, a FastAPI backend loads your fine‑tuned YOLOv8 model and
              runs inference on each frame. It extracts bounding boxes, classes and
              confidence scores for corrosion, marine growth, dents, coating damage and
              debris.
            </p>
            <ul
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "rgba(186,230,255,0.85)",
                paddingLeft: 18,
              }}
            >
              <li>Detections are summarised into a risk score (0–10) and risk level.</li>
              <li>
                The raw detections plus summary are stored in a Neon `inspections` table,
                keyed by inspection ID.
              </li>
              <li>Annotated image/video URLs are saved so the results page can overlay boxes.</li>
            </ul>
          </div>
        </section>

        {/* 3. Dashboard & reports */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1.3fr)",
            gap: 24,
            marginBottom: 32,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              background: "rgba(15,23,42,0.92)",
              borderRadius: 18,
              border: "1px solid rgba(148,163,184,0.55)",
              padding: 22,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "rgba(186,230,255,0.65)",
                marginBottom: 4,
              }}
            >
              Step 3 · Dashboard & reports
            </p>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              From detections to vessel‑level decisions.
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "rgba(226,238,255,0.85)",
                lineHeight: 1.7,
              }}
            >
              The <strong>Dashboard</strong> aggregates inspections over time — total
              inspections, high‑risk vessels, anomalies found and average risk score. The{" "}
              <strong>Reports</strong> view lists every inspection and links straight into
              the detailed results and exportable JSON/PDF.
            </p>
            <ul
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "rgba(186,230,255,0.85)",
                paddingLeft: 18,
              }}
            >
              <li>Neon acts as the single source of truth for all inspection history.</li>
              <li>Each row can be exported for offline reporting or integration.</li>
              <li>Risk badges and anomaly counts update automatically as new runs complete.</li>
            </ul>
          </div>

          {/* Step 3 images: Dashboard + Reports */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                borderRadius: 18,
                border: "1px solid rgba(148,163,184,0.45)",
                background: "rgba(15,23,42,0.90)",
                overflow: "hidden",
                position: "relative",
                aspectRatio: "16/9",
              }}
            >
              <Image
                src={LEARN_IMAGES.step3Dashboard}
                alt="Dashboard — overview and recent inspections"
                fill
                sizes="(max-width: 640px) 100vw, 45vw"
                style={{ objectFit: "cover" }}
                unoptimized
                onError={(e) => {
                  const t = e.target as HTMLImageElement;
                  t.style.display = "none";
                  if (t.nextElementSibling) (t.nextElementSibling as HTMLElement).style.display = "flex";
                }}
              />
              <div
                style={{
                  display: "none",
                  position: "absolute",
                  inset: 0,
                  background: "rgba(15,23,42,0.95)",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(191,219,254,0.85)",
                  fontSize: 12,
                  textAlign: "center",
                  padding: 12,
                }}
              >
                Add <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>step3-dashboard.jpg</code> in <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>public/learn/</code>
              </div>
            </div>
            <div
              style={{
                borderRadius: 18,
                border: "1px solid rgba(148,163,184,0.45)",
                background: "rgba(15,23,42,0.90)",
                overflow: "hidden",
                position: "relative",
                aspectRatio: "16/9",
              }}
            >
              <Image
                src={LEARN_IMAGES.step3Reports}
                alt="Reports — inspection list and export"
                fill
                sizes="(max-width: 640px) 100vw, 45vw"
                style={{ objectFit: "cover" }}
                unoptimized
                onError={(e) => {
                  const t = e.target as HTMLImageElement;
                  t.style.display = "none";
                  if (t.nextElementSibling) (t.nextElementSibling as HTMLElement).style.display = "flex";
                }}
              />
              <div
                style={{
                  display: "none",
                  position: "absolute",
                  inset: 0,
                  background: "rgba(15,23,42,0.95)",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(191,219,254,0.85)",
                  fontSize: 12,
                  textAlign: "center",
                  padding: 12,
                }}
              >
                Add <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>step3-reports.jpg</code> in <code style={{ background: "rgba(30,64,175,0.3)", padding: "2px 6px", borderRadius: 4 }}>public/learn/</code>
              </div>
            </div>
          </div>
        </section>

        {/* 4. What you show in the demo */}
        <section
          style={{
            marginTop: 12,
            paddingTop: 18,
            borderTop: "1px solid rgba(148,163,184,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
            color: "rgba(191,219,254,0.85)",
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "rgba(186,230,255,0.75)",
            }}
          >
            Demo flow (for investors & customers)
          </p>
          <ol style={{ paddingLeft: 18, marginTop: 2 }}>
            <li>Log in to NautiCAI and land on the Dashboard.</li>
            <li>Click &ldquo;New Inspection&rdquo; → upload hull footage on the Detection Console.</li>
            <li>Run the model and land on the Results page for that inspection.</li>
            <li>Jump back to Dashboard and Reports to show how the metrics and lists updated.</li>
          </ol>
        </section>
      </div>
    </PageShell>
  );
}

