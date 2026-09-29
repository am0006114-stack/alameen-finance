const fs=require('fs'); const path=require('path');
const root=process.argv[2]; if(!root) throw new Error('ProjectRoot required');
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function must(ok,msg){if(!ok) throw new Error(msg)}
let passed=0; function pass(ok,msg){must(ok,msg); passed++}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const os=read(base+'humanConversationOS.ts');
const brain=read(base+'humanConversationBrain.ts');
const native=read(base+'nativeConversationKernel.ts');
const writer=read(base+'writerContract.ts');
const verifier=read(base+'verifier.ts');

pass(/CONTEXT_CONFIRMABLE_MUTATIONS/.test(os),'pending mutation authority set missing');
pass(/explicitPendingMutationConfirmation/.test(os),'contextual mutation confirmation resolver missing');
pass(/pending === "cancel_application"/.test(os),'cancel confirmation binding missing');
pass(/pending === "request_refund"/.test(os),'refund confirmation binding missing');
pass(/pending === "stop_refund"/.test(os),'stop-refund confirmation binding missing');
pass(/pending === "reopen_application"/.test(os),'reopen confirmation binding missing');
pass(/requiresConfirmation: false/.test(os),'confirmed pending action must bypass second confirmation');
pass(/authority: "deterministic"/.test(os),'confirmed pending mutation must be deterministic');
pass(/requiredRole: "omran"/.test(os),'sensitive confirmed mutation must remain Omran-owned');
pass(/forceConfirmedPendingMutation/.test(os),'confirmed action plan override missing');
pass(/punctuationOnlyCustomerTurn/.test(os),'punctuation noise suppression missing');
pass(/hasNewerCustomerTurn/.test(os),'stale-turn supersession check missing');
pass(/newer_customer_turn/.test(os),'stale-turn journal reason missing');
pass(/shouldRespond: false/.test(os),'suppressed stale/noise turn must not respond');
pass(/simpleSocialClosureReply/.test(os),'social closure authority missing');
pass(/الله يعافيك، بأي وقت/.test(os),'thanks closure reply missing');
pass(/humanRequestGroundedReply/.test(os),'human-request truthful authority missing');
pass(/ما عندي تحويل تلقائي لمكالمة أو لموظف منفصل/.test(os),'human-request false handoff protection missing');
pass(/unsupported_future_operational_promise/.test(os),'critical promise repair reason not handled by Human OS');
pass(/customerMessage هو السلطة الأعلى/.test(brain),'current-message authority prompt missing');
pass(/recentConversation سياق فقط/.test(brain),'recent conversation demotion missing');
pass(/مسموح تستخدم متابعة بشرية خفيفة ومعقولة/.test(brain),'soft follow-up allowance missing from Human Brain');
pass(/الحقائق الحساسة المتعلقة بالجهاز/.test(brain),'critical commercial truth boundary missing from Human Brain');
pass(/رسالة اجتماعية ختامية/.test(brain),'social closure stale-loop rule missing');
pass(/الفريق كله موجود وبيرد عليك/.test(brain),'false team-presence prompt rule missing');
pass(/criticalPromiseTruthContext/.test(native),'native critical promise context missing');
pass(/unsupportedFutureOperationalPromise/.test(native),'native future-promise detector missing');
pass(/unsupported_future_operational_promise/.test(native),'native future-promise violation missing');
pass(/false_team_presence_or_live_human_followup_claim/.test(native),'native false team-presence guard missing');
pass(/CURRENT TURN AUTHORITY/.test(writer),'writer current-turn authority missing');
pass(/PROMISE SCOPE/.test(writer),'writer promise scope missing');
pass(/مسموح كلام متابعة بشري خفيف ومعقول/.test(writer),'writer soft follow-up allowance missing');
pass(/عند «شكرا\/تمام\/ماشي»/.test(writer),'writer social closure anti-loop rule missing');
pass(/criticalPromiseTruthContext/.test(verifier),'verifier critical promise context missing');
pass(/unsupported_future_operational_promise/.test(verifier),'verifier critical promise guard missing');
pass(/false_team_presence_or_live_human_followup_claim/.test(verifier),'verifier human-presence guard missing');

