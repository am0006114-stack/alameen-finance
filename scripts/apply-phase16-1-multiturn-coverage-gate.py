from pathlib import Path

arb = Path('app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts')
ans = Path('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts')

s = arb.read_text(encoding='utf-8')
old = '  "current_human_turn",\n  "answer_bundle",\n  "human_semantic_care",'
new = '  "current_human_turn",\n  "human_semantic_care",'
if old not in s:
    raise SystemExit('responseArbiter soft answer_bundle signature not found')
s = s.replace(old, new, 1)
arb.write_text(s, encoding='utf-8')

s = ans.read_text(encoding='utf-8')
old = '''  const parts: string[] = [];
  const empathy = empathyPrefix(input.turn); if (empathy && input.bundle.kind === "multi_question") parts.push(empathy);
  if (f.continuationDecision) parts.push(continuationPart(input.turn, input.state, input.truth));'''
new = '''  const parts: string[] = [];
  const empathy = empathyPrefix(input.turn); if (empathy && input.bundle.kind === "multi_question") parts.push(empathy);
  // Phase 16.1: identify the current staff persona first on mixed identity turns,
  // then answer every material sibling obligation in the same reply.
  if (f.staffIdentity) parts.push(staffIdentityPart(input.turn, input.state));
  if (f.continuationDecision) parts.push(continuationPart(input.turn, input.state, input.truth));'''
if old not in s:
    raise SystemExit('answerObligations parts signature not found')
s = s.replace(old, new, 1)
old2 = '  if (f.applicationStart) parts.push(applicationStartPart(input.turn, input.truth));\n  if (f.staffIdentity) parts.push(staffIdentityPart(input.turn, input.state));\n  return Array.from(new Set(parts.filter(Boolean))).join("\\n\\n") || null;'
new2 = '  if (f.applicationStart) parts.push(applicationStartPart(input.turn, input.truth));\n  return Array.from(new Set(parts.filter(Boolean))).join("\\n\\n") || null;'
if old2 not in s:
    raise SystemExit('answerObligations trailing staff identity signature not found')
s = s.replace(old2, new2, 1)
ans.write_text(s, encoding='utf-8')

print('PHASE 16.1 MULTITURN COVERAGE PATCH APPLIED')
