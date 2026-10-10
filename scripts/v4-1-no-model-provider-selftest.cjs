const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.argv[2] || process.cwd();
const v4 = (...parts) => path.join(root, 'app/api/whatsapp/webhook/_lib/v4-os', ...parts);
const cache = new Map();

function loadTs(file, mocks = {}) {
  const abs = path.resolve(file);
  const key = `${abs}|${Object.keys(mocks).sort().join(',')}`;
  if (!Object.keys(mocks).length && cache.has(key)) return cache.get(key);
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
  if (errors.length) throw new Error(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | '));
  const mod = { exports: {} };
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
  if (!Object.keys(mocks).length) cache.set(key, mod.exports);
  return mod.exports;
}

const adapterModule = loadTs(v4('journeyAwareModelAdapter.ts'));
const kernel = loadTs(v4('conversationKernel.ts'));
const runtimeBridgeSource = fs.readFileSync(v4('runtimeBridge.ts'), 'utf8');
const runtimeEntrypointSource = fs.readFileSync(v4('runtimeEntrypoint.ts'), 'utf8');
const adapter = adapterModule.createV41DeterministicOnlyModelAdapter();

function fact(key, value, source = 'database', customerVisible = true) {
  return { key, value, source, confidence: 1, customerVisible };
}

function truth(overrides = {}) {
  const facts = {
    'application.exists': fact('application.exists', true),
    'application.status.raw': fact('application.status.raw', 'preliminary_qualified'),
    'application.status.customer': fact('application.status.customer', 'موافقة مبدئية'),
    'application.journey_stage': fact('application.journey_stage', 'preliminary_approved_waiting_decision'),
    'application.payment_confirmed': fact('application.payment_confirmed', false),
    'application.age_days': fact('application.age_days', 2),
    'application.documents.loaded': fact('application.documents.loaded', true),
    'application.documents.identity_complete': fact('application.documents.identity_complete', true),
    'application.documents.income_uploaded': fact('application.documents.income_uploaded', true),
    'application.documents.guarantor_complete': fact('application.documents.guarantor_complete', true),
    'application.income_upload_link': fact('application.income_upload_link', 'https://www.ameenfinance.co/salary-slip?tracking=AM-NOMODEL&phone=0700000000', 'system'),
    'application.identity_upload_link': fact('application.identity_upload_link', 'https://www.ameenfinance.co/identity?tracking=AM-NOMODEL&phone=0700000000', 'system'),
    'application.guarantor_upload_link': fact('application.guarantor_upload_link', 'https://www.ameenfinance.co/guarantor?tracking=AM-NOMODEL&phone=0700000000', 'system'),
    'business.products_url': fact('business.products_url', 'https://www.ameenfinance.co/products', 'system'),
    'business.location.general': fact('business.location.general', 'عمّان – شارع المدينة المنورة', 'policy'),
    'business.commercial_structure': fact('business.commercial_structure', 'نظام التعامل مرابحة وليس قرضًا ربويًا', 'policy'),
    'documents.secure_rule': fact('documents.secure_rule', 'المستندات الحساسة ترفع عبر الرابط الرسمي فقط', 'policy'),
    'requirements.guidance': fact('requirements.guidance', 'الهوية وإثبات الدخل من الأساسيات', 'policy'),
    'fee.opening.amount_jod': fact('fee.opening.amount_jod', 5, 'policy'),
    'fee.opening.refund_rule': fact('fee.opening.refund_rule', 'مستردة إذا لم تصدر الموافقة النهائية', 'policy'),
    'fee.opening.purpose': fact('fee.opening.purpose', 'فتح ملف للدراسة النهائية', 'policy'),
    'review.normal_window': fact('review.normal_window', 'من يومين إلى 3 أيام تشغيلية', 'policy'),
    'refund.pressure_rule': fact('refund.pressure_rule', 'لا يوجد موعد تحويل ثابت', 'policy'),
    'recent_release.rule': fact('recent_release.rule', 'الاستلام بعد شهر كامل من الموافقة النهائية الموثقة', 'policy'),
    'pickup.rule': fact('pickup.rule', 'الاستلام من المكتب وبموعد رسمي مؤكد فقط', 'policy'),
    'installment.first_rule': fact('installment.first_rule', 'القسط الأول بعد شهر من الاستلام وتوقيع العقد', 'policy'),
  };
  for (const [key, value] of Object.entries(overrides)) facts[key] = fact(key, value);
  return { applicationId: 'APP-NOMODEL', trackingId: 'AM-NOMODEL', facts, verifiedActionReceipts: [] };
}

function memory(lastAssistantText = null) {
  return {
    version: 'v4.0.0-human-ai-conversation-os-dev', conversationId: 'NO-MODEL', persona: 'abdullah', activeGoal: null,
    activeGoalTurnId: null, openQuestions: [], pendingProcedure: null, customerDecisions: [], factsAlreadyExplained: [],
    rejectedAnswerFingerprints: [], currentEmotion: 'neutral', frustrationStreak: 0, humanContactRequested: false,
    prefersBriefReplies: false, repetitionSensitivity: 0, lastCustomerText: null, lastAssistantText,
    lastAssistantFingerprint: null, episodes: [], updatedAt: new Date(0).toISOString(),
  };
}

let passed = 0, failed = 0;
function ok(cond, msg, detail = '') {
  if (cond) { passed++; console.log(`PASS ${passed}: ${msg}`); }
  else { failed++; console.error(`FAIL: ${msg}${detail ? ` :: ${detail}` : ''}`); }
}

async function turn(text, t = truth(), m = memory(), extras = {}) {
  return kernel.runV4ConversationTurn({
    turnId: `NO-MODEL-${passed + failed + 1}`,
    burstText: text,
    memory: m,
    truth: t,
    model: adapter,
    actionExecutor: extras.actionExecutor || null,
    commercialContinuationExecutor: extras.commercialContinuationExecutor || null,
    humanEscalationExecutor: extras.humanEscalationExecutor || null,
  });
}

async function main() {
  ok(/if \(!writer \|\| !interpreter \|\| !critic\) return createV41DeterministicOnlyModelAdapter\(\)/.test(runtimeBridgeSource), 'runtimeBridge falls back to deterministic-only V4.1 adapter when all model providers are absent');
  ok(!/v4_model_adapter_not_configured/.test(runtimeEntrypointSource), 'runtime entrypoint no longer throws when model providers are absent');

  let result = await turn('طلبي شو صار فيه؟');
  ok(result.critic.accepted === true, 'preliminary status is accepted with no model provider');
  ok(/هل ترغب بالاستمرار/.test(result.reply || '') && /1️⃣/.test(result.reply || '') && /2️⃣/.test(result.reply || ''), 'preliminary status still emits explicit 1/2 funnel with no model provider');
  ok(!/\/track\?/.test(result.reply || ''), 'no tracking link leaks before payment when model providers are absent');

  let continuationCalls = 0;
  result = await turn('١', truth(), memory(), {
    commercialContinuationExecutor: {
      async continue() {
        continuationCalls++;
        return {
          handled: true,
          persisted: true,
          receiptId: 'continuation:NO-MODEL',
          reply: 'تمام. المطلوب الآن 5 دنانير رسوم فتح الملف.\nارفع الوصل من الرابط الرسمي المرتبط بطلبك.',
          blocker: null,
        };
      },
    },
  });
  ok(continuationCalls === 1, 'Arabic ١ reaches frozen commercial continuation without model provider');
  ok(result.actionResult === null && result.commercialContinuation?.persisted === true, 'commercial continuation stays outside generic action executor');
  ok(result.critic.accepted === true && /5 دنانير/.test(result.reply || ''), 'commercial continuation returns accepted payment handoff without model provider');

  const docTruth = truth({
    'application.status.raw': 'needs_salary_slip',
    'application.status.customer': 'بانتظار إثبات الدخل',
    'application.journey_stage': 'payment_confirmed_under_review',
    'application.payment_confirmed': true,
    'application.documents.income_uploaded': false,
  });
  result = await turn('كيف ارفع كشف الحساب من الموقع؟', docTruth);
  ok(result.critic.accepted === true && /salary-slip\?tracking=AM-NOMODEL/.test(result.reply || ''), 'exact income-upload link works with no model provider');
  ok(!/صار خلل مؤقت/.test(result.reply || ''), 'known document journey does not degrade merely because model provider is absent');

  result = await turn('وين رابط التتبع؟');
  ok(result.critic.accepted === true && /قبل تأكيد الدفع/.test(result.reply || ''), 'pre-payment tracking guard works with no model provider');
  ok(!/\/track\?/.test(result.reply || ''), 'pre-payment tracking guard emits no bound tracking link');

  result = await turn('شو رأيكم بشغلة ما إلها علاقة بالطلب؟');
  ok(result.critic.accepted === true, 'unmatched open-ended turn degrades safely instead of throwing');
  ok(/خدمة الجواب المفتوح|خلل مؤقت/.test(result.reply || ''), 'unmatched open-ended turn gets explicit temporary degraded response');
  ok(!/موافقة مبدئية|قيد الدراسة|AM-NOMODEL|\/track/.test(result.reply || ''), 'degraded open-ended response never injects stale application status/tracking');

  result = await turn('هل بتقدر تجاوبني على سؤال غريب جدًا؟');
  ok(result.critic.accepted === true, 'unmatched yes/no turn also survives deterministic critic with no provider');
  ok(/^لا أقدر/.test(result.reply || ''), 'unmatched yes/no degraded answer is direct and non-hallucinatory');

  console.log(`\nV4.1 NO MODEL PROVIDERS SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
  if (failed) process.exit(1);
}

main().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
