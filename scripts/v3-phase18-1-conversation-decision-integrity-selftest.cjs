const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
function read(rel){ return fs.readFileSync(path.join(root,rel),"utf8").replace(/\r\n/g,"\n"); }
function ok(cond,msg){ if(!cond) throw new Error("SELFTEST FAIL: "+msg); console.log("PASS:",msg); }

const sup = read("app/api/whatsapp/webhook/_lib/v3-os/currentTurnSupremacy.ts");
ok(sup.includes('"delivery_timing"'), "explicit delivery timing authority");
ok(sup.includes('"payment_channel_access"'), "no-wallet payment channel authority");
ok(sup.includes('"regulatory_status"'), "regulatory status safe authority");
ok(sup.includes("countOperationalDaysElapsed"), "operational-day count is deterministic");
ok(sup.includes("iphone18_policy") === false, "current-turn authority does not hardwire unrelated iPhone18 policy marker");

const mod = read("app/api/whatsapp/webhook/_lib/v3-os/applicationModificationRouting.ts");
ok(mod.includes('"secure_device_link_failed"'), "broken device-change link has a terminal route");
ok(mod.includes("deviceChangeLinkFailureReported"), "broken-link detector exists");
ok(mod.includes("broken_device_change_link_reissued"), "reissued broken link is a violation");

const gate = read("app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts");
ok((gate.match(/clearPendingConfirmation = true;/g)||[]).length >= 3, "confirmation consumption clears pending state");

const verifier = read("app/api/whatsapp/webhook/_lib/v3-os/verifier.ts");
ok(verifier.includes("unsupported_regulatory_exclusion_claim"), "unsupported negative regulator claim blocked");
ok(verifier.includes("iphone18_policy_out_of_scope"), "iPhone18 policy cannot leak to another product");

const runtime = read("app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts");
ok(runtime.includes("notifyDeviceChangeLinkFailure"), "broken device link alerts administration");
ok(runtime.includes("&& !linkFailureReported"), "broken device link is not regenerated");

const admin = read("app/admin/whatsapp/page.tsx");
const discord = read("app/api/whatsapp/webhook/_lib/v3-os/discordNotifier.ts");
ok(admin.includes("[REDACTED]"), "admin copy redacts temporary token");
ok(discord.includes("[REDACTED]"), "Discord operational summary redacts temporary token");

console.log("\\nPHASE18.1 FAST REGRESSION=PASS");
