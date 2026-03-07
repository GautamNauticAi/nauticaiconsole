import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, context, "GET");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, context, "POST");
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, context, "OPTIONS");
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
  method: string
) {
  const { path = [] } = await context.params;
  const pathStr = path.length ? `/${path.join("/")}` : "";
  const url = `${BACKEND.replace(/\/$/, "")}${pathStr}${request.nextUrl.search}`;

  const headers = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) headers.set("Authorization", auth);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "OPTIONS") {
    body = await request.arrayBuffer();
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    });

    const data = await res.text();
    let parsed: unknown;
    try {
      parsed = data ? JSON.parse(data) : null;
    } catch {
      parsed = data;
    }

    return NextResponse.json(parsed, {
      status: res.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[api/backend proxy]", err);
    return NextResponse.json(
      { error: "Backend unreachable", details: String(err) },
      { status: 502 }
    );
  }
}
