const fs=require("fs");
const path=require("path");
const root=process.argv[2]||process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
let failed=0;
function ok(v,m){ if(v) console.log("PASS:",m); else { console.error("FAIL:",m); failed++; } }

const auth=read("app/api/whatsapp/webhook/_lib/v3-os/deviceChangeAuthority.ts");
const page=read("app/change-device/page.tsx");
const api=read("app/api/change-device/route.ts");
const admin=read("app/admin/applications/[id]/page.tsx");
const ar=read("app/api/admin/device-change-link/route.ts");
const informed=read("app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts");
const runtime=read("app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts");

ok(/TOKEN_TTL_MS = 24 \* 60 \* 60 \* 1000/.test(auth),"device link lifetime is 24h");
ok(/beforeHash/.test(auth) && /timingSafeEqual/.test(auth),"compact encrypted token uses snapshot hash");
ok(/before: DeviceChangeBeforeSnapshot \| null/.test(auth),"legacy link compatibility retained");
ok(/sameDeviceChangeSnapshot/.test(auth),"stable legacy comparator retained");
ok(/p_expected_before: currentSnapshot/.test(api),"RPC uses current full snapshot after live recheck");
ok(/deviceChangeClaimsMatchSnapshot/.test(api),"new compact links are stale-checked");
ok(/sameDeviceChangeSnapshot\(currentSnapshot, claims\.before\)/.test(api),"legacy links are stale-checked");
ok(/deviceChangeRowHasAuthoritativePaymentConfirmation/.test(api),"execution rechecks authoritative payment");
ok(/canV3ExecuteRealActions/.test(api),"Real Actions global gate retained");
ok(/IPHONE18_PRODUCTS/.test(page) && /IPHONE18_PRODUCTS/.test(api),"price authority was not widened");
ok(/DeviceChangeLinkAction/.test(admin),"admin UI has device-change link action");
ok(/isAdminLoggedIn/.test(ar),"admin route is authenticated");
ok(/deviceChangeRowHasAuthoritativePaymentConfirmation/.test(ar),"admin route cannot issue unpaid link");
ok(/cancelled/.test(ar) && /refund_requested/.test(ar),"admin route blocks cancelled/refund states");
ok(!/\.update\(/.test(ar) && !/\.rpc\(/.test(ar),"admin link generation itself never mutates the application");

ok(/رسوم فتح الملف/.test(informed),"5 JOD disclosure code remains present");
ok(/stage !== "continuation_confirmed_fee_due"/.test(informed),"payment destination still waits for authoritative continuation");

if(failed){ console.error(`PHASE 18.8 R1.6 FAILED: ${failed}`); process.exit(1); }
console.log("PHASE 18.8 R1.6 DEVICE LINK + ADMIN + 5 JOD SEPARATION: PASS");
