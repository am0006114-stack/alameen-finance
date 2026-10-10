const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.argv[2] || process.cwd();
const v4 = (...parts) => path.join(root, 'app/api/whatsapp/webhook/_lib/v4-os', ...parts);
const cache = new Map();

function loadTs(file, mocks = {}) {
  const abs = path.resolve(file);
  const cacheKey = `${abs}|${Object.keys(mocks).sort().join(',')}`;
  if (!Object.keys(mocks).length && cache.has(cacheKey)) return cache.get(cacheKey);
  const source = fs.readFileSync(abs, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
    fileName: abs,
    reportDiagnostics: true,
  });
  const errors = (js.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    throw new Error(`transpile failed for ${abs}: ${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | ')}`);
  }
  const mod = { exports: {} };
  if (!Object.keys(mocks).length) cache.set(cacheKey, mod.exports);
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    const base = path.resolve(path.dirname(abs), id);
    for (const candidate of [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.js')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate.endsWith('.ts') ? loadTs(candidate) : require(candidate);
    }
    throw new Error(`cannot resolve ${id} from ${abs}`);
  };
  new Function('require', 'module', 'exports', '__filename', '__dirname', js.outputText)(localRequire, mod, mod.exports, abs, path.dirname(abs));
  if (!Object.keys(mocks).length) cache.set(cacheKey, mod.exports);
  return mod.exports;
}

const commercial = loadTs(v4('commercialFunnelPolicy.ts'));
const director = loadTs(v4('journeyDirector.ts'));
const procedure = loadTs(v4('procedureEngine.ts'));

let baseUnderstandCalls = 0;
const baseUnderstanding = {
  meaningSummary: 'BASE_MODEL_CALLED', currentGoal: 'base', explicitQuestions: [], neededFactKeys: [], requestedAction: null,
  actionDisposition: 'none', requestedPersona: null, references: [], emotion: 'neutral', urgency: 'normal', topicChanged: false,
  customerRejectedPreviousAnswer: false, customerWantsBrevity: false, noReplyRequested: false, identityQuestion: false,
  humanContactRequested: false, socialClosure: false, confidence: 0.5, warnings: ['base_model_called'],
};
const baseAdapter = {
  async understand() { baseUnderstandCalls += 1; return baseUnderstanding; },
  async compose() { throw new Error('base compose unexpectedly called in deterministic replay'); },
  async critique() { throw new Error('base critic unexpectedly called in deterministic replay'); },
};
const wrapper = loadTs(v4('journeyAwareModelAdapter.ts'), {
  './modelAdapter': { createV4ModelAdapter: () => baseAdapter },
  './journeyDirector': director,
});
const adapter = wrapper.createV41JourneyAwareModelAdapter({ understandingProvider: {}, writerProvider: {}, criticProvider: {} });

function f(key, value, source = 'database', customerVisible = true) {
  return { key, value, source, confidence: 1, customerVisible };
}

function truth(overrides = {}) {
  const facts = {
    'application.exists': f('application.exists', true),
    'application.status.raw': f('application.status.raw', 'preliminary_qualified'),
    'application.status.customer': f('application.status.customer', 'موافقة مبدئية'),
    'application.journey_stage': f('application.journey_stage', 'preliminary_approved_waiting_decision'),
    'application.payment_confirmed': f('application.payment_confirmed', false),
    'application.age_days': f('application.age_days', 2),
    'application.documents.loaded': f('application.documents.loaded', true),
    'application.documents.identity_complete': f('application.documents.identity_complete', true),
    'application.documents.income_uploaded': f('application.documents.income_uploaded', true),
    'application.documents.guarantor_complete': f('application.documents.guarantor_complete', true),
    'application.income_upload_link': f('application.income_upload_link', 'https://www.ameenfinance.co/salary-slip?tracking=AM-TEST&phone=0700000000', 'system'),
    'application.identity_upload_link': f('application.identity_upload_link', 'https://www.ameenfinance.co/identity?tracking=AM-TEST&phone=0700000000', 'system'),
    'application.guarantor_upload_link': f('application.guarantor_upload_link', 'https://www.ameenfinance.co/guarantor?tracking=AM-TEST&phone=0700000000', 'system'),
    'business.products_url': f('business.products_url', 'https://www.ameenfinance.co/products', 'system'),
    'documents.secure_rule': f('documents.secure_rule', 'المستندات الحساسة ترفع عبر الرابط الرسمي فقط', 'policy'),
    'fee.opening.amount_jod': f('fee.opening.amount_jod', 5, 'policy'),
    'fee.opening.refund_rule': f('fee.opening.refund_rule', 'مستردة إذا لم تصدر الموافقة النهائية', 'policy'),
    'fee.opening.purpose': f('fee.opening.purpose', 'فتح ملف للدراسة النهائية', 'policy'),
    'review.normal_window': f('review.normal_window', 'من يومين إلى 3 أيام تشغيلية', 'policy'),
    'refund.pressure_rule': f('refund.pressure_rule', 'لا يوجد موعد تحويل ثابت', 'policy'),
    'installment.first_rule': f('installment.first_rule', 'القسط الأول بعد شهر من الاستلام وتوقيع العقد', 'policy'),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) facts[key] = value;
    else if (key.startsWith('application.') || key.startsWith('business.') || key.startsWith('review.') || key.startsWith('fee.') || key.startsWith('refund.') || key.startsWith('installment.') || key.startsWith('documents.')) facts[key] = f(key, value);
  }
  return { applicationId: 'APP-TEST', trackingId: 'AM-TEST', facts, verifiedActionReceipts: [] };
}

