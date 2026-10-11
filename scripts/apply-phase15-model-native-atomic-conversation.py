from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, repl: str, label: str, flags=0) -> str:
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 regex match, found {count}")
    return out


# 1) Durable conversation state becomes a projection of the delivered turn journal,
# not a race-prone single table that is only updated after WhatsApp send/logging.
path = Path('app/api/whatsapp/webhook/_lib/v3-os/stateStore.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    'import { emptyCommercialDisclosure } from "./informedCommercialContinuation";\n',
    'import { emptyCommercialDisclosure } from "./informedCommercialContinuation";\nimport { reconcileDeliveredConversationState } from "./conversationContinuityAuthority";\n',
    'stateStore continuity import',
)
load_fn_pattern = r'export async function loadV3ConversationState\(waId: string\): Promise<ConversationState \| null> \{.*?\n\}\n\nexport async function saveV3ConversationState'
load_fn_repl = '''function hydrateConversationState(state: ConversationState | null | undefined): ConversationState | null {
  if (!state?.waId) return null;
  return {
    ...state,
    pendingAction: state.pendingAction || null,
    pendingActionPayload: state.pendingActionPayload || null,
    lastVerifiedApplication: state.lastVerifiedApplication || null,
    verifiedContactBinding: state.verifiedContactBinding || null,
    contactResolution: state.contactResolution || null,
    conversationConstraints: state.conversationConstraints || { noLinks: false, whatsappOnly: false, avoidRepetition: false, sourceTurnId: null, updatedAt: null },
    semanticMemory: state.semanticMemory || emptySemanticMemory(),
    commercialDisclosure: state.commercialDisclosure || emptyCommercialDisclosure(),
  };
}

async function loadLatestCompletedDeliveredState(waId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_turn_journal")
      .select("turn_id,status,state_after_json,provider_message_id,delivered_at,completed_at,updated_at")
      .eq("wa_id", waId)
      .eq("status", "completed")
      .not("provider_message_id", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("v3_delivered_state_recovery_read_failed", { waId, error: error.message });
      return null;
    }
    const state = hydrateConversationState(data?.state_after_json as ConversationState | null | undefined);
    if (!state) return null;
    return {
      state,
      deliveredAt: String(data?.completed_at || data?.delivered_at || data?.updated_at || state.updatedAt || ""),
    };
  } catch (error) {
    console.error("v3_delivered_state_recovery_failed", { waId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function loadV3ConversationState(waId: string): Promise<ConversationState | null> {
  const clean = String(waId || "").trim();
  if (!clean) return null;
  let lastError = "unknown";
  for (let i = 0; i < STATE_READ_DELAYS_MS.length; i++) {
    const wait = STATE_READ_DELAYS_MS[i];
    if (wait) await sleep(wait);
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .select("state")
        .eq("wa_id", clean)
        .maybeSingle();
      if (error) { lastError = error.message; continue; }

      const persisted = hydrateConversationState(data?.state as ConversationState | null | undefined);
      const delivered = await loadLatestCompletedDeliveredState(clean);
      return reconcileDeliveredConversationState({
        persisted,
        deliveredState: delivered?.state || null,
        deliveredAt: delivered?.deliveredAt || null,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  console.error("v3_state_load_failed_after_retry", { waId: clean, error: lastError });
  return null;
}

export async function saveV3ConversationState'''
text = regex_once(text, load_fn_pattern, load_fn_repl, 'stateStore load architecture', flags=re.S)
path.write_text(text, encoding='utf-8')


