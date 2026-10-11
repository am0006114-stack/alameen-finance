const fs = require('fs');

const path = 'app/api/whatsapp/webhook/route.ts';
let src = fs.readFileSync(path, 'utf8');

const start = src.indexOf('async function sendWhatsAppTypingIndicator');
const end = src.indexOf('type WhatsAppSendAttempt', start);
if (start < 0 || end < 0) throw new Error('typing indicator function boundaries not found');

const before = src.slice(0, start);
let fn = src.slice(start, end);
const after = src.slice(end);

const oldLine = '  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";';
if (!fn.includes(oldLine)) throw new Error('legacy typing Graph API fallback not found');
if (fn.indexOf(oldLine) !== fn.lastIndexOf(oldLine)) throw new Error('legacy typing Graph API fallback is not unique inside function');

const replacement = `  // Typing indicators were added after the old v20 integration baseline.\n  // v20 is retired; keep this UX call on a currently supported API even if an\n  // old shared GRAPH_API_VERSION value is still present in the environment.\n  const configuredTypingGraphVersion = String(\n    process.env.WHATSAPP_TYPING_GRAPH_API_VERSION || process.env.GRAPH_API_VERSION || \"\"\n  ).trim();\n  const normalizedTypingGraphVersion = configuredTypingGraphVersion\n    ? (configuredTypingGraphVersion.startsWith(\"v\") ? configuredTypingGraphVersion : \`v\${configuredTypingGraphVersion}\`)\n    : \"\";\n  const configuredTypingGraphMajor = Number.parseInt(\n    normalizedTypingGraphVersion.replace(/^v/i, \"\").split(\".\")[0] || \"\",\n    10\n  );\n  const graphVersion = Number.isFinite(configuredTypingGraphMajor) && configuredTypingGraphMajor >= 25\n    ? normalizedTypingGraphVersion\n    : \"v25.0\";`;

fn = fn.replace(oldLine, replacement);
src = before + fn + after;
fs.writeFileSync(path, src, 'utf8');
console.log('PHASE 14.1 WHATSAPP TYPING API RESTORATION APPLIED');