function memory({ lastAssistantText = null, pendingProcedure = null } = {}) {
  return {
    version: 'v4.0.0-human-ai-conversation-os-dev', conversationId: 'REPLAY', persona: 'abdullah', activeGoal: null,
    activeGoalTurnId: null, openQuestions: [], pendingProcedure, customerDecisions: [], factsAlreadyExplained: [],
    rejectedAnswerFingerprints: [], currentEmotion: 'neutral', frustrationStreak: 0, humanContactRequested: false,
    prefersBriefReplies: false, repetitionSensitivity: 0, lastCustomerText: null, lastAssistantText,
    lastAssistantFingerprint: null, episodes: [], updatedAt: new Date(0).toISOString(),
  };
}

let passed = 0, failed = 0;
function ok(cond, name, detail = '') {
  if (cond) { passed += 1; console.log(`PASS ${passed}: ${name}`); }
  else { failed += 1; console.error(`FAIL: ${name}${detail ? ` :: ${detail}` : ''}`); }
}

async function understand(text, t = truth(), m = memory()) {
  return adapter.understand({ burstText: text, truth: t, memory: m });
}
function directUnderstand(text, t = truth(), m = memory()) {
  return director.resolveJourneyDirectorUnderstanding({ burstText: text, truth: t, memory: m });
}
function compose(text, u, t = truth(), m = memory()) {
  return director.buildJourneyDirectorDraft({ burstText: text, understanding: u, truth: t, memory: m });
}

