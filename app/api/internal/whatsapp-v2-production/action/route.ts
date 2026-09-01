import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadConversationState, saveConversationState } from "@/app/api/whatsapp/webhook/_lib/v2-conversation";

export const dynamic = "force-dynamic";

type HumanActionType = "human_handoff" | "call_request" | "application_data_correction";

async function setAutoReplyState(waId: string, ignored: boolean, source: string) {
  const clean = String(waId || "").replace(/\D/g, "");
  if (!clean) return;
  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    wa_id: clean,
    direction: "outgoing",
    customer_name: null,
    message_id: null,
    message_type: "admin_control",
    body: ignored ? "AUTO_REPLY_IGNORED" : "AUTO_REPLY_ACTIVE",
    intent: null,
    tracking_id: null,
    application_id: null,
    needs_human_review: ignored,
    handled_by_ai: false,
    raw_payload: {
      source,
      auto_reply_ignored: ignored,
      changed_at: new Date().toISOString(),
      runtime_version: "v2.1.0",
    },
  });
  if (error) throw error;
}

function queueTopic(actionType: HumanActionType) {
  if (actionType === "human_handoff") return "human_handoff" as const;
  if (actionType === "call_request") return "call_request" as const;
  return "correction" as const;
}

async function updateConversationActionState(
  waId: string,
  actionType: HumanActionType,
  status: "accepted" | "closed",
) {
  const clean = String(waId || "").replace(/\D/g, "");
  if (!clean) return;
  const state = await loadConversationState(clean);
  const stamp = new Date().toISOString();
  const topic = queueTopic(actionType);

  state.openLoops = (state.openLoops || []).map((loop) => {
    if (loop.topic !== topic || loop.owedBy !== "staff" || loop.state !== "open") return loop;
    return {
      ...loop,
      state: status === "closed" ? "answered" as const : "open" as const,
      updatedAt: stamp,
    };
  });

  if (actionType === "human_handoff") {
    state.humanHandoff = status === "closed"
      ? { requested: false, requestedAt: state.humanHandoff.requestedAt || null, status: "closed" }
      : { requested: true, requestedAt: state.humanHandoff.requestedAt || stamp, status: "accepted" };
  }

  state.updatedAt = stamp;
  await saveConversationState(state);
}

async function hasOtherActiveHumanHandoff(waId: string, excludeId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_v2_human_action_queue")
    .select("id")
    .eq("wa_id", waId)
    .eq("action_type", "human_handoff")
    .in("status", ["pending", "accepted"])
    .neq("id", excludeId)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function manuallyIgnoredByAdmin(waId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("body,raw_payload,created_at")
    .eq("wa_id", waId)
    .eq("direction", "outgoing")
    .eq("message_type", "admin_control")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  for (const row of data || []) {
    const raw = row.raw_payload as any;
    if (raw?.source === "admin_whatsapp_ignore_button") {
      return String(row.body || "") === "AUTO_REPLY_IGNORED";
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  const action = String(body?.action || "").trim();
  if (!id || !["accept", "close"].includes(action)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const { data: row, error: readError } = await supabaseAdmin
      .from("whatsapp_v2_human_action_queue")
      .select("id,wa_id,status,action_type")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const actionType = String(row.action_type || "") as HumanActionType;
    if (!["human_handoff", "call_request", "application_data_correction"].includes(actionType)) {
      return NextResponse.json({ error: "Unsupported action type" }, { status: 400 });
    }
    if (action === "accept" && !["pending", "accepted"].includes(String(row.status || ""))) {
      return NextResponse.json({ error: "Action is already closed" }, { status: 409 });
    }

    const waId = String(row.wa_id || "").replace(/\D/g, "");
    const now = new Date().toISOString();
    if (action === "accept") {
      const { error } = await supabaseAdmin
        .from("whatsapp_v2_human_action_queue")
        .update({ status: "accepted", accepted_at: now, updated_at: now })
        .eq("id", id)
        .in("status", ["pending", "accepted"]);
      if (error) throw error;
      await updateConversationActionState(waId, actionType, "accepted");
      // Only a real human-handoff owns the auto-reply pause. Call/correction queues never
      // change ignore state, so closing them cannot accidentally re-enable a handed-off chat.
      if (actionType === "human_handoff") {
        await setAutoReplyState(waId, true, "v2.1_human_action_accept");
      }
    } else {
      const { error } = await supabaseAdmin
        .from("whatsapp_v2_human_action_queue")
        .update({ status: "closed", closed_at: now, updated_at: now })
        .eq("id", id);
      if (error) throw error;
      await updateConversationActionState(waId, actionType, "closed");

      if (actionType === "human_handoff") {
        const [otherHandoffOpen, manualIgnore] = await Promise.all([
          hasOtherActiveHumanHandoff(waId, id),
          manuallyIgnoredByAdmin(waId),
        ]);
        if (!otherHandoffOpen && !manualIgnore) {
          await setAutoReplyState(waId, false, "v2.1_human_action_close");
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
