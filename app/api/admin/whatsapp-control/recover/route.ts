import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyRecoveryCandidate } from "@/app/api/whatsapp/webhook/_lib/v3-os/operationsAutopilot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_HOURS = [1, 2, 6, 12, 24, 48, 168];

type MessageRow = {
  id?: string | null; wa_id?: string | null; direction?: string | null; body?: string | null;
  message_id?: string | null; message_type?: string | null; created_at?: string | null; intent?: string | null;
};

function isSynthetic(row: MessageRow) {
  if (String(row.message_type || "").toLowerCase() === "admin_control") return true;
  return String(row.message_type || "").toLowerCase() === "template"
    && /تم إرسال Template الموافقة المبدئية للعميل|Template الموافقة المبدئية/i.test(String(row.body || ""));
}

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => ({}));
  const rawHours = Number(input?.hours || 24);
  const hours = ALLOWED_HOURS.includes(rawHours) ? rawHours : 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const [{ data: rows, error }, { data: states, error: stateError }] = await Promise.all([
    supabaseAdmin.from("whatsapp_messages")
      .select("id,wa_id,direction,body,message_id,message_type,created_at,intent")
      .gte("created_at", since).order("created_at", { ascending: true }).limit(12000),
    supabaseAdmin.from("whatsapp_v3_conversation_state").select("wa_id,state,updated_at").limit(5000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (stateError) console.error("Phase 9 recovery diagnostic state read failed", stateError.message);

  const semanticOpen = new Set<string>();
  for (const row of states || []) {
    const loops = Array.isArray((row as any)?.state?.openLoops) ? (row as any).state.openLoops : [];
    if (loops.some((loop: any) => loop?.owedBy === "ai" && loop?.state === "open")) semanticOpen.add(String((row as any).wa_id || ""));
  }

  const byWa = new Map<string, { incoming?: MessageRow; outgoing?: MessageRow }>();
  for (const row of (rows || []) as MessageRow[]) {
    if (isSynthetic(row)) continue;
    const wa = String(row.wa_id || "").trim(); if (!wa) continue;
    const item = byWa.get(wa) || {};
    if (row.direction === "incoming") item.incoming = row;
    if (row.direction === "outgoing") item.outgoing = row;
    byWa.set(wa, item);
  }

  const now = Date.now();
  const unresolved = Array.from(byWa.entries()).flatMap(([waId, item]) => {
    if (!item.incoming?.created_at) return [];
    const inTs = new Date(item.incoming.created_at).getTime();
    const outTs = item.outgoing?.created_at ? new Date(item.outgoing.created_at).getTime() : 0;
    const semantic = semanticOpen.has(waId);
    const chronological = inTs > outTs;
    if (!semantic && !chronological) return [];
    const recovery = classifyRecoveryCandidate({ body: item.incoming.body, intent: item.incoming.intent, messageType: item.incoming.message_type, ageMs: now - inTs });
    return [{ waId, body: item.incoming.body || "", createdAt: item.incoming.created_at, semanticOpen: semantic, chronologicalOpen: chronological, classification: recovery }];
  }).sort((a, b) => Number(b.semanticOpen) - Number(a.semanticOpen) || a.classification.priority - b.classification.priority || new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  // Phase 9 deliberately has no customer send here. The old Recovery sender was a
  // second conversation/egress plane and is retired. This endpoint is diagnostics only.
  return NextResponse.json({
    ok: true,
    diagnosticOnly: true,
    sent: 0, attempted: 0, failed: 0,
    unresolvedCount: unresolved.length,
    unresolved: unresolved.slice(0, 100),
    message: "Phase 9: Recovery الإرسال التلقائي متوقف. هذه قائمة تشخيص فقط؛ الردود الحية يملكها Conversation OS وحده.",
  });
}
