const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();

function target(rel) { return path.join(root, rel); }
function patchOnce(rel, marker, before, after) {
  const p = target(rel);
  let source = fs.readFileSync(p, 'utf8');
  if (source.includes(marker)) {
    console.log(`FINALIZE ALREADY APPLIED: ${rel} :: ${marker}`);
    return;
  }
  const i = source.indexOf(before);
  if (i < 0) throw new Error(`FINALIZE ANCHOR MISSING: ${rel} :: ${marker}`);
  if (source.indexOf(before, i + before.length) >= 0) throw new Error(`FINALIZE ANCHOR NOT UNIQUE: ${rel} :: ${marker}`);
  source = source.slice(0, i) + after + source.slice(i + before.length);
  fs.writeFileSync(p, source, 'utf8');
  console.log(`FINALIZED: ${rel} :: ${marker}`);
}

// Deterministic conversation recovery is allowed as a last-resort writer for
// known grounded operational intents such as salary-slip/document links.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  'P0_20261022_RECOVERY_IMPORTS_FOR_LAST_RESORT',
  'import { buildMandatoryFiveJodContinuationReply, explicitContactNumberChangeRequest, explicitContinuationText, explicitDoNotContinueText, hardenTurnForConversationRecovery, isNewApplicationFlow } from "./conversationRecovery";\n',
  'import { buildConversationRecoveryReply, buildMandatoryFiveJodContinuationReply, explicitContactNumberChangeRequest, explicitContinuationText, explicitDoNotContinueText, hardenTurnForConversationRecovery, isNewApplicationFlow, shouldPrioritizeConversationRecovery } from "./conversationRecovery"; // P0_20261022_RECOVERY_IMPORTS_FOR_LAST_RESORT\n'
);

patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  'P0_20261022_DOCUMENT_RECOVERY_BEFORE_GENERIC_FALLBACK',
  '  if (critical) return critical;\n  const authority = buildSingleConversationAuthorityReply({ turn: input.turn || syntheticTurn, state: input.state, truth: input.truth });\n',
  `  if (critical) return critical;\n  // P0_20261022_DOCUMENT_RECOVERY_BEFORE_GENERIC_FALLBACK\n  const recoveryTurn = input.turn || syntheticTurn;\n  if (shouldPrioritizeConversationRecovery({ turn: recoveryTurn, state: input.state, recentTurns: [] })) {\n    const recovered = buildConversationRecoveryReply({ turn: recoveryTurn, state: input.state, truth: input.truth, recentTurns: [] });\n    if (recovered) return recovered;\n  }\n  const authority = buildSingleConversationAuthorityReply({ turn: recoveryTurn, state: input.state, truth: input.truth });\n`
);

// Authoritative refund state wins before the generic mutation confirmation path.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  'P0_20261022_ALREADY_REFUNDING_NEVER_RECONFIRMS',
  '  const trackingLine = tracking ? `\\nرقم الطلب: ${tracking}` : "";\n\n  const successReply = buildScopedMutationSuccessReply({ truth: input.truth, actions: input.actions || [] });\n',
  `  const trackingLine = tracking ? \`\\nرقم الطلب: \${tracking}\` : "";\n  // P0_20261022_ALREADY_REFUNDING_NEVER_RECONFIRMS\n  const authoritativeStage = applicationJourneyStage(app);\n  if (requested.has("request_refund") && authoritativeStage === "refund_requested") {\n    return \`طلب الاسترداد\${tracking ? \` على الطلب \${tracking}\` : ""} مسجل أصلًا وقيد المعالجة. ما في داعي تعيد طلبه أو تأكده مرة ثانية؛ ما رح أعتبر التحويل مكتمل إلا لما يتم فعليًا.\`;\n  }\n  if (requested.has("request_refund") && authoritativeStage === "refund_completed") {\n    return \`الاسترداد\${tracking ? \` على الطلب \${tracking}\` : ""} مكتمل حسب الحالة الحالية، وما في طلب استرداد جديد لازم تأكده.\`;\n  }\n\n  const successReply = buildScopedMutationSuccessReply({ truth: input.truth, actions: input.actions || [] });\n`
);

// If Telegram is unavailable or the customer asks whether it is required, answer
// the channel question directly instead of sending another migration link.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  'P0_20261022_TELEGRAM_AVAILABILITY_DIRECT_REPLY',
  '  const nq = q.replace(/[؟?!.,،]+/g, " ").replace(/\\s+/g, " ").trim().toLowerCase();\n\n  if (/^(?:تمام|اوك|اوكي|شكرا|شكرًا|يسلمو|يعطيك العافيه|يعطيك العافية|على خير|ان شاء الله|إن شاء الله|الحمد لله)[\\s!]*$/i.test(nq)) {\n',
  `  const nq = q.replace(/[؟?!.,،]+/g, " ").replace(/\\s+/g, " ").trim().toLowerCase();\n\n  // P0_20261022_TELEGRAM_AVAILABILITY_DIRECT_REPLY\n  if (/(?:هل\\s+)?(?:ضروري|لازم).{0,16}(?:تلجرام|تليجرام)|(?:ما\\s+عندي|ما\\s+بنزل|مش\\s+قادر|ما\\s+بقدر).{0,20}(?:تلجرام|تليجرام)/i.test(nq)) {\n    return "بعد تأكيد الدفع، Telegram هو القناة الأساسية للمتابعة التفصيلية. إذا ما بتقدر تستخدمه أو ما بنزل عندك، ما رح تنترك بدون رد على واتساب؛ ابعت سؤالك هون وبجاوبك حسب الحالة الفعلية لطلبك.";\n  }\n\n  if (/^(?:تمام|اوك|اوكي|شكرا|شكرًا|يسلمو|يعطيك العافيه|يعطيك العافية|على خير|ان شاء الله|إن شاء الله|الحمد لله)[\\s!]*$/i.test(nq)) {\n`
);

console.log('PASS: final conversation-integrity patches applied');
