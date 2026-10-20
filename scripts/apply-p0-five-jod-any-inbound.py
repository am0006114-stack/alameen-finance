from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts"
SELFTEST = ROOT / "scripts/v3-p0-five-jod-any-inbound-selftest.cjs"

source = RUNTIME.read_text(encoding="utf-8")


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"PATCH FAILED [{label}]: start marker missing")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"PATCH FAILED [{label}]: end marker missing")
    if text.find(start, a + len(start)) >= 0 and text.find(start, a + len(start)) < b:
        raise SystemExit(f"PATCH FAILED [{label}]: ambiguous start marker")
    return text[:a] + replacement + text[b:]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH FAILED [{label}]: expected 1 match, found {count}")
    return text.replace(old, new, 1)


# 1) Commercial decision authority:
#    authoritative preliminary approval + ANY non-decline inbound opens continuation.
start = "  const semanticContinueVeto = semanticContinuationVeto(turn);\n"
end = "  const continuationPersistence = await persistExplicitContinuation({\n"
replacement = '''  const semanticContinueVeto = semanticContinuationVeto(turn);
  const explicitNonContinuationThisTurn = Boolean(
    explicitDoNotContinueText(effectiveCustomerText, executionState.lastAssistantText)
    || turn.requestedActions.includes("cancel_application")
    || turn.requestedActions.includes("request_refund")
    || turn.semantic?.decision.cancellation === "requested"
    || turn.semantic?.decision.continuation === "declined"
  );
  const postApprovalAnyInboundTrigger = Boolean(
    truthAfterActions.contactAccess !== "safe_preview"
    && applicationJourneyStage(truthAfterActions.application) === "preliminary_approved_waiting_decision"
    && String(effectiveCustomerText || "").trim()
    && !semanticContinueVeto
    && !explicitNonContinuationThisTurn
  );
  const continuationDecisionThisTurn = truthAfterActions.contactAccess !== "safe_preview"
    && !semanticContinueVeto
    && !explicitNonContinuationThisTurn
    && (
      postApprovalAnyInboundTrigger
      || (!disclosureRequiredThisTurn && (
        semanticConfirmsContinuation(turn)
        || informedCommercialContinuationConfirmed({ state: executionState, truth: truthAfterActions, turn, customerText: effectiveCustomerText })
        || explicitContinuationText(effectiveCustomerText)
        || paymentPriorityAfterDisclosure
        || numericContinuationShortcut
        || turn.requestedActions.includes("continue_application")
        || plan.actions.some((x) => x.action === "continue_application" && !x.requiresConfirmation)
      ))
    );
  const truthAtContinuationDecision = truthAfterActions;

'''
source = replace_between(source, start, end, replacement, "post-approval any inbound authority")

# 2) Read-after-write monotonic bridge: successful mutation cannot be downgraded by a lagging read.
old = '''    truthAfterActions = stabilizeTruthSnapshot({ truth: truthAfterActions, state: executionState, previousTruth: truthAtContinuationDecision });
    const discordApp = truthAfterActions.application || truthAtContinuationDecision.application;
'''
new = '''    truthAfterActions = stabilizeTruthSnapshot({ truth: truthAfterActions, state: executionState, previousTruth: truthAtContinuationDecision });
    if (
      continuationPersistence.updated
      && truthAtContinuationDecision.application
      && truthAfterActions.application
      && truthAfterActions.application.id === truthAtContinuationDecision.application.id
      && applicationJourneyStage(truthAfterActions.application) === "preliminary_approved_waiting_decision"
    ) {
      truthAfterActions = {
        ...truthAfterActions,
        application: {
          ...truthAfterActions.application,
          status: "customer_confirmed_continue",
          paymentStatus: "pending_payment",
        },
      };
      console.warn("V3 continuation read-after-write bridged from authoritative mutation result", {
        applicationId: truthAfterActions.application.id,
        turnId: input.turnId,
      });
    }
    const discordApp = truthAfterActions.application || truthAtContinuationDecision.application;
'''
source = replace_once(source, old, new, "monotonic continuation truth bridge")