async function main() {
  // Sanitized replay fixtures derived from the real 24h production failure classes.
  let t = truth();
  let u = await understand('طلبي شو صار فيه؟', t);
  let d = compose('طلبي شو صار فيه؟', u, t);
  ok(d && /هل ترغب بالاستمرار/.test(d.text || '') && /1️⃣/.test(d.text || '') && /2️⃣/.test(d.text || ''), 'preliminary status opens explicit 1/2 continuation decision');
  ok(d && !/\/track\?/.test(d.text || ''), 'preliminary status never emits tracking link');

  u = await understand('١', t);
  ok(u.requestedAction === 'continue_application', 'Arabic digit ١ is explicit continuation');
  u = await understand('1 موافق', t);
  ok(u.requestedAction === 'continue_application', '1 موافق is explicit continuation');
  u = await understand('تمام استمرار', t);
  ok(u.requestedAction === 'continue_application', 'تمام استمرار is explicit continuation');
  u = await understand('تمام', t);
  ok(u.requestedAction === null && u.socialClosure === true, 'plain تمام is acknowledgement, not payment consent');

  u = await understand('ليش الخمس دنانير؟', t);
  d = compose('ليش الخمس دنانير؟', u, t);
  ok(d && /فتح ملف/.test(d.text || '') && /مسترد/.test(d.text || ''), 'fee rationale appears when customer explicitly asks why');

  u = await understand('وين رابط التتبع؟', t);
  d = compose('وين رابط التتبع؟', u, t);
  ok(d && /قبل تأكيد الدفع/.test(d.text || '') && !/\/track\?/.test(d.text || ''), 'tracking is blocked before authoritative payment');

  t = truth({
    'application.status.raw': 'needs_salary_slip',
    'application.status.customer': 'بانتظار كشف/شهادة الراتب',
    'application.journey_stage': 'payment_confirmed_under_review',
    'application.payment_confirmed': true,
    'application.documents.income_uploaded': false,
  });
  u = await understand('كيف ارفع كشف الحساب من الموقع؟', t);
  d = compose('كيف ارفع كشف الحساب من الموقع؟', u, t);
  ok(u.currentGoal === 'upload_income', 'bank-statement upload owns current goal over generic status');
  ok(d && /salary-slip\?tracking=AM-TEST/.test(d.text || ''), 'bank-statement question gets exact secure upload link');
  ok(d && !/قيد الدراسة النهائية.*انتظار/.test(d.text || ''), 'document upload never falls back to wait/status boilerplate');

  u = await understand('هل ملفي ناقص اشي؟', t);
  d = compose('هل ملفي ناقص اشي؟', u, t);
  ok(u.currentGoal === 'application_missing_documents', 'missing-document question owns current goal');
  ok(d && /إثبات الدخل|كشف الحساب/.test(d.text || '') && /salary-slip/.test(d.text || ''), 'missing-document reply names the missing income document and gives its link');

  u = await understand('شو صار بطلبي؟', t);
  d = compose('شو صار بطلبي؟', u, t);
  ok(d && /إثبات الدخل|كشف الحساب/.test(d.text || ''), 'raw needs_salary_slip outranks generic paid-final-review stage');

  t = truth({
    'application.status.raw': 'approved',
    'application.status.customer': 'قيد الدراسة النهائية',
    'application.journey_stage': 'payment_confirmed_under_review',
    'application.payment_confirmed': true,
  });
  u = await understand('لو اجا شهر وما دفعت قسط التلفون شو بصير؟', t);
  d = compose('لو اجا شهر وما دفعت قسط التلفون شو بصير؟', u, t);
  ok(u.currentGoal === 'contract_installment_arrears_question', 'missed monthly installment is not opening-fee payment proof');
  ok(d && /قسط الجهاز بعد توقيع العقد/.test(d.text || '') && !/إثبات الدفع/.test(d.text || ''), 'installment-arrears reply stays on contract installment');

  u = await understand('كم حق الايفون 16 برو ماكس وكم قسطه؟', t);
  d = compose('كم حق الايفون 16 برو ماكس وكم قسطه؟', u, t);
  ok(u.currentGoal === 'current_product_question', 'product price question is isolated from stale application/refund context');
  ok(d && /products/.test(d.text || '') && !/استرداد|قيد الدراسة/.test(d.text || ''), 'product question receives catalog direction, not stale case template');

  t = truth({
    'application.status.raw': 'approved',
    'application.status.customer': 'قيد الدراسة النهائية',
    'application.journey_stage': 'payment_confirmed_under_review',
    'application.age_days': 150,
  });
  u = await understand('صارلي خمس شهور بستنى، متى الرد؟', t);
  d = compose('صارلي خمس شهور بستنى، متى الرد؟', u, t);
  ok(d && /متجاوزة المعدل الطبيعي/.test(d.text || '') && !/المعدل الطبيعي للمراجعة من يومين إلى 3/.test(d.text || ''), 'five-month case never gets normal 2-3 day boilerplate');

  const aliasPrompt = memory({ lastAssistantText: 'إذا هذا واتسابك وبدك أعتمده كرقم تابع لنفس الطلب، اكتب: نعم، اعتمد الرقم.' });
  u = await understand('نعم اعتمد الرقم', truth({ 'application.journey_stage': 'preliminary_review' }), aliasPrompt);
  ok(u.requestedAction === 'link_whatsapp_alias' && u.actionDisposition === 'confirm', 'visible alias prompt + confirmation recovers exact action');
  let r = procedure.resolveV4Procedure({ memory: aliasPrompt, turnId: 'T-ALIAS', understanding: u });
  ok(r.shouldExecute === true && r.needsConfirmation === false, 'visible alias confirmation executes without asking again');

  const cancelPrompt = memory({ lastAssistantText: 'إذا قرارك نهائي اكتب: نعم، ألغي الطلب.' });
  u = await understand('نعم', truth({ 'application.journey_stage': 'payment_confirmed_under_review' }), cancelPrompt);
  ok(u.requestedAction === 'cancel_application' && u.actionDisposition === 'confirm', 'visible cancel prompt + نعم recovers cancellation');
  r = procedure.resolveV4Procedure({ memory: cancelPrompt, turnId: 'T-CANCEL', understanding: u });
  ok(r.shouldExecute === true && r.needsConfirmation === false, 'cancel confirmation executes exactly once');

  const refundPrompt = memory({ lastAssistantText: 'إذا قرارك نهائي اكتب: نعم، أريد استرداد الرسوم.' });
  u = await understand('نعم أريد استرداد الرسوم', truth({ 'application.journey_stage': 'cancelled' }), refundPrompt);
  ok(u.requestedAction === 'request_refund' && u.actionDisposition === 'confirm', 'visible refund prompt recovers refund confirmation');
  r = procedure.resolveV4Procedure({ memory: refundPrompt, turnId: 'T-REFUND', understanding: u });
  ok(r.shouldExecute === true && r.needsConfirmation === false, 'refund confirmation does not loop');

  const reopenPrompt = memory({ lastAssistantText: 'للتأكيد النهائي اكتب: نعم، بدي أعيد فتح الطلب وأكمل عليه.' });
  u = await understand('نعم بدي اعيد فتح الطلب واكمل عليه', truth({ 'application.journey_stage': 'refund_requested' }), reopenPrompt);
  ok(u.requestedAction === 'reopen_application' && u.actionDisposition === 'confirm', 'visible reopen prompt recovers reopen confirmation');
  r = procedure.resolveV4Procedure({ memory: reopenPrompt, turnId: 'T-REOPEN', understanding: u });
  ok(r.shouldExecute === true && r.needsConfirmation === false, 'reopen confirmation does not loop');

  const pendingCancel = memory({ pendingProcedure: { name: 'cancel_application', state: 'confirmation_required', requestedAtTurnId: 'OLD', confirmedAtTurnId: null, executedAtTurnId: null, payload: null, lastError: null } });
  t = truth({
    'application.status.raw': 'needs_salary_slip',
    'application.journey_stage': 'payment_confirmed_under_review',
    'application.documents.income_uploaded': false,
  });
  u = await understand('كيف ارفع كشف الحساب؟', t, pendingCancel);
  ok(u.currentGoal === 'upload_income' && u.requestedAction === null, 'fresh document question is not hijacked by stale pending cancellation');
  r = procedure.resolveV4Procedure({ memory: pendingCancel, turnId: 'T-FRESH', understanding: u });
  ok(r.shouldExecute === false && r.needsConfirmation === false && r.action === null, 'stale pending action cannot own fresh question reply');

  u = await understand('ما بدي رد آلي، بدي موظف حقيقي', truth(), memory());
  ok(u.humanContactRequested === true && u.requestedAction === 'record_human_contact_request' && u.noReplyRequested === false, 'rejecting automated reply routes to real-human escalation, not silence');

  u = await understand('وين عمران؟', truth(), memory());
  ok(u.requestedPersona === 'omran' && u.humanContactRequested === false, 'named Omran request stays persona continuity, not fake external human handoff');

  t = truth({
    'application.status.raw': 'customer_confirmed_continue',
    'application.status.customer': 'تم تسجيل رغبتك بالاستمرار',
    'application.journey_stage': 'continuation_confirmed_fee_due',
  });
  u = await understand('شو صار بطلبي؟', t, memory());
  ok(u.requestedAction === 'continue_application' && u.actionDisposition === 'confirm', 'fee-due status routes to frozen commercial payment handoff');

  u = await understand('شكرا', truth({ 'application.journey_stage': 'payment_confirmed_under_review' }), memory());
  d = compose('شكرا', u, truth({ 'application.journey_stage': 'payment_confirmed_under_review' }));
  ok(d && /الله يعطيك العافية/.test(d.text || '') && !/قيد الدراسة|رابط/.test(d.text || ''), 'social closure does not reopen stale status or link');

  ok(baseUnderstandCalls === 0, 'all high-risk replay fixtures bypass paid understanding model calls');

  console.log(`\nV4.1 OFFLINE PRODUCTION-FAILURE REPLAY: assertions=${passed + failed}; passed=${passed}; failed=${failed}; paid_model_calls=${baseUnderstandCalls}`);
  if (failed) process.exit(1);
}

main().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
