import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchAdminDocument,
  isIdentityDocument,
} from "@/lib/adminDocumentVault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentRecord = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const documentId = request.nextUrl.searchParams.get("id")?.trim() || "";

  if (!documentId) {
    return NextResponse.json(
      { success: false, error: "Missing document id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: "Document not found" },
      { status: 404 }
    );
  }

  const document = data as DocumentRecord;

  // Payment receipts and every other non-identity document stay on their
  // existing path. This endpoint is intentionally identity-only.
  if (!isIdentityDocument(document)) {
    return NextResponse.json(
      { success: false, error: "Unsupported document type" },
      { status: 400 }
    );
  }

  try {
    const { response, source } = await fetchAdminDocument(document);
    const body = await response.arrayBuffer();

    const headers = new Headers();
    headers.set(
      "Content-Type",
      response.headers.get("content-type") || "application/octet-stream"
    );
    headers.set("Content-Length", String(body.byteLength));
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("X-Alameen-Document-Source", source);

    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) {
      headers.set("Content-Disposition", contentDisposition);
    }

    return new NextResponse(body, {
      status: 200,
      headers,
    });
  } catch (fetchError) {
    console.error("Failed to serve admin identity document:", fetchError);

    return NextResponse.json(
      { success: false, error: "Unable to load document" },
      { status: 502 }
    );
  }
}
