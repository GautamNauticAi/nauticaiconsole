import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";

type IngestSource = "hull" | "pipeline";

function awsReady(): { bucket: string; region: string } | null {
  const bucket = process.env.AWS_S3_INGESTION_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-east-1";
  if (!bucket) return null;
  if (!process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    return null;
  }
  return { bucket, region };
}

function sanitizeSegment(value: string, maxLen: number): string {
  const s = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return (s || "upload").slice(0, maxLen);
}

function buildObjectKey(source: IngestSource, fileName: string, vesselName?: string): string {
  const prefix = (process.env.AWS_S3_INGESTION_PREFIX || "incoming").replace(/^\/+|\/+$/g, "");
  const vessel = sanitizeSegment(vesselName || "demo", 64);
  const file = sanitizeSegment(fileName || "image.jpg", 120);
  return `${prefix}/${source}/${vessel}_${Date.now()}_${file}`;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ detail: "Sign in required" }, { status: 401 });
  }

  const cfg = awsReady();
  if (!cfg) {
    return NextResponse.json(
      {
        detail:
          "AWS ingestion is not configured. Set AWS_S3_INGESTION_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY on the frontend host (Vercel).",
      },
      { status: 503 },
    );
  }

  let body: {
    source?: string;
    fileName?: string;
    contentType?: string;
    vesselName?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const source = (body.source || "").trim().toLowerCase();
  if (source !== "hull" && source !== "pipeline") {
    return NextResponse.json({ detail: "source must be hull or pipeline" }, { status: 400 });
  }

  const fileName = (body.fileName || "").trim();
  if (!fileName) {
    return NextResponse.json({ detail: "fileName is required" }, { status: 400 });
  }

  const contentType = (body.contentType || "application/octet-stream").trim();
  const key = buildObjectKey(source as IngestSource, fileName, body.vesselName);

  const client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!.trim(),
    },
  });

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });

  return NextResponse.json({
    uploadUrl,
    key,
    bucket: cfg.bucket,
    source,
  });
}