# 2) Human OS: generic contextual ownership + explicit-payment gate. Remove the
# bank-specific synthetic-turn patch because context is now a first-class concern.
path = Path('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    'import { loadV3ConversationState } from "./stateStore";\n',
    'import { loadV3ConversationState } from "./stateStore";\nimport { explicitCurrentTurnPaymentExecution, likelyContextualAnswerToAssistantPrompt } from "./conversationContinuityAuthority";\n',
    'Human OS continuity import',
)
text = regex_once(
    text,
    r'function paymentQuestionAfterDisclosure\(turn: InterpretedTurn, truth: TruthBundle\) \{.*?\n\}',
    '''function paymentQuestionAfterDisclosure(turn: InterpretedTurn, truth: TruthBundle) {
  if (applicationJourneyStage(truth.application) !== "continuation_confirmed_fee_due") return false;
  // Phase 15: a semantic payment_method label is not permission to advance the
  // commercial funnel. Only explicit current-turn payment execution language is.
  return explicitCurrentTurnPaymentExecution(turn.rawText);
}''',
    'explicit payment execution gate',
    flags=re.S,
)
text = regex_once(
    text,
    r'\nfunction normalizeContextFollowupText\(value: string \| null \| undefined\) \{.*?\n\}\n\nfunction explicitAssistantIdentityQuestion',
    '\nfunction explicitAssistantIdentityQuestion',
    'remove bank-specific contextual patch',
    flags=re.S,
)
text = replace_once(
    text,
    '  const contextualContinuation = obviousContextualContinuation({ customerText: input.customerText, state: stateWorking });\n  if (contextualContinuation) deterministicAnchor = makeDeterministicContinuationTurn(deterministicAnchor);\n',
    '  const contextualContinuation = obviousContextualContinuation({ customerText: input.customerText, state: stateWorking });\n  const contextualAnswerToAssistantPrompt = !contextualContinuation && likelyContextualAnswerToAssistantPrompt({\n    customerText: input.customerText,\n    lastAssistantText: stateWorking.lastAssistantText,\n  });\n  if (contextualContinuation) deterministicAnchor = makeDeterministicContinuationTurn(deterministicAnchor);\n',
    'generic contextual ownership detection',
)
text = regex_once(
    text,
    r'  if \(contextualContinuation\) turn = makeDeterministicContinuationTurn\(turn\);\n  turn = preserveDeterministicCurrentQuestionAuthority\(deterministicAnchor, turn\);\n  // Phase 14\.3\.1:.*?\n  if \(contextualCliqBank\) turn = makeContextualBankCliqTurn\(turn, contextualCliqBank\);',
    '''  if (contextualContinuation) turn = makeDeterministicContinuationTurn(turn);
  // Phase 15: when the previous assistant explicitly requested a value and the
  // customer supplies a short answer, the conversational brain owns meaning.
  // Lexical deterministic ASK labels from the short answer may not drag the turn
  // back into an unrelated legacy/payment template.
  if (!contextualAnswerToAssistantPrompt) {
    turn = preserveDeterministicCurrentQuestionAuthority(deterministicAnchor, turn);
  }''',
    'generic contextual authority after brain',
    flags=re.S,
)
text = replace_once(
    text,
    '  const continuationIntent = contextualContinuation || explicitContinuationText(input.customerText) || turn.semantic?.decision.continuation === "confirmed" || informedCommercialContinuationConfirmed({ state: reduced, truth: truthAfterActions, turn, customerText: input.customerText });\n  const disclosureRequired = shouldExplainCommercialStep({ state: reduced, truth: truthAfterActions, turn, explicitContinuationIntent: Boolean(continuationIntent) });\n  const alreadyDisclosed = commercialDisclosureDelivered(reduced, truthAfterActions);\n  const paymentExecutionRequired = !disclosureRequired && alreadyDisclosed && (Boolean(continuationIntent) || paymentQuestionAfterDisclosure(turn, truthAfterActions));\n',
    '  const contextualAnswerOwnsTurn = contextualAnswerToAssistantPrompt && !contextualContinuation;\n  const continuationIntent = !contextualAnswerOwnsTurn && (contextualContinuation || explicitContinuationText(input.customerText) || turn.semantic?.decision.continuation === "confirmed" || informedCommercialContinuationConfirmed({ state: reduced, truth: truthAfterActions, turn, customerText: input.customerText }));\n  const disclosureRequired = !contextualAnswerOwnsTurn && shouldExplainCommercialStep({ state: reduced, truth: truthAfterActions, turn, explicitContinuationIntent: Boolean(continuationIntent) });\n  const alreadyDisclosed = commercialDisclosureDelivered(reduced, truthAfterActions);\n  const paymentExecutionRequired = !contextualAnswerOwnsTurn && !disclosureRequired && alreadyDisclosed && (Boolean(continuationIntent) || paymentQuestionAfterDisclosure(turn, truthAfterActions));\n',
    'commercial anti-hijack contextual ownership',
)
path.write_text(text, encoding='utf-8')


