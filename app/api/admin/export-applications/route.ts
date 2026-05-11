import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRecord = Record<string, unknown>;

function safeFileName(value: unknown) {
  return String(value || "unknown")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";

  const text = String(value).replace(/\r?\n/g, " ");

  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsv(rows: AnyRecord[]) {
  if (rows.length === 0) return "";

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function getDocumentUrl(document: AnyRecord) {
  const directUrl = document.file_url || document.public_url || document.url || "";

  if (directUrl) return String(directUrl);

  const storagePath =
    document.file_path || document.path || document.storage_path || "";

  if (!storagePath) return "";

  const { data } = supabaseAdmin.storage
    .from("documents")
    .getPublicUrl(String(storagePath));

  return data.publicUrl || "";
}

function getDocumentLabel(document: AnyRecord, index: number) {
  return String(
    document.document_type ||
      document.type ||
      document.filename ||
      document.name ||
      `document-${index + 1}`
  );
}

async function fetchFileAsArrayBuffer(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    return await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const format = request.nextUrl.searchParams.get("format") || "csv";
  const includeFiles = request.nextUrl.searchParams.get("files") === "1";

  const [
    { data: applications, error: applicationsError },
    { data: documents, error: documentsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("documents")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  if (applicationsError) {
    return NextResponse.json(
      { success: false, error: applicationsError.message },
      { status: 500 }
    );
  }

  if (documentsError) {
    return NextResponse.json(
      { success: false, error: documentsError.message },
      { status: 500 }
    );
  }

  const safeApplications = (applications || []) as AnyRecord[];
  const safeDocuments = (documents || []) as AnyRecord[];
  const date = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    return new NextResponse("\uFEFF" + toCsv(safeApplications), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="alameen-applications-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const docsByApplicationId = new Map<string, AnyRecord[]>();

  for (const doc of safeDocuments) {
    const applicationId = String(doc.application_id || "");
    if (!applicationId) continue;

    const current = docsByApplicationId.get(applicationId) || [];
    current.push(doc);
    docsByApplicationId.set(applicationId, current);
  }

  const zip = new JSZip();
  const exportedAt = new Date().toISOString();

  zip.file(
    "README.txt",
    `Al Ameen Finance export
Exported at: ${exportedAt}
Applications: ${safeApplications.length}
Documents: ${safeDocuments.length}
Files included: ${includeFiles ? "yes" : "no"}

Use ?format=csv for fast CSV only.
Use ?format=zip&files=1 for ZIP with images.
`
  );

  zip.file("applications.csv", "\uFEFF" + toCsv(safeApplications));
  zip.file("applications.json", JSON.stringify(safeApplications, null, 2));
  zip.file("documents.csv", "\uFEFF" + toCsv(safeDocuments));
  zip.file("documents.json", JSON.stringify(safeDocuments, null, 2));

  const failures: string[] = [];

  for (const app of safeApplications) {
    const appId = String(app.id || "");
    const tracking = safeFileName(app.tracking_id || app.id);
    const appFolder = zip.folder(`documents/${tracking}`);

    if (!appFolder || !appId) continue;

    const appDocs = docsByApplicationId.get(appId) || [];
    appFolder.file("application.json", JSON.stringify(app, null, 2));

    for (const [index, doc] of appDocs.entries()) {
      const url = getDocumentUrl(doc);
      const label = safeFileName(getDocumentLabel(doc, index));
      const extensionFromUrl =
        url.split("?")[0].split(".").pop()?.toLowerCase() || "jpg";
      const extension = extensionFromUrl.length <= 5 ? extensionFromUrl : "jpg";

      appFolder.file(
        `document-${index + 1}-${label}.json`,
        JSON.stringify({ ...doc, resolved_url: url }, null, 2)
      );

      if (!includeFiles) continue;

      if (!url) {
        failures.push(`${tracking}: missing URL for ${label}`);
        continue;
      }

      try {
        const arrayBuffer = await fetchFileAsArrayBuffer(url);
        appFolder.file(`document-${index + 1}-${label}.${extension}`, arrayBuffer);
      } catch (error) {
        failures.push(`${tracking}: failed to download ${label} - ${String(error)}`);
      }
    }
  }

  if (failures.length > 0) {
    zip.file("download-failures.txt", failures.join("\n"));
  }

  const content = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="alameen-applications-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
