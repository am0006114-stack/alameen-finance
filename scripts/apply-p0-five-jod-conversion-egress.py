from pathlib import Path

path = Path('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts')
text = path.read_text(encoding='utf-8')

old_trigger = '''  const postApprovalAnyInboundTrigger = Boolean(
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
'''
new_trigger = '''  const postApprovalAnyInboundTrigger = Boolean(
    truthAfterActions.contactAccess !== "safe_preview"
    && applicationJourneyStage(truthAfterActions.application) === "preliminary_approved_waiting_decision"
    && String(effectiveCustomerText || "").trim()
    && !explicitNonContinuationThisTurn
  );
  const continuationDecisionThisTurn = truthAfterActions.contactAccess !== "safe_preview"
    && !explicitNonContinuationThisTurn
    && (
      postApprovalAnyInboundTrigger
      || (!semanticContinueVeto && !disclosureRequiredThisTurn && (
'''

old_reply = '''  const authoritativeCommercialJourneyReply = disclosureRequiredThisTurn
    ? buildInformedCommercialDisclosureReply(truthAfterActions)
    : protectedFiveJodStep
      ? buildMandatoryFiveJodContinuationReply(turn, truthAfterActions)
      : null;
'''
new_reply = '''  // P0 conversion invariant: once continuation persistence succeeds, the protected
  // 5-JOD execution block must win over an older disclosure requirement. Otherwise
  // DB/Discord advance while the customer still sees another disclosure/confirmation turn.
  const authoritativeCommercialJourneyReply = protectedFiveJodStep
    ? buildMandatoryFiveJodContinuationReply(turn, truthAfterActions)
    : disclosureRequiredThisTurn
      ? buildInformedCommercialDisclosureReply(truthAfterActions)
      : null;
'''

old_filter = '''          .filter((segment) => !/(?:رسوم\\s+فتح\\s+الملف|(?:5|٥|خمس)\\s*(?:دنانير|دينار)|orange\\s*money|اورنج\\s+موني|أورنج\\s+موني|\\bcliq\\b|كليك|PAYAMEEEN|AMEEN1ST|AM500337|0788500337|رفع\\s+الوصل|ارفع\\s+الوصل|بيانات\\s+الدفع|هل\\s+ترغب\\s+بالاستمرار|اريد\\s+الاستمرار|أريد\\s+الاستمرار|لا[،,]?\\s+مش\\s+هسا)/i.test(segment))
'''
new_filter = '''          .filter((segment) => !/(?:رسوم\\s+فتح\\s+الملف|(?:5|٥|خمس)\\s*(?:دنانير|دينار)|orange\\s*money|اورنج\\s+موني|أورنج\\s+موني|\\bcliq\\b|كليك|PAYAMEEEN|AMEEN1ST|AM500337|0788500337|اسم\\s+المستفيد|تأكيد\\s+الحوالة|تأكيد\\s+الدفع\\s+النهائي|receipt\\?|\\/receipt\\b|القسط\\s+الأول\\s+مش\\s+مطلوب|رفع\\s+الوصل|ارفع\\s+الوصل|بيانات\\s+الدفع|هل\\s+ترغب\\s+بالاستمرار|اريد\\s+الاستمرار|أريد\\s+الاستمرار|لا[،,]?\\s+مش\\s+هسا)/i.test(segment))
'''

for label, old, new in [
    ('post-approval trigger', old_trigger, new_trigger),
    ('payment reply precedence', old_reply, new_reply),
    ('payment duplicate filter', old_filter, new_filter),
]:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one source match, got {count}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('PATCH APPLIED: P0 five-JOD conversion egress')