# 3) Brain contract: keep contextual reasoning generic. Domain examples belong in
# knowledge tools, not in the core conversational cognition contract.
path = Path('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '- استثناء متابعة مباشر: إذا آخر رد منا طلب معلومة محددة والعميل أجاب بها الآن، اعتبرها جوابًا للسؤال السابق حتى لو كانت الرسالة كلمة أو اسمًا فقط. مثال: إذا سألناه عن اسم البنك بسبب CliQ ثم كتب «البنك العربي الإسلامي»، لا تعيد سؤال الدفع؛ اعتبر المطلوب التحقق من دعم CliQ لهذا البنك وطريقة الوصول لها من التطبيق، وعيّن requiresExternalFact=true وexternalFactNeeded بشكل واضح.\n',
    '- إذا آخر رد منا طلب معلومة محددة والعميل أجاب بها الآن، اعتبر الرسالة القصيرة جوابًا للسؤال السابق حتى لو كانت كلمة أو اسمًا فقط. استهلك الجواب وكمل الهدف المفتوح بدل إعادة السؤال أو الرجوع لموضوع أقدم.\n',
    'generic brain follow-up rule',
)
text = replace_once(
    text,
    '- إذا كانت الرسالة الحالية اسم بنك فقط وجاءت جوابًا لسؤال سابق عن CliQ، externalFactNeeded لازم يصير مثل: «هل <اسم البنك> يدعم CliQ في الأردن وكيف يصل العميل للخدمة من التطبيق؟». لا تستخدم ذلك لحالة طلب العميل أو دفعه أو المستفيد أو الرسوم أو أي حقيقة داخلية؛ هذه تبقى من truth فقط.\n',
    '- إذا كان الجواب القصير على سؤالنا السابق يحتاج حقيقة عامة خارجية حديثة، حوّل الهدف المفتوح إلى externalFactNeeded واضح وعيّن requiresExternalFact=true. لا تستخدم البحث الخارجي لحالة طلب العميل أو دفعه أو المستفيد أو الرسوم أو أي حقيقة داخلية؛ هذه تبقى من truth فقط.\n',
    'generic external fact follow-up rule',
)
path.write_text(text, encoding='utf-8')


# 4) Response arbiter: deterministic layers stay hard safety/truth guards. They no
# longer rewrite ordinary high-quality conversational answers into canned templates.
path = Path('app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts')
text = path.read_text(encoding='utf-8')
needle = '''export type ResponseArbitrationResult = {
  reply: string | null;
  obligation: ResponseObligation;
  repaired: boolean;
  reason: string;
  suppressed?: boolean;
};
'''
replacement = needle + '''
// Phase 15 MODEL-NATIVE BOUNDARY: these are conversational/informational shapes,
// not irreversible business actions. A valid model answer survives; deterministic
// code remains a veto for hard money/action/privacy truth instead of becoming the
// default writer for ordinary human dialogue.
const MODEL_NATIVE_SOFT_OBLIGATIONS = new Set<ResponseObligation>([
  "current_human_turn",
  "answer_bundle",
  "human_semantic_care",
  "review_timing",
  "operational_calendar",
  "requirements_question",
  "contract_terms_question",
  "product_availability",
  "pickup_delivery",
  "external_system_question",
  "general_eligibility",
  "application_start",
  "installment_service_overview",
  "document_upload_guidance",
  "current_question_contract",
  "identity",
  "media",
  "foreign_content_clarification",
  "social_greeting",
  "social_closure",
  "none",
]);
'''
text = replace_once(text, needle, replacement, 'model-native soft obligation set')
anchor = '''  if (meaningLock.kind !== "none" && !currentQuestionFirst.has(obligation) && !candidateAlignedWithLockedMeaning({ meaning: meaningLock, candidate })) {
    const lockedReply = lockedMeaningReply({ meaning: meaningLock, turn: input.turn, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(lockedReply), obligation, repaired: lockedReply !== candidate, reason: `current meaning lock repaired cross-domain candidate: ${meaningLock.reason}` };
  }

  // 7.5.8 FINAL CURRENT HUMAN TURN AUTHORITY: legacy refund/delay/contact
'''
insert = '''  if (meaningLock.kind !== "none" && !currentQuestionFirst.has(obligation) && !candidateAlignedWithLockedMeaning({ meaning: meaningLock, candidate })) {
    const lockedReply = lockedMeaningReply({ meaning: meaningLock, turn: input.turn, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(lockedReply), obligation, repaired: lockedReply !== candidate, reason: `current meaning lock repaired cross-domain candidate: ${meaningLock.reason}` };
  }

  const modelNativeCandidate = sanitizeUnifiedEgressReply(candidate);
  if (
    !input.forceRepair
    && modelNativeCandidate
    && MODEL_NATIVE_SOFT_OBLIGATIONS.has(obligation)
    && !responseHasKnownBadFallbackSignature(modelNativeCandidate)
    && !repeatedQuestionNeedsRepair({ turn: input.turn, state: input.state, candidate: modelNativeCandidate })
  ) {
    return { reply: modelNativeCandidate, obligation, repaired: modelNativeCandidate !== candidate, reason: "model-native conversational answer preserved; deterministic arbiter remains safety/truth veto" };
  }

  // 7.5.8 FINAL CURRENT HUMAN TURN AUTHORITY: legacy refund/delay/contact
'''
text = replace_once(text, anchor, insert, 'model-native arbiter early acceptance')
path.write_text(text, encoding='utf-8')


