import { notifyV3Discord } from "../v3-os/discordNotifier";
import type { ConversationState, TruthBundle } from "../v3-os/types";
import type { V4HumanEscalationResult } from "./types";

/**
 * Named V4 personas stay inside the AI team. This bridge is used only when the
 * customer explicitly asks for a real human/employee. The customer-facing reply
 * claims a handoff request only after the existing durable notification ledger has
 * accepted/sent it (or proves an equivalent request already exists).
 */
export async function requestRealHumanEscalation(input: {
  turnId: string;
  customerText: string;
  state: ConversationState;
  truth: TruthBundle;
}): Promise<V4HumanEscalationResult> {
  const app = input.truth.application;
  const actionKey = `real_human_contact:${app?.id || input.state.waId}`;
  try {
    const result = await notifyV3Discord({
      event: "manual_action_required",
      applicationId: app?.id || null,
      trackingId: app?.trackingId || input.state.activeTrackingId || null,
      waId: input.state.waId,
      actionKey,
      title: "👤 العميل طلب التواصل مع موظف فعلي",
      description: "العميل طلب صراحةً التواصل مع موظف/إنسان فعلي. لا يجوز للذكاء الاصطناعي الادعاء بأن موظفًا دخل المحادثة قبل حدوث ذلك فعليًا.",
      details: {
        action: "real_human_contact",
        turnId: input.turnId,
        "رسالة العميل": input.customerText,
      },
    });

    const duplicate = result.suppressed && result.reason === "duplicate_actionable_notification";
    const recorded = Boolean(result.sent || duplicate);
    return recorded
      ? {
          recorded: true,
          receiptId: duplicate ? `human-contact-existing:${actionKey}` : `human-contact-sent:${actionKey}:${input.turnId}`,
          reply: "أكيد. سجلت طلبك للتواصل مع موظف فعلي على نفس المتابعة. لحد ما يدخل موظف فعلي أو يصير تواصل موثق، أنا مكمل معك هون وما رح أدعي إن التحويل صار قبل ما يصير.",
          blocker: null,
        }
      : {
          recorded: false,
          receiptId: null,
          reply: "طلبك بالتواصل مع موظف فعلي واضح، بس ما قدرت أثبت تسجيل التحويل بهاللحظة، لذلك ما رح أقول إنه تم. أنا مكمل معك هون وبقدر أساعدك بالمشكلة نفسها الآن.",
          blocker: result.reason || "human_escalation_not_recorded",
        };
  } catch (error) {
    return {
      recorded: false,
      receiptId: null,
      reply: "طلبك بالتواصل مع موظف فعلي واضح، بس ما قدرت أثبت تسجيل التحويل بهاللحظة، لذلك ما رح أقول إنه تم. أنا مكمل معك هون وبقدر أساعدك بالمشكلة نفسها الآن.",
      blocker: error instanceof Error ? error.message : "human_escalation_error",
    };
  }
}
