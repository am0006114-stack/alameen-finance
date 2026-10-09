const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();
const routePath=path.join(root,'app/api/whatsapp/webhook/route.ts');
const src=fs.readFileSync(routePath,'utf8');
const oldImport='import { buildV3LastResortReply, runV3ProductionLive } from "./_lib/v3-os/runtimeLive";';
const newImport='import { buildV3LastResortReply, runV3ProductionLive } from "./_lib/v4-os/productionRuntime";';
const oldCondition='if (!v3Run.finalSafetyPass || !v3Run.reply) {';
const newCondition='if (!v3Run.finalSafetyPass || (!v3Run.reply && !v3Run.suppressReply)) {';
const oldReply='            reply = v3Run.reply;';
const newReply=`            if (v3Run.suppressReply) {\n              // V4 explicit silence is a valid human conversation outcome. Persist the\n              // memory and complete the inbound burst without fabricating an outgoing message.\n              await saveV3ConversationState(v3Run.stateAfter);\n              await markIncomingWhatsAppMessagesProcessed(burstMessageIds.length ? burstMessageIds : [String(message.id || "")]);\n              console.log("V4 explicit no-reply turn completed", { waId: from, messageId: message.id || null, turnId: v3TurnId });\n              return;\n            }\n            reply = v3Run.reply || "";`;

function count(hay,needle){let n=0,i=0;while((i=hay.indexOf(needle,i))>=0){n++;i+=needle.length}return n}
const already=src.includes(newImport)&&src.includes(newCondition)&&src.includes('V4 explicit no-reply turn completed');
if(already){console.log('PASS - V4 final cutover route already patched');process.exit(0)}
const checks=[
  [count(src,oldImport)===1,'expected exactly one V3 runtime import anchor'],
  [count(src,oldCondition)===1,'expected exactly one V3 final-safety anchor'],
  [count(src,oldReply)===1,'expected exactly one V3 reply assignment anchor'],
  [!src.includes(newImport),'V4 runtime import is not partially installed'],
];
for(const [ok,msg] of checks){if(!ok){console.error('FAIL - '+msg);process.exit(1)}}
let out=src.replace(oldImport,newImport).replace(oldCondition,newCondition).replace(oldReply,newReply);
if(out===src){console.error('FAIL - patch made no change');process.exit(1)}
if(out.includes(oldImport)){console.error('FAIL - old V3 conversational runtime import remains');process.exit(1)}
if(count(out,newImport)!==1||count(out,newCondition)!==1||count(out,'V4 explicit no-reply turn completed')!==1){console.error('FAIL - patched route contract is not unique');process.exit(1)}
fs.writeFileSync(routePath,out,'utf8');
console.log('PASS - webhook surgically switched to ALAMEEN V4 production runtime');
console.log('PASS - explicit V4 silence persists state and sends no WhatsApp message');
console.log('PASS - V3 runtimeLive.ts was not modified');
