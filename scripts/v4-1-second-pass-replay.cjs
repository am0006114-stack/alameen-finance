const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = process.argv[2] || process.cwd();
const v4 = (...p) => path.join(root, 'app/api/whatsapp/webhook/_lib/v4-os', ...p);
const cache = new Map();

function loadTs(file, mocks = {}) {
  const abs = path.resolve(file);
  const key = `${abs}|${Object.keys(mocks).sort().join(',')}`;
  if (!Object.keys(mocks).length && cache.has(key)) return cache.get(key);
  const source = fs.readFileSync(abs, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.Node10 },
    fileName: abs,
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    const base = path.resolve(path.dirname(abs), id);
    for (const c of [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c.endsWith('.ts') ? loadTs(c) : require(c);
    }
    throw new Error(`cannot resolve ${id} from ${abs}`);
  };
  new Function('require','module','exports','__filename','__dirname',out)(localRequire, mod, mod.exports, abs, path.dirname(abs));
  if (!Object.keys(mocks).length) cache.set(key, mod.exports);
  return mod.exports;
}

const director = loadTs(v4('journeyDirector.ts'));
const extensions = loadTs(v4('journeyExtensions.ts'));
const procedure = loadTs(v4('procedureEngine.ts'));
let modelCalls = 0;
const base = {
  async understand() { modelCalls++; return { meaningSummary:'BASE', currentGoal:'base', explicitQuestions:[], neededFactKeys:[], requestedAction:null, actionDisposition:'none', requestedPersona:null, references:[], emotion:'neutral', urgency:'normal', topicChanged:false, customerRejectedPreviousAnswer:false, customerWantsBrevity:false, noReplyRequested:false, identityQuestion:false, humanContactRequested:false, socialClosure:false, confidence:.5, warnings:['base'] }; },
  async compose() { modelCalls++; throw new Error('paid/base compose called'); },
  async critique() { modelCalls++; throw new Error('paid/base critic called'); },
};
const wrapper = loadTs(v4('journeyAwareModelAdapter.ts'), {
  './modelAdapter': { createV4ModelAdapter: () => base },
  './journeyDirector': director,
  './journeyExtensions': extensions,
});
const adapter = wrapper.createV41JourneyAwareModelAdapter({ understandingProvider:{}, writerProvider:{}, criticProvider:{} });

function f(key,value,source='database',customerVisible=true){return {key,value,source,confidence:1,customerVisible};}
function truth(overrides={}){
  const facts={
    'application.exists':f('application.exists',true),
    'application.status.raw':f('application.status.raw','under_review'),
    'application.status.customer':f('application.status.customer','قيد الدراسة النهائية'),
    'application.journey_stage':f('application.journey_stage','payment_confirmed_under_review'),
    'application.payment_confirmed':f('application.payment_confirmed',true),
    'application.device_name':f('application.device_name','iPhone 17 Pro Max - 256GB'),
    'application.age_days':f('application.age_days',4),
    'business.products_url':f('business.products_url','https://www.ameenfinance.co/products','system'),
    'business.commercial_structure':f('business.commercial_structure','نظام التعامل مرابحة وليس قرضًا ربويًا','policy'),
    'business.location.general':f('business.location.general','عمّان – شارع المدينة المنورة','policy'),
    'requirements.guidance':f('requirements.guidance','الهوية وإثبات الدخل من الأساسيات؛ البدائل المناسبة للدخل تقبل حسب الدراسة، والكفيل ليس شرطًا ثابتًا','policy'),
    'review.normal_window':f('review.normal_window','من يومين إلى 3 أيام تشغيلية','policy'),
    'recent_release.rule':f('recent_release.rule','جميع أجهزة iPhone 18: الاستلام بعد شهر كامل من الموافقة النهائية الموثقة؛ وإذا وافق الموعد الجمعة أو السبت ينتقل لأول يوم تشغيل تالٍ','policy'),
    'pickup.rule':f('pickup.rule','الاستلام من المكتب وبموعد رسمي مؤكد فقط','policy'),
  };
  for(const [k,v] of Object.entries(overrides)) facts[k]=f(k,v);
  return {applicationId:'APP',trackingId:'AM-TEST',facts,verifiedActionReceipts:[]};
}
function memory(){return {version:'v4',conversationId:'R',persona:'abdullah',activeGoal:null,activeGoalTurnId:null,openQuestions:[],pendingProcedure:null,customerDecisions:[],factsAlreadyExplained:[],rejectedAnswerFingerprints:[],currentEmotion:'neutral',frustrationStreak:0,humanContactRequested:false,prefersBriefReplies:false,repetitionSensitivity:0,lastCustomerText:null,lastAssistantText:null,lastAssistantFingerprint:null,episodes:[],updatedAt:new Date(0).toISOString()};}
let passed=0,failed=0;
function ok(c,n,d=''){if(c){passed++;console.log(`PASS ${passed}: ${n}`)}else{failed++;console.error(`FAIL: ${n}${d?` :: ${d}`:''}`)}}
async function run(text,t=truth()){
  const m=memory();
  const u=await adapter.understand({burstText:text,truth:t,memory:m});
  let d=null;
  if(!u.requestedAction || u.actionDisposition==='none') d=await adapter.compose({burstText:text,understanding:u,memory:m,truth:t,procedure:{action:null,nextState:null,shouldExecute:false,needsConfirmation:false,reason:'replay'},care:{mode:'normal',opening:null,directives:[],forbiddenPatterns:[],maxSentences:null},persona:'abdullah',repairInstructions:[]});
  return {u,d,m};
}