# 3) Discord source clearly identifies the new broad post-approval trigger.
old = '''            "مصدر القرار": numericContinuationShortcut ? "واتساب — الرقم 1" : "واتساب — تأكيد صريح",
'''
new = '''            "مصدر القرار": postApprovalAnyInboundTrigger
              ? "واتساب — أول رسالة بعد الموافقة المبدئية"
              : numericContinuationShortcut
                ? "واتساب — الرقم 1"
                : "واتساب — تأكيد صريح",
'''
source = replace_once(source, old, new, "Discord continuation source")

# 4) Persistence failure is fail-closed for payment disclosure.
old = '''        description: "تم الحفاظ على خطوة 5 دنانير للعميل، لكن تعذر تثبيت قرار الاستمرار على حالة الطلب في قاعدة البيانات. راجع الطلب يدويًا.",
'''
new = '''        description: "تعذر تثبيت قرار الاستمرار على حالة الطلب في قاعدة البيانات، لذلك لم يتم فتح بيانات دفع الـ5 دنانير للعميل. راجع الطلب يدويًا.",
'''
source = replace_once(source, old, new, "persistence failure wording")

# 5) Payment is persistence-first, then same-turn question handling continues after the mandatory block.
start = "  const protectedFiveJodStep = continuationRevenueReadyAtDecision;\n"
end = "  let verification: VerificationReport = PASS;\n"
replacement = '''  const continuationPersistenceConfirmed = continuationPersistence.updated || continuationPersistence.alreadyRecorded;
  const protectedFiveJodStep = Boolean(
    continuationDecisionThisTurn
    && continuationPersistenceConfirmed
    && applicationJourneyStage(truthAfterActions.application) === "continuation_confirmed_fee_due"
  );
  const authoritativeCommercialJourneyReply = disclosureRequiredThisTurn
    ? buildInformedCommercialDisclosureReply(truthAfterActions)
    : protectedFiveJodStep
      ? buildMandatoryFiveJodContinuationReply(turn, truthAfterActions)
      : null;
  const criticalOperationalReply = criticalOperationalFallbackReply({
    truth: truthAfterActions,
    state: conversationState,
    customerText: effectiveCustomerText,
    turn,
    actions,
  });

  const hasCurrentCustomerQuestion = Boolean(
    turn.semantic?.currentQuestion
    || turn.semantic?.answerObligations?.length
    || turn.acts.some((act) => act.type === "ask")
  );
  const nativeQuestionCandidate = String(nativeKernelInitial.reply || "").trim();
  const nativeQuestionFollowup = protectedFiveJodStep
    && hasCurrentCustomerQuestion
    && nativeQuestionCandidate
    && !resemblesFullCommercialDisclosure(nativeQuestionCandidate)
      ? nativeQuestionCandidate
          .split(/(?<=[.!؟])\\s+|\\n+/)
          .map((segment) => segment.trim())
          .filter(Boolean)
          .filter((segment) => !/(?:رسوم\\s+فتح\\s+الملف|(?:5|٥|خمس)\\s*(?:دنانير|دينار)|orange\\s*money|اورنج\\s+موني|أورنج\\s+موني|\\bcliq\\b|كليك|PAYAMEEEN|AMEEN1ST|AM500337|0788500337|رفع\\s+الوصل|ارفع\\s+الوصل|بيانات\\s+الدفع|هل\\s+ترغب\\s+بالاستمرار|اريد\\s+الاستمرار|أريد\\s+الاستمرار|لا[،,]?\\s+مش\\s+هسا)/i.test(segment))
          .join(" ")
          .trim()
      : "";
  const postPaymentFollowup = protectedFiveJodStep
    ? (criticalOperationalReply || nativeQuestionFollowup || null)
    : null;
  const protectedFiveJodReply = protectedFiveJodStep && authoritativeCommercialJourneyReply
    ? (postPaymentFollowup
      ? `${authoritativeCommercialJourneyReply}\\n\\n${postPaymentFollowup}`
      : authoritativeCommercialJourneyReply)
    : null;

  // Phase 18 TRUE SINGLE WRITER for non-commercial operational turns.
  // Phase P0 continuation exception: the mandatory 5-JOD handoff is first, then
  // the same turn's non-payment question/operational answer may continue below it.
  let reply: string | null = plan.shouldRespond
    ? (currentTurnSafetyReply || (protectedFiveJodReply
        ? protectedFiveJodReply
        : (authoritativeCommercialJourneyReply
          ? (criticalOperationalReply || authoritativeCommercialJourneyReply || nativeKernelInitial.reply)
          : (nativeKernelInitial.reply || criticalOperationalReply))))
    : null;
'''
source = replace_between(source, start, end, replacement, "persistence-first payment + same-turn question")