// Preserve Phase 11.2 paid-only secure device-change authority.
pass(/const paymentConfirmed = hasAuthoritativePaymentConfirmation\(app\)/.test(os),'11.2 authoritative payment check missing');
pass(/const secureDeviceLink = paymentConfirmed[\s\S]*buildSecureDeviceChangeUrl[\s\S]*: null/.test(os),'11.2 paid-only secure link gate regressed');
pass(/paymentProtected/.test(os),'11.2 pending-payment protection missing');
pass(!os.includes('orangmoney.com') && !brain.includes('orangmoney.com') && !writer.includes('orangmoney.com'),'cross-project literal must not exist');

// Behavior corpus from the 2026-09-29 production failure sample.
const promiseRx=/(?:خليني|دعني).{0,25}(?:اتاكد|اتأكد|أتأكد|اراجع|أراجع).{0,55}(?:و?(?:ب)?رجعلك|و?(?:ب)?رجع\s+لك|و?ارجعلك|وأرجعلك|و?بخبرك|و?ببلغك|و?برد\s+عليك)|(?:لسا|ما\s+زلت).{0,25}(?:بانتظار|ناطر).{0,55}(?:الجهه\s+المختصه|الجهة\s+المختصة|الاداره|الإدارة|التاكيد|التأكيد|الرد)|(?:اول\s+ما|أول\s+ما).{0,65}(?:يوصلني|يجيني|يطلع|يصدر).{0,45}(?:الجواب|الرد|التاكيد|التأكيد|التحديث)?.{0,35}(?:و?برجعلك|و?بخبرك|و?ببلغك|و?برد\s+عليك)|(?:برجعلك|بخبرك|ببلغك).{0,45}(?:بالجواب|بالرد|بالتاكيد|بالتأكيد)|(?:براجع|رح\s+اراجع|رح\s+أراجع).{0,35}(?:مع\s+الاداره|مع\s+الإدارة|الجهه\s+المختصه|الجهة\s+المختصة)/;
const criticalTopics=new Set(['products','product_price','device_change','device_recalculation','payment_fee','payment_method','payment_timing','payment_recipient','payment_status','payment_confirmation','receipt_upload','refund','cancellation','continuation','reopen','application_status','application_correction']);
function criticalPromise(topics){return topics.some((x)=>criticalTopics.has(x))}
function promiseBlocked(text,topics){return criticalPromise(topics) && promiseRx.test(text)}
pass(!promiseBlocked('خليني أتأكد من سياسة التأخير وبرجعلك',['complaint']),'general soft follow-up must remain allowed');
pass(!promiseBlocked('أنا لسا بانتظار التأكيد من الجهة المختصة بخصوص الغرامة',['complaint']),'general department follow-up must remain allowed');
pass(promiseBlocked('خليني أتأكد من حالة دفع الخمس وبرجعلك',['payment_status']),'payment promise must remain truth-bound');
pass(promiseBlocked('أنا براجع مع الإدارة موضوع الاسترداد وبرجعلك',['refund']),'refund promise must remain truth-bound');
pass(promiseBlocked('أول ما يوصلني الرد بخصوص تغيير الجهاز بخبرك',['device_change']),'device-change promise must remain truth-bound');
pass(promiseBlocked('أول ما يطلع قرار الإلغاء بخبرك',['cancellation']),'cancellation promise must remain truth-bound');
pass(!promiseRx.test('المعلومة هاي مش مثبتة عندي حاليًا وما رح أخمّن'),'truthful unknown-fact reply must remain allowed');
const humanRx=/(?:الفريق\s+كله).{0,35}(?:موجود|بيرد|برد|متابع)|(?:أنا|انا)\s+متابع\s+طلبك\s+(?:مباشره|مباشرة)/;
pass(humanRx.test('الفريق كله موجود وبيرد عليك من هون'),'sample false team presence must be blocked');
pass(humanRx.test('أنا متابع طلبك مباشرة'),'sample false live-human followup must be blocked');
pass(!humanRx.test('معك عمران من الأمين وبكمل معك هون على نفس المحادثة'),'truthful persona continuity must remain allowed');

console.log(`V3 PHASE 11.3 SELFTEST PASS (${passed}/${passed})`);
console.log('Confirmation completion + stale-turn suppression + current-question authority + promise truth: PASS');
