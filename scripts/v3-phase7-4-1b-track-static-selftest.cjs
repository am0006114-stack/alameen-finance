const fs=require("fs");
function r(p){return fs.readFileSync(p,"utf8")}
function ok(x,m){if(!x)throw new Error(m)}

const p=r("app/track/page.tsx");
const c=r("app/track/TrackClient.tsx");
const a=r("app/api/public/order-status/route.ts");

ok(!p.includes("force-dynamic"),"track page still dynamic");
ok(!p.includes("supabaseAdmin"),"track page still has supabaseAdmin");
ok(p.includes('TrackClient from "./TrackClient"'),"static shell missing TrackClient");

ok(c.startsWith('"use client";'),"TrackClient not client");
ok(c.includes("useSearchParams"),"missing useSearchParams");
ok(c.includes("/api/public/order-status?phone="),"missing on-demand API lookup");
ok(!c.includes("supabaseAdmin"),"supabaseAdmin leaked to client");

for(const x of [
  "payment_confirmed_at",
  "device_price",
  "down_payment",
  "total_with_interest",
  "paid_clicked_at",
  "monthlyPaymentRaw",
  "fileOpeningFeeAmount",
  "doNotSetDeliveryDateAutomatically"
]){
  ok(a.includes(x),"API missing "+x);
}

console.log("PASS - V3 Phase 7.4.1B Track Static / On-Demand Lookup");