RUNTIME.write_text(source, encoding="utf-8")

SELFTEST.write_text(r'''const fs = require("fs");
const path = require("path");
const root = process.argv[2] || process.cwd();
const runtime = fs.readFileSync(path.join(root, "app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts"), "utf8");
const persist = fs.readFileSync(path.join(root, "app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts"), "utf8");
function ok(cond, msg) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("PASS:", msg); }

ok(runtime.includes('postApprovalAnyInboundTrigger'), 'preliminary approval has broad any-inbound continuation latch');
ok(runtime.includes('applicationJourneyStage(truthAfterActions.application) === "preliminary_approved_waiting_decision"'), 'broad latch is scoped to authoritative preliminary approval');
ok(runtime.includes('explicitNonContinuationThisTurn') && runtime.includes('turn.requestedActions.includes("cancel_application")'), 'explicit decline/cancellation veto remains authoritative');
ok(runtime.includes('turn.requestedActions.includes("request_refund")'), 'refund intent cannot accidentally open payment');
ok(runtime.includes('continuationPersistence.updated || continuationPersistence.alreadyRecorded'), 'payment depends on durable continuation persistence');
ok(runtime.includes('status: "customer_confirmed_continue"') && runtime.includes('paymentStatus: "pending_payment"'), 'read-after-write lag is bridged monotonically from successful mutation');
ok(runtime.includes('applicationJourneyStage(truthAfterActions.application) === "continuation_confirmed_fee_due"'), 'protected payment block requires fee-due truth after persistence');
ok(runtime.includes('customer_continue_payment_ready'), 'canonical Discord continuation event is preserved');
ok(runtime.includes('أول رسالة بعد الموافقة المبدئية'), 'Discord identifies post-approval broad trigger');
ok(runtime.includes('لم يتم فتح بيانات دفع الـ5 دنانير'), 'persistence failure fails closed for payment disclosure');
ok(runtime.includes('hasCurrentCustomerQuestion') && runtime.includes('nativeQuestionFollowup'), 'same-turn customer questions continue after payment block');
ok(runtime.includes('protectedFiveJodReply') && runtime.includes('${authoritativeCommercialJourneyReply}\\n\\n${postPaymentFollowup}'), 'mandatory payment block is ordered before same-turn follow-up');
ok(!runtime.includes('const protectedFiveJodStep = continuationRevenueReadyAtDecision;'), 'old pre-persistence payment gate is removed');
ok(persist.includes('status: "customer_confirmed_continue"') && persist.includes('payment_status: "pending_payment"'), 'authoritative DB mutation remains unchanged');
console.log('V3 P0 FIVE JOD ANY-INBOUND CONTINUATION SELFTEST: PASS');
''', encoding="utf-8")

print("PATCH APPLIED: P0 five-JOD post-approval any-inbound path")
