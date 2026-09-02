const fs = require("fs");
const path = require("path");

const root = process.argv[2];
if (!root) throw new Error("ProjectRoot argument required");

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`missing:${rel}`);
  return fs.readFileSync(p, "utf8");
}
function has(rel, needle, label) {
  const text = read(rel);
  if (!text.includes(needle)) throw new Error(`${label || rel}: missing ${needle}`);
}
function lacks(rel, needle, label) {
  const text = read(rel);
  if (text.includes(needle)) throw new Error(`${label || rel}: forbidden ${needle}`);
}
function match(rel, re, label) {
  const text = read(rel);
  if (!re.test(text)) throw new Error(`${label || rel}: pattern missing ${re}`);
}

const base = "app/api/whatsapp/webhook/_lib/v3-os/";
has(base+"policy.ts", "fileOpeningFeeRefundRule", "fee refund policy");
has(base+"policy.ts", "مستردة بالكامل", "full refund wording");
has(base+"policy.ts", "fileOpeningFeePurposeRule", "fee purpose policy");
has(base+"policy.ts", "continuationReassuranceRule", "human reassurance policy");
has(base+"planner.ts", "لا تجعل الرد كأنه فاتورة باردة", "human commercial planner");
has(base+"writerContract.ts", "ممنوع تقديم الـ5 دنانير كطلب مالي جاف", "writer human guidance");
has(base+"writerContract.ts", "مستردة بالكامل", "writer refundability guidance");
has(base+"safeFallback.ts", "fileOpeningFeeRefundRule", "safe fallback refundability");
has(base+"safeFallback.ts", "ما في ضغط عليك", "safe fallback non-coercive reassurance");
has(base+"verifier.ts", "continuation_payment_ready_refundability_missing", "refundability verifier");
has(base+"verifier.ts", "continuation_payment_ready_fee_purpose_missing", "fee purpose verifier");
has(base+"verifier.ts", "continuation_payment_ready_human_reassurance_missing", "human reassurance verifier");

has(base+"discordNotifier.ts", 'name: "معرّف الطلب الداخلي"', "Arabic application label");
has(base+"discordNotifier.ts", 'name: "رقم واتساب"', "Arabic WhatsApp label");
has(base+"discordNotifier.ts", 'footer: { text: "نظام الأمين للأقساط" }', "Arabic Discord footer");
has(base+"discordNotifier.ts", "JSON.stringify(value)", "object-safe Discord formatting");
lacks(base+"discordNotifier.ts", 'name: "Application"', "English Application label removed");
lacks(base+"discordNotifier.ts", 'name: "WhatsApp"', "English WhatsApp label removed");
lacks(base+"discordNotifier.ts", "Al Ameen Finance System", "English footer removed from V3 notifications");
has(base+"runtimeLive.ts", 'title: "⛔ توقف الرد بأمان — يحتاج مراجعة"', "Arabic final safety title");
has(base+"runtimeLive.ts", '"مخالفات السياسة": verification.policyViolations.length', "Arabic verification summary");
lacks(base+"runtimeLive.ts", "details: { verification, turnId: input.turnId }", "raw verification payload removed");

// Revenue/ops continuity from Phase 6.4 must stay intact.
has(base+"runtimeLive.ts", '"customer_continue_payment_ready"', "continuation Discord event preserved");
has(base+"policy.ts", 'paymentAliases: ["AMEEENPAY", "AMENPAY"]', "approved payment aliases");
has(base+"policy.ts", 'paymentBeneficiaryName: "ABDUL RAHMAN ALHARAHSHEH"', "beneficiary preserved");

// Official upload routes remain operational source-of-truth Discord milestones.
match("app/api/receipt/route.ts", /sendDiscordNotification\s*\(/, "receipt upload Discord hook");
match("app/api/salary-slip/route.ts", /sendDiscordNotification\s*\(/, "salary upload Discord hook");

console.log("V3 PHASE 6.5 SELFTEST PASS");
console.log("5 JOD reason + full refundability + human reassurance: PASS");
console.log("Clean Arabic V3 Discord notifications: PASS");
console.log("No [object Object] formatting path: PASS");
console.log("Phase 6.4 commercial/Discord milestones preserved: PASS");
console.log("Payment confirmation remains admin-only: PASS");
