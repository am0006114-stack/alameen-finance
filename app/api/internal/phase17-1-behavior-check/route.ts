import { NextResponse } from "next/server";
import { getV3Policy } from "@/app/api/whatsapp/webhook/_lib/v3-os/policy";
import { emptyState } from "@/app/api/whatsapp/webhook/_lib/v3-os/state";
import { interpretTurn } from "@/app/api/whatsapp/webhook/_lib/v3-os/interpreter";
import { createV3TextProviderFromEnv } from "@/app/api/whatsapp/webhook/_lib/v3-os/provider";
import { runNativeConversationKernel, validateNativeConversationReply } from "@/app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel";
import { verifySemanticReply } from "@/app/api/whatsapp/webhook/_lib/v3-os/semanticReplyVerifier";
import type { TruthBundle } from "@/app/api/whatsapp/webhook/_lib/v3-os/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CUSTOMER = "ما عندي كليك ولا محفظة كيف بدي ادفع؟ ليش مش راضي تفهم ومين معي بوت ولا ذكاء اصطناعي؟";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, error: "preview_only" }, { status: 404 });
  }

  const provider = createV3TextProviderFromEnv();
  if (!provider) {
    return NextResponse.json({ ok: false, error: "provider_unavailable" }, { status: 503 });
  }

  const state = emptyState("phase17-1-preview-behavior");
  state.role = {
    currentRole: "omran",
    tier: "supervisor",
    reason: "phase17_1_preview_behavior_check",
    sinceTurnId: "preview:setup",
    introduced: false,
  };
  state.activeApplicationId = "phase17-1-preview-app";
  state.activeTrackingId = "AM-PHASE171-PREVIEW";
  state.lastAssistantText = "تمت الموافقة المبدئية، وإذا اخترت الاستمرار فهناك رسوم فتح ملف 5 دنانير قابلة للاسترداد حسب السياسة المعتمدة.";
  state.commercialDisclosure = {
    version: "2026-09-informed-fee-v2-full-rationale",
    applicationId: "phase17-1-preview-app",
    trackingId: "AM-PHASE171-PREVIEW",
    status: "delivered",
    deliveredAt: new Date().toISOString(),
    deliveredTurnId: "preview:setup",
    acknowledgedAt: null,
    acknowledgedTurnId: null,
  };

  const truth: TruthBundle = {
    confidence: "authoritative",
    source: "verified_state_snapshot",
    contactAccess: "full",
    application: {
      id: "phase17-1-preview-app",
      trackingId: "AM-PHASE171-PREVIEW",
      fullName: "Preview Customer",
      phone: "0770000000",
      email: null,
      status: "customer_confirmed_continue",
      paymentStatus: "pending_payment",
      paymentConfirmedAt: null,
      paymentReference: null,
      deviceId: null,
      deviceName: "Preview Device",
      devicePrice: null,
      installmentMonths: 12,
      downPayment: 0,
      interestRate: null,
      monthlyPayment: null,
      totalWithInterest: null,
      salary: null,
      deliveryDelayUntil: null,
    },
    ambiguousApplications: [],
    policy: getV3Policy(),
    fetchedAt: new Date().toISOString(),
  };

  const turnId = `preview:${Date.now()}`;
  const anchor = interpretTurn({ turnId, customerText: CUSTOMER });
  const recentTurns = [
    "العميل: طلبي عليه موافقة مبدئية؟",
    "الأمين: نعم، تمت الموافقة المبدئية. إذا اخترت الاستمرار، رسوم فتح الملف 5 دنانير وتخضع لسياسة الاسترداد المعتمدة.",
  ];

  const run = await runNativeConversationKernel({
    provider,
    customerText: CUSTOMER,
    turnId,
    state,
    truth,
    recentTurns,
    profileName: "Preview Customer",
    deterministicAnchor: anchor,
    operationalContext: {
      legacyPaymentPrioritySignal: true,
      paymentAccessProblemExpected: true,
      protectedFiveJodStep: false,
    },
  });

  const reply = String(run.reply || "");
  const nativeValidation = validateNativeConversationReply({
    reply,
    turn: run.turn,
    state,
    truth,
    actions: [],
    recentTurns,
    customerText: CUSTOMER,
    disclosureRequiredThisTurn: false,
    protectedFiveJodStep: false,
  });
  const semantic = await verifySemanticReply({ provider, turn: run.turn, state, truth, reply });

  const forbiddenPaymentDump = /0788500337|PAYAMEEEN|AMEEN1ST|AM500337|\/receipt\?tracking=/i.test(reply);
  const mentionsOmran = /عمران/.test(reply);
  const paymentAccess = run.turn.semantic?.paymentIntent === "access_problem";
  const obligations = run.turn.semantic?.answerObligations || [];
  const success = Boolean(
    reply &&
    paymentAccess &&
    mentionsOmran &&
    !forbiddenPaymentDump &&
    nativeValidation.pass &&
    semantic.pass
  );

  return NextResponse.json({
    ok: success,
    customer: CUSTOMER,
    reply,
    paymentIntent: run.turn.semantic?.paymentIntent || null,
    obligations,
    currentQuestion: run.turn.semantic?.currentQuestion || null,
    topics: run.turn.topics,
    requestedActions: run.turn.requestedActions,
    modelUsed: run.modelUsed,
    modelError: run.modelError,
    nativeValidation,
    semantic,
    assertions: {
      paymentAccess,
      mentionsOmran,
      forbiddenPaymentDump,
      nativeValidationPass: nativeValidation.pass,
      semanticPass: semantic.pass,
    },
  }, { status: success ? 200 : 422 });
}
