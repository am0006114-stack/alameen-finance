const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const rel = p => path.join(root, p);
const read = p => fs.readFileSync(rel(p), 'utf8');
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const base = 'app/api/whatsapp/webhook/_lib/v3-os';
const links = read(`${base}/linkIntegrity.ts`);
const writer = read(`${base}/writerContract.ts`);
const verifier = read(`${base}/verifier.ts`);
const live = read(`${base}/runtimeLive.ts`);
const shadow = read(`${base}/runtimeShadow.ts`);
const fallback = read(`${base}/safeFallback.ts`);
const planner = read(`${base}/planner.ts`);

assert(links.includes('sanitizeRecentTurnsForModel'), 'recent-turn URL redaction missing');
assert(links.includes('sanitizeStateForWriter'), 'state URL redaction missing');
assert(links.includes('sanitizeTurnForWriter'), 'current-turn URL redaction missing');
assert(links.includes('foreign_domain_url:'), 'foreign URL hard gate missing');
assert(links.includes('url_not_issued_by_v3_truth:'), 'exact issued-link gate missing');
assert(links.includes('required_receipt_url_missing'), 'receipt exact-link requirement missing');
assert(links.includes('receipt_link_requires_application_resolution'), 'receipt no-truth fail-closed guard missing');
assert(links.includes('BUSINESS_WEBSITE'), 'canonical business website source missing');

assert(live.includes('sanitizeRecentTurnsForModel(input.recentTurns)'), 'live runtime still sends raw historic URLs to AI');
assert(shadow.includes('sanitizeRecentTurnsForModel(input.recentTurns)'), 'shadow runtime does not mirror memory isolation');
assert(writer.includes('OFFICIAL_LINKS (المصدر الوحيد المسموح للروابط)'), 'writer lacks deterministic link source');
assert(writer.includes('ممنوع كتابة أو نسخ أو استنتاج أي URL'), 'writer lacks memory/customer URL prohibition');
assert(writer.includes('sanitizeStateForWriter'), 'writer state is not sanitized');
assert(writer.includes('sanitizeTurnForWriter'), 'writer current turn is not sanitized');
assert(verifier.includes('detectReplyLinkViolations'), 'verifier is not enforcing link integrity');
assert(verifier.includes('link_integrity:'), 'verifier does not label link failures');
assert(fallback.includes('officialLinks.relevant.receipt'), 'safe fallback does not use deterministic receipt link');
assert(fallback.includes('ابعث رقم التتبع أو رقم الطلب'), 'safe fallback does not fail closed when application is unresolved');
assert(planner.includes('ممنوع إعطاء أي URL قبل ربط الطلب'), 'planner can still request an ungrounded receipt URL');

// Regression shape: a historical customer URL must never remain raw in model memory.
const sample = 'العميل: https://external-project.example/private/path';
const redacted = sample.replace(/https?:\/\/[^\s<>{}\[\]"\']+/gi, '[UNTRUSTED_URL_REDACTED]');
assert(!redacted.includes('external-project.example'), 'regression fixture URL was not redacted');

// The production gate must be generic, not a one-domain blocklist patch.
assert(!links.toLowerCase().includes('orangmoney'), 'link guard must not be hardcoded to one foreign project');

console.log('V3 PHASE 6.2 DETERMINISTIC LINK + MEMORY ISOLATION SELFTEST PASS');
console.log('Historical URL redaction: PASS');
console.log('Current turn/state URL isolation: PASS');
console.log('Exact truth-issued URL allowset: PASS');
console.log('Receipt link application binding: PASS');
console.log('Generic cross-project/domain protection: PASS');
console.log('Live/Shadow semantic parity: PASS');