# 5) Route: as soon as Meta returned a provider message id and the outgoing marker is
# durable, commit the Human OS journal BEFORE analytics and the slower projection save.
# The journal already contains final_reply/state_after_json from reply_ready checkpoint.
path = Path('app/api/whatsapp/webhook/route.ts')
text = path.read_text(encoding='utf-8')
anchor = '''              if (!markerRecorded && !durableAfterSend.delivered) {
                console.error("V3 delivery succeeded at Meta but durable completion evidence could not be persisted", {
                  waId: from,
                  messageId: message.id || null,
                  providerMessageId: outgoingMessageId,
                });
                throw new Error("V3_RETRYABLE_DELIVERY_NOT_DURABLE");
              }

              await logAiConversation({
'''
insert = '''              if (!markerRecorded && !durableAfterSend.delivered) {
                console.error("V3 delivery succeeded at Meta but durable completion evidence could not be persisted", {
                  waId: from,
                  messageId: message.id || null,
                  providerMessageId: outgoingMessageId,
                });
                throw new Error("V3_RETRYABLE_DELIVERY_NOT_DURABLE");
              }

              // Phase 15 atomic conversation continuity: publish the already-checkpointed
              // Human OS state as DELIVERED immediately after transport durability. A fast
              // customer reply can now recover the exact assistant context from the journal
              // even if the projection table or analytics write has not finished yet.
              if (v3Run?.humanOs) {
                try {
                  await completeHumanTurnDelivery({
                    turnId: v3Run.humanOs.journalTurnId,
                    providerMessageId: outgoingMessageId,
                    memoryAfter: v3Run.humanOs.memoryAfter,
                  });
                } catch (humanOsDeliveryCommitError) {
                  console.error("Human Conversation OS delivery commit failed immediately after Meta delivery", {
                    waId: from,
                    messageId: message.id || null,
                    error: humanOsDeliveryCommitError,
                  });
                  throw new Error("V3_RETRYABLE_HUMAN_OS_DELIVERY_COMMIT_FAILURE");
                }
              }

              await logAiConversation({
'''
text = replace_once(text, anchor, insert, 'route early journal delivery commit')
old = '''              if (v3Run?.humanOs && outgoingMessageId) {
                try {
                  if (v3Run.humanOs.memoryAfter) await saveCompactHumanMemory(from, v3Run.humanOs.memoryAfter);
                  await completeHumanTurnDelivery({ turnId: v3Run.humanOs.journalTurnId, providerMessageId: outgoingMessageId, memoryAfter: v3Run.humanOs.memoryAfter });
                } catch (humanOsFinalizeError) {
                  console.error("Human Conversation OS durable completion failed after delivery", { waId: from, messageId: message.id || null, error: humanOsFinalizeError });
                  throw new Error("V3_RETRYABLE_HUMAN_OS_COMPLETION_FAILURE");
                }
              }
'''
new = '''              if (v3Run?.humanOs && outgoingMessageId) {
                try {
                  if (v3Run.humanOs.memoryAfter) await saveCompactHumanMemory(from, v3Run.humanOs.memoryAfter);
                } catch (humanOsMemoryError) {
                  console.error("Human Conversation OS compact memory persistence failed after delivery", { waId: from, messageId: message.id || null, error: humanOsMemoryError });
                  throw new Error("V3_RETRYABLE_HUMAN_OS_MEMORY_PERSISTENCE_FAILURE");
                }
              }
'''
text = replace_once(text, old, new, 'remove late duplicate human turn completion')
path.write_text(text, encoding='utf-8')

print('PHASE 15 MODEL-NATIVE ATOMIC CONVERSATION PATCH APPLIED')
