export type AwsIngestSource = "hull" | "pipeline";

export type AwsPresignResponse = {
  uploadUrl: string;
  key: string;
  bucket: string;
  source: AwsIngestSource;
};

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("nauticai:token");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function requestPresignedUpload(
  source: AwsIngestSource,
  file: File,
  vesselName?: string,
): Promise<AwsPresignResponse> {
  const res = await fetch("/api/aws/presign", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      source,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      vesselName: vesselName?.trim() || undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as AwsPresignResponse & { detail?: string };
  if (!res.ok) {
    throw new Error(data.detail || `Presign failed (${res.status})`);
  }
  return data;
}

export async function uploadFileToS3Ingest(
  source: AwsIngestSource,
  file: File,
  vesselName?: string,
  onProgress?: (pct: number) => void,
): Promise<AwsPresignResponse> {
  const presign = await requestPresignedUpload(source, file, vesselName);
  onProgress?.(10);

  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  onProgress?.(100);

  if (!putRes.ok) {
    throw new Error(
      `S3 upload failed (${putRes.status}). Check bucket CORS allows PUT from this site.`,
    );
  }
  return presign;
}

export async function uploadFilesToS3Ingest(
  source: AwsIngestSource,
  files: File[],
  vesselName?: string,
  onFileProgress?: (fileIndex: number, pct: number) => void,
): Promise<AwsPresignResponse[]> {
  const results: AwsPresignResponse[] = [];
  for (let i = 0; i < files.length; i++) {
    const r = await uploadFileToS3Ingest(source, files[i], vesselName, (pct) =>
      onFileProgress?.(i, pct),
    );
    results.push(r);
  }
  return results;
}
