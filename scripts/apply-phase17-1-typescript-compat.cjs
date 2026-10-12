const fs = require('fs');

const typesPath = 'app/api/whatsapp/webhook/_lib/v3-os/types.ts';
const testPath = 'scripts/v3-phase17-1-true-single-writer-semantic-coverage-selftest.cjs';

function patch(path, from, to, label) {
  let text = fs.readFileSync(path, 'utf8');
  if (text.includes(to)) {
    console.log(`SKIP ${label}: already applied`);
    return;
  }
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, got ${count}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, text, 'utf8');
  console.log(`APPLIED ${label}`);
}

// Backward-compatible type migration: the Native Kernel always emits paymentIntent,
// while isolated legacy/rollback semantic constructors may omit it. Live Phase 17.1
// runtime treats omission as "none". This avoids modifying disabled legacy writers.
patch(
  typesPath,
  '  paymentIntent: "execute_now" | "access_problem" | "method_question" | "status_or_proof" | "none";',
  '  paymentIntent?: "execute_now" | "access_problem" | "method_question" | "status_or_proof" | "none";',
  'SemanticTurnFrame.paymentIntent optional compatibility',
);

patch(
  testPath,
  `ok(types.includes('paymentIntent: "execute_now" | "access_problem" | "method_question" | "status_or_proof" | "none"'), 'semantic frame has explicit payment intent');`,
  `ok(types.includes('paymentIntent?: "execute_now" | "access_problem" | "method_question" | "status_or_proof" | "none"'), 'semantic frame exposes backward-compatible explicit payment intent');`,
  'Phase 17.1 selftest optional compatibility assertion',
);

console.log('PHASE 17.1 TYPESCRIPT COMPAT APPLIED');
