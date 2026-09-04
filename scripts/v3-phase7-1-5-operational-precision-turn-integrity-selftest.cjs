const fs = require("fs");
const path = require("path");
const root = process.argv[2] || process.cwd();

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const route = read("app/api/whatsapp/webhook/route.ts");
const writer = read("app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts");
const verifier = read("app/api/whatsapp/webhook/_lib/v3-os/verifier.ts");
const fallback = read("app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts");
const links = read("app/api/whatsapp/webhook/_lib/v3-os/linkIntegrity.ts");
const runtime = read("app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts");
const precision = read("app/api/whatsapp/webhook/_lib/v3-os/operationalPrecision.ts");
const turnIntegrity = read("app/api/whatsapp/webhook/_lib/v3-os/turnIntegrity.ts");
const adapter = read("app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts");
const discord = read("app/api/whatsapp/webhook/_lib/v3-os/discordNotifier.ts");

ok(/Friday/.test(precision) && /Saturday/.test(precision) && /عطلة للمكتب/.test(precision), "Friday/Saturday weekly office holiday is deterministic");
ok(/resolveOfficeScheduleTarget/.test(precision) && /reference: asksTomorrow/.test(precision), "today/tomorrow office questions resolve the requested day in Amman");
ok(/named_day/.test(precision) && /ARABIC_WEEKDAY_TO_ENGLISH/.test(precision), "named weekday office questions resolve the named day instead of current day");
ok(/ساعات الدوام التفصيلية مش موثقة/.test(precision), "office hours are not invented when exact hours are unavailable");
ok(/استقبال الطلبات والمتابعة عبر الموقع وواتساب مستمر/.test(precision), "requests remain accepted during weekly holiday");
ok(/appointmentCoordinationOverclaim/.test(verifier) && /appointment_coordination_not_supported/.test(verifier), "appointment coordination offers are verifier-blocked");
ok(/المحادثة لا تملك إجراء حجز\/تنسيق موعد/.test(writer), "writer cannot offer or coordinate office appointments");
ok(/bankStatementDurationQuestion/.test(verifier) && /bank_statement_duration_not_answered_usefully/.test(verifier), "bank-statement duration questions require a useful honest answer");
ok(/ما عندي حد أدنى ثابت وموثق/.test(precision), "bank-statement fallback states no invented fixed minimum");
ok(/explicitDocumentUploadKind/.test(links) && /required_explicit_document_upload_url_missing/.test(links), "explicit document upload requests require the exact bound official link");
ok(/salarySlip/.test(links) && /\/salary-slip/.test(links), "salary document resolves to the bound salary-slip route");
ok(/safeCustomerFirstName/.test(writer) && /profileName: input\.profileName/.test(runtime), "customer name is used only with profile/application confidence");
ok(!/const who = name/.test(fallback), "deterministic status fallback does not reintroduce an unverified application name");
ok(/customer_name_confidence_low/.test(verifier), "low-confidence customer-name vocatives are blocked");
ok(/product_availability_not_authoritative/.test(verifier), "unverified product availability claims are blocked");
ok(/device_price_not_authoritative/.test(verifier) && /monthly_payment_not_authoritative/.test(verifier), "price/installment numbers must come from application truth");
ok(/shouldSuppressStaleV3Reply/.test(route) && /Skipped stale V3 reply because a newer customer message arrived/.test(route), "pre-send stale-turn suppression prevents old concurrent replies");
ok(/direction", "incoming"/.test(turnIntegrity) || /\.eq\("direction", "incoming"\)/.test(turnIntegrity), "stale-turn guard reads newer incoming DB truth");
ok(!/messageType:\s*"status"[\s\S]{0,120}rawPayload:\s*statusEvent/.test(route), "unmatched Meta status events no longer create empty conversation rows");
ok(/profileName:\s*contactName/.test(route), "WhatsApp profile identity is passed into V3 name-confidence gate");

// Preserve 7.1.3A safety scope and Discord direct-order behavior.
ok(/LIVE_SCOPED_MUTATIONS\s*=\s*new Set\(\[\s*"cancel_application",\s*"request_refund"/m.test(adapter), "automatic real-action allow-list remains cancel + refund only");
ok(/scoped_real_actions_disallowed/.test(adapter), "all non-scoped mutations remain blocked automatically");
ok(/notifyScopedMutationSuccesses/.test(runtime) && /business_mutation_succeeded/.test(runtime), "executed scoped mutations still emit Discord success events");
ok(/admin\/applications/.test(discord) && /فتح الطلب مباشرة/.test(discord), "Discord still carries direct admin application links");
ok(/installment_payment_destination_not_authoritative/.test(verifier), "Phase 7.1.4 installment-payment truth guard remains active");
ok(/guarantor_requirement_presented_as_mandatory_without_truth/.test(verifier), "conditional guarantor requirement guard remains active");

if (process.exitCode) {
  console.error("V3 Phase 7.1.5 self-test FAILED");
  process.exit(1);
}
console.log("V3 Phase 7.1.5 self-test: PASS");