async function main(){
  let r=await run('كم بدو وقت للموافقه وكم وقت للاستلام؟');
  ok(r.u.currentGoal==='review_and_delivery_time','dual approval+delivery question keeps both obligations');
  ok(r.d && /للموافقة:/.test(r.d.text||'') && /بالنسبة للاستلام:/.test(r.d.text||''),'dual question gets two direct short answers');

  r=await run('استلام الجهاز بالوضع الطبيعي كم بدو مدة تقريبي؟');
  ok(r.u.currentGoal==='device_delivery_time','delivery question is not misclassified as review timing');
  ok(r.d && /الاستلام/.test(r.d.text||'') && !/المعدل الطبيعي للمراجعة/.test(r.d.text||''),'delivery answer never repeats review-window boilerplate');

  r=await run('من الموافقة النهائية كم بدي عشان استلم الايفون 18؟',truth({'application.device_name':'iPhone 18 Pro - 1TB'}));
  ok(r.d && /شهر كامل/.test(r.d.text||'') && /الموافقة النهائية/.test(r.d.text||''),'iPhone 18 uses exact one-calendar-month delivery policy');

  r=await run('ساعدني منين ابلش',truth({'application.exists':false,'application.journey_stage':'none','application.status.raw':'','application.status.customer':''}));
  ok(r.u.currentGoal==='application_start','how-to-start request owns current goal');
  ok(r.d && /products/.test(r.d.text||'') && !/رقم تتبع/.test(r.d.text||''),'how-to-start gets products/application route, not tracking demand');

  r=await run('بدي اطلب جهاز جديد',truth({'application.journey_stage':'refund_requested','application.status.raw':'refund_requested','application.status.customer':'الاسترداد قيد المعالجة'}));
  ok(r.u.currentGoal==='start_new_application','new-device request is not hijacked by old refund case');
  ok(r.d && /طلب جديد/.test(r.d.text||'') && /products/.test(r.d.text||'') && !/الاسترداد قيد المعالجة/.test(r.d.text||''),'new-device answer starts new application instead of repeating refund status');

  r=await run('بدي اكمل الاجراء',truth({'application.journey_stage':'refund_requested','application.status.raw':'refund_requested','application.status.customer':'الاسترداد قيد المعالجة'}));
  ok(r.u.requestedAction==='reopen_application' && r.u.actionDisposition==='request','continue closed/refund case becomes reopen request');
  let pr=procedure.resolveV4Procedure({memory:r.m,turnId:'T-R',understanding:r.u});
  ok(pr.needsConfirmation===true && pr.shouldExecute===false,'reopen still requires exactly one separate confirmation');

  r=await run('ما بدي اعطي كشف راتب بدي اجيب كفيل');
  ok(r.u.currentGoal==='guarantor_vs_income_requirement','guarantor-vs-income question has dedicated goal');
  ok(r.d && /مش بديل تلقائي/.test(r.d.text||'') && /إثبات الدخل/.test(r.d.text||''),'guarantor question gets direct policy answer, not repeated generic template');

  r=await run('انا ما عندي راتب، دخلي من ورثة وايجار شقة');
  ok(r.u.currentGoal==='alternative_income_proof','rental/inheritance income is recognized as alternative-income proof question');
  ok(r.d && /مستند رسمي/.test(r.d.text||'') && /كشف حساب/.test(r.d.text||''),'alternative income gets evidence guidance without restarting sales script');

  r=await run('شو العقد كومبيله او شو؟');
  ok(r.u.currentGoal==='contract_type_question','contract/instrument question owns current goal');
  ok(r.d && /مرابحة/.test(r.d.text||'') && !/Orange Money|CliQ|رسوم فتح الملف 5/.test(r.d.text||''),'contract question never repeats payment handoff');

  r=await run('في فرع بمحافظة المفرق؟');
  ok(r.u.currentGoal==='office_location','branch/location question owns current goal');
  ok(r.d && /عمّان/.test(r.d.text||'') && !/موجود فرع بالمفرق|ما في فرع بالمفرق/.test(r.d.text||''),'location reply gives only documented location and does not invent Mafraq branch status');

  ok(modelCalls===0,'second-pass high-risk fixtures use zero paid/base model calls');
  console.log(`\nV4.1 SECOND-PASS 24H REPLAY: assertions=${passed+failed}; passed=${passed}; failed=${failed}; paid_model_calls=${modelCalls}`);
  if(failed)process.exit(1);
}
main().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
