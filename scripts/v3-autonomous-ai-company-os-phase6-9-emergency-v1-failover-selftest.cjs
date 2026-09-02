const fs=require('fs');
const p='app/api/whatsapp/webhook/route.ts';
const s=fs.readFileSync(p,'utf8');
function must(x,m){if(!x){console.error('FAIL:',m);process.exit(1)}}
const a=s.indexOf('V3 PHASE 6.9 EMERGENCY SAFE FAILOVER');
const b=s.indexOf('// V2.1 PRODUCTION CONVERSATION OS:',a);
must(a>0 && b>a,'6.9 failover branch must exist before V2.1');
const block=s.slice(a,b);
must(block.includes('if (!v3LiveActive)'), 'V1 emergency branch must run whenever V3 is inactive');
must(block.includes('buildReply('), 'proven V1 reply path must be used');
must(block.includes('applyProductionFinalTruthGate'), 'V1 final truth gate must remain');
must(block.includes('finalizeLastMileDeliveryReply'), 'V1 final delivery integrity must remain');
must(block.includes('sendWhatsAppTextDetailed(from, reply, true)'), 'safe route must attempt actual WhatsApp delivery');
must(block.includes('buildV3LastResortReply()'), 'safe route must have one short delivery retry');
must(block.includes('await markIncomingWhatsAppMessageProcessed(message.id)'), 'incoming message must be completed after safe route');
must(!block.includes('isAutoReplyIgnored('), 'emergency route must ignore legacy human-handoff pause markers');
must(!block.includes('prepareV2ProductionTurn('), 'emergency V1 route must bypass V2 canary/no-reply semantics');
console.log('V3 PHASE 6.9 SELFTEST PASS');
