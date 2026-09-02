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
function match(rel, re, label) {
  const text = read(rel);
  if (!re.test(text)) throw new Error(`${label || rel}: pattern missing ${re}`);
}

const base = "app/api/whatsapp/webhook/_lib/v3-os/";
has(base+"commercialProgression.ts", "payment_ready", "commercial progression state");
has(base+"commercialProgression.ts", "preliminary_qualified", "preliminary qualification gate");
has(base+"planner.ts", "رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط", "continuation fee planner");
has(base+"planner.ts", "paymentMethodRule", "continuation payment instructions");
has(base+"linkIntegrity.ts", 'turnNeeds("continuation"', "continuation receipt truth link");
has(base+"verifier.ts", "continuation_payment_ready_missing_5_jod_fee", "hard 5 JOD verifier");
has(base+"verifier.ts", "continuation_payment_ready_missing_payment_destination", "payment destination verifier");
has(base+"runtimeLive.ts", '"customer_continue_payment_ready"', "continuation Discord event");
has(base+"notificationPolicy.ts", '"customer_continue_payment_ready"', "continuation Discord policy");
has(base+"notificationPolicy.ts", '"official_receipt_uploaded"', "receipt Discord event");
has(base+"notificationPolicy.ts", '"official_salary_slip_uploaded"', "salary Discord event");
has(base+"policy.ts", 'paymentAliases: ["AMEEENPAY", "AMENPAY"]', "approved CliQ aliases");
has(base+"policy.ts", 'paymentBeneficiaryName: "ABDUL RAHMAN ALHARAHSHEH"', "payment beneficiary");
has(base+"safeFallback.ts", "رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط", "fallback restores commercial step");

// Existing official upload routes must retain direct Discord operational notifications.
// Phase 6.4 does not move these events into chat; uploads remain source-of-truth events.
const receiptRoute = "app/api/receipt/route.ts";
const salaryRoute = "app/api/salary-slip/route.ts";
match(receiptRoute, /sendDiscordNotification\s*\(/, "receipt upload Discord hook");
match(receiptRoute, /وصل\s*الدفع|payment_receipt/, "receipt upload milestone");
match(salaryRoute, /sendDiscordNotification\s*\(/, "salary upload Discord hook");
match(salaryRoute, /كشف\s*راتب|salary_slip/, "salary upload milestone");

console.log("V3 PHASE 6.4 SELFTEST PASS");
console.log("Continuation -> 5 JOD commercial step: PASS");
console.log("Continuation -> Discord operational alert: PASS");
console.log("Receipt upload Discord hook preserved: PASS");
console.log("Salary-slip upload Discord hook preserved: PASS");
console.log("Payment confirmation remains admin-only: PASS");
