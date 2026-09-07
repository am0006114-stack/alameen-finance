const fs=require("fs"); const path=require("path");
const root=process.argv[2]||process.cwd();
let pass=0, fail=0;
function ok(v,m){if(v){pass++; console.log(`PASS ${pass}: ${m}`)}else{fail++; console.error(`FAIL: ${m}`)}}
function read(rel){return fs.readFileSync(path.join(root,rel),"utf8")}
const base="app/api/whatsapp/webhook/_lib/v3-os/";
const policy=read(base+"paymentDestinationOverride.ts");
const recovery=read(base+"conversationRecovery.ts");
const zero=read(base+"zeroFallback.ts");
const writer=read(base+"writerContract.ts");
const verifier=read(base+"verifier.ts");
const gate=read(base+"finalResponseGate.ts");
const firewall=read(base+"paymentEligibilityFirewall.ts");
for(const token of ["PAYAMEEEN","AMEEN1ST","AM500337","0788500337","Orange Money","ABDUL RAHMAN ALHARAHSHEH"]) ok(policy.includes(token),`current payment policy contains ${token}`);
ok(policy.includes("AMEEENPAY")&&policy.includes("AMENPAY"),"legacy aliases retained only for blocking/history recognition");
ok(recovery.includes("currentFileOpeningPaymentRule()"),"conversation recovery uses emergency payment override");
ok(zero.includes("currentFileOpeningPaymentRule()"),"zero fallback uses emergency payment override");
ok(!recovery.includes("${p.paymentMethodRule}"),"recovery no longer trusts stale paymentMethodRule");
ok(!zero.includes("p.paymentMethodRule"),"zero fallback no longer trusts stale paymentMethodRule");
ok(writer.includes("FILE_OPENING_PAYMENT_DESTINATION_OVERRIDE"),"writer receives current payment override");
ok(writer.includes("PAYAMEEEN")&&writer.includes("0788500337"),"writer contract names current destinations");
ok(writer.includes("AMEEEENPAY")===false,"writer has no typo alias AMEEEENPAY");
ok(verifier.includes("containsCurrentFileOpeningPaymentDestination"),"verifier checks current destinations");
ok(verifier.includes("legacy_payment_destination_forbidden"),"verifier forbids legacy destinations");
ok(gate.includes("legacy_payment_destination_forbidden"),"final gate blocks legacy destinations");
ok(gate.includes("buildCurrentPaymentExecutionReply"),"final gate can repair stale payment output deterministically");
ok(firewall.includes("allFileOpeningPaymentExecutionTokens"),"payment firewall sees current and legacy execution tokens");
ok(policy.includes("نعتذر عن أي لخبطة"),"current payment rule includes requested apology");
ok(policy.includes("تحديث طارئ ببيانات محفظة الدفع"),"apology states wallet data update reason");

const v2policy=read("app/api/whatsapp/webhook/_lib/v2-production/policyRegistry.ts");
const v2safe=read("app/api/whatsapp/webhook/_lib/v2-production/safeComposer.ts");
const v2runtime=read("app/api/whatsapp/webhook/_lib/v2-production/runtime.ts");
ok(v2policy.includes('["PAYAMEEEN", "AMEEN1ST", "AM500337"]'),"V2 policy has current aliases");
ok(v2policy.includes('paymentPhone: "0788500337"'),"V2 policy has current phone destination");
ok(v2policy.includes('"AMEEENPAY", "AMENPAY"'),"V2 policy blocks old aliases in forbidden list");
ok(v2safe.includes("نعتذر عن أي لخبطة")&&v2safe.includes("V2_POLICY.paymentPhone"),"V2 fallback composer includes apology and uses current policy phone");
ok(v2runtime.includes("PAYAMEEEN")&&v2runtime.includes("AM500337"),"V2 runtime recognizes current destinations");
const routePath=path.join(root,"app/api/whatsapp/webhook/route.ts");
if(fs.existsSync(routePath)){const route=fs.readFileSync(routePath,"utf8"); ok(!route.includes("الدفع.`r`n`r`nنوع المحفظة"),"route apology uses real newlines, not literal PowerShell escape tokens"); ok(!route.includes('const PAYMENT_DESTINATION_PRIMARY = "AMEEENPAY";'),"route old primary removed"); ok(!route.includes('const PAYMENT_DESTINATION_SECONDARY = "AMENPAY";'),"route old secondary removed"); if(route.includes("PAYMENT_DESTINATION_PRIMARY")){ok(route.includes("PAYAMEEEN")&&route.includes("AMEEN1ST")&&route.includes("AM500337")&&route.includes("0788500337"),"route fallback contains all current destinations")}}

console.log(`RESULT: ${pass}/${pass+fail} PASS`); if(fail) process.exit(1);
