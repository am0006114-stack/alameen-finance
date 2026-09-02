const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('PASS:', msg); };

const route = read('app/api/whatsapp/webhook/route.ts');
const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const rescue = read('app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts');
const verifier = read('app/api/whatsapp/webhook/_lib/v3-os/verifier.ts');
const writer = read('app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts');
const notif = read('app/api/whatsapp/webhook/_lib/v3-os/notificationPolicy.ts');
const discord = read('app/api/whatsapp/webhook/_lib/v3-os/discordNotifier.ts');
const controlApi = read('app/api/admin/whatsapp-control/route.ts');
const controlUi = read('app/admin/whatsapp-control/ControlActions.tsx');
const controlPage = read('app/admin/whatsapp-control/page.tsx');
const types = read('app/api/whatsapp/webhook/_lib/v3-os/types.ts');

must(route.includes('V3 PHASE 6.9 EMERGENCY SAFE FAILOVER'), 'Phase 6.9 emergency V1 failover baseline preserved');
must(types.includes('phase7.1-zero-fallback-manual-actions'), 'V3 runtime version advanced to Phase 7.1');
must(runtime.includes('buildZeroFallbackReply') && runtime.includes('verifyZeroFallbackReply'), 'Live runtime uses deterministic zero-fallback rescue');
must(!runtime.includes('صار خلل مؤقت وأنا بجهز الرد'), 'Live runtime no longer exposes the old failure sentence');
must(!rescue.includes('صار خلل مؤقت وأنا بجهز الرد'), 'Zero-fallback rescue contains no visible internal failure language');
must(rescue.includes('ما رح أعتبره منجز ولا أقول لك تم'), 'Manual action rescue refuses unsupported completion claims');
must(verifier.includes('EXECUTION RECEIPT GATE') && verifier.includes('execution_receipt_missing:cancel_application'), 'Execution Receipt Gate blocks unsupported mutation completion claims');
must(writer.includes('outcome=dry_run') || writer.includes('ACTION_RESULTS فيه dry_run'), 'Writer contract explains manual/non-executed action results');
must(notif.includes('manual_action_required') && notif.includes('real_action_requires_manual_admin_execution'), 'Notification policy includes manual action requests');
must(discord.includes('🛠️ إجراء مطلوب — بانتظار تنفيذ الإدارة'), 'Discord has a clean Arabic manual-action alert');
must(runtime.includes('notifyManualActionRequests') && runtime.includes('realActionsEnabled: input.realActionsEnabled'), 'Live runtime sends manual action requests while Real Actions are off');
must(controlApi.includes('Real Actions مقفلة حاليًا') && !controlApi.includes('تم تفعيل Real Actions لعمران'), 'Control API prevents enabling automatic Real Actions');
must(controlUi.includes('الإجراءات الحقيقية: يدوي عبر Discord') && !controlUi.includes('تفعيل Real Actions لعمران'), 'Control Center exposes manual Discord action mode instead of enable button');
must(controlPage.includes('Fallback ظاهر') && controlPage.includes('إجراءات يدوية') && controlPage.includes('فشل إرسال'), 'Control Center exposes production reliability counters');

if (!process.exitCode) console.log('V3 PHASE 7.1 SELFTEST PASS');
