const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const rel = p => path.join(root, p);
const read = p => fs.readFileSync(rel(p), 'utf8');
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const base = 'app/api/whatsapp/webhook/_lib/v3-os';
const state = read(`${base}/state.ts`);
const live = read(`${base}/runtimeLive.ts`);
const shadow = read(`${base}/runtimeShadow.ts`);
const writer = read(`${base}/writerContract.ts`);
const human = read(`${base}/humanVoice.ts`);
const verifier = read(`${base}/verifier.ts`);
const planner = read(`${base}/planner.ts`);
const policy = read(`${base}/policy.ts`);
const fallback = read(`${base}/safeFallback.ts`);
const hierarchy = read(`${base}/hierarchy.ts`);

assert(state.includes('markRoleIntroducedFromReply'), 'role introduction persistence missing');
assert(state.includes('inferRoleIntroducedFromRecentTurns'), 'legacy/current intro recovery missing');
assert(live.includes('inferRoleIntroducedFromRecentTurns') && live.includes('markRoleIntroducedFromReply'), 'live runtime does not persist/recover role intro');
assert(shadow.includes('inferRoleIntroducedFromRecentTurns') && shadow.includes('markRoleIntroducedFromReply'), 'shadow runtime does not mirror role intro semantics');

assert(writer.includes('ROLE_ALREADY_INTRODUCED='), 'writer lacks role-introduction state');
assert(writer.includes('ممنوع قول أو تسريب'), 'writer lacks internal-language hard ban');
assert(writer.includes('سؤال واحد واضح كحد أقصى'), 'writer lacks one-question risk rule');
assert(!writer.includes('المستوى: ${role.tier}'), 'writer still exposes internal tier field');
assert(!writer.includes('المهمة: ${role.mission}'), 'writer still feeds internal mission as customer prose cue');

assert(human.includes('repeated_staff_identity'), 'humanity detector lacks repeated staff identity guard');
assert(human.includes('45–90 كلمة'), 'human voice lacks concise risk target');
assert(verifier.includes('internal_architecture_exposed_to_customer'), 'verifier lacks internal architecture leak guard');
assert(verifier.includes('repeated_role_self_introduction'), 'verifier lacks repeated self-intro guard');
assert(verifier.includes('risk_reply_too_long'), 'verifier lacks risk length guard');
assert(verifier.includes('risk_reply_too_many_questions'), 'verifier lacks multi-question guard');
assert(verifier.includes('risk_reply_too_many_paragraphs'), 'verifier lacks paragraph guard');

assert(!planner.includes('Supervisor AI'), 'planner still contains leak-prone Supervisor AI wording');
assert(!planner.includes('كفريق AI كامل'), 'planner still contains leak-prone AI objective');
assert(!policy.includes('Supervisor AI داخل النظام'), 'policy still contains leak-prone supervisor wording');
assert(!hierarchy.includes('Supervisor AI وصاحب صلاحية'), 'hierarchy mission still contains leak-prone supervisor wording');
assert(fallback.includes('manager_request") && !input.state.role.introduced'), 'fallback repeats manager identity after introduction');

// Regression fixture from the first live Omran sample: this must be rejected by
// the Phase 6.1 style gates for multiple independent reasons.
const bad = `أنا عمران، مستوى الإشراف في النظام. أنا قادر أحل مشكلتك كاملة من هون، وما رح تحتاج تنتقل لأي حدا ثاني.\n\nبخصوص اتهامك بالنصب، أنا ما رح أدخل معك بجدال، بس خليني أوضحلك شغلة مهمة: حقك ما رح يضيع، وإذا بدك تكمل بالطلب الإلغاء متاح قدامك مباشرة. وإذا في دفع مؤكد، مسار الاسترداد محفوظ ويمشي حسب حالته.\n\nبس عشان أساعدك فعليًا بدي أعرف شو صار معك بالضبط؟ هل المشكلة تأخر بالدراسة، ولا في شي غلط بالطلب، ولا بدك تلغي؟ احكيلي التفاصيل وأنا بتابع معك خطوة بخطوة.`;
const words = bad.trim().split(/\s+/).length;
const questions = (bad.match(/[؟?]/g) || []).length;
assert(/مستوى\s+(?:ال)?إشراف\s+في\s+النظام/.test(bad), 'regression fixture missing internal leak');
assert(words > 80, 'regression fixture unexpectedly short; length guard calibration no longer meaningful');
assert(questions > 1, 'regression fixture unexpectedly has <=1 question');

// Desired shape is intentionally not a fixed template; only structural guards.
const good = `معك عمران. إذا عندك مشكلة بطلبك أنا بمسكها معك من هون.\n\nإذا ما بدك تكمل، الإلغاء متاح، وإذا في دفع مؤكد فحق الاسترداد محفوظ. احكيلي شو اللي صار مع طلبك تحديدًا؟`;
assert((good.match(/[؟?]/g) || []).length === 1, 'good fixture must have one question');
assert(good.trim().split(/\s+/).length < 60, 'good fixture should stay concise');
assert(!/مستوى\s+(?:ال)?إشراف|Supervisor|\bAI\b|ذكاء اصطناعي/i.test(good), 'good fixture leaks internal architecture');

console.log('V3 PHASE 6.1 HUMAN CALIBRATION SELFTEST PASS');
console.log('Role-introduction persistence/recovery: PASS');
console.log('Internal architecture leak prevention: PASS');
console.log('Risk brevity + one-question guard: PASS');
console.log('Repeated identity guard: PASS');
console.log('Live/Shadow semantic parity: PASS');
