from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# Prefer the semantic state's own turn timestamp over completion timing. This prevents
# an older retry that completes late from outranking a newer delivered conversation.
path = Path('app/api/whatsapp/webhook/_lib/v3-os/conversationContinuityAuthority.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '''  const deliveredAt = time(input.deliveredAt) || time(delivered.updatedAt);\n  const persistedAt = time(persisted.updatedAt);\n  return deliveredAt >= persistedAt ? delivered : persisted;\n''',
    '''  const deliveredStateAt = time(delivered.updatedAt) || time(input.deliveredAt);\n  const persistedAt = time(persisted.updatedAt);\n  return deliveredStateAt >= persistedAt ? delivered : persisted;\n''',
    'monotonic delivered-state timestamp',
)
text = replace_once(
    text,
    '''  const socialOnly = /^(?:تمام|اوك|اوكي|شكرا|يسلمو|العفو|اه|نعم|ايوه|موافق|اكيد)$/.test(current);\n''',
    '''  const socialOnly = /^(?:تمام|اوك|اوكي|شكرا|يسلمو|العفو)$/.test(current);\n''',
    'generic yes-no contextual ownership',
)
path.write_text(text, encoding='utf-8')

# Read several completed journal rows and choose the newest semantic state by its own
# state.updatedAt. Also recover from the journal even if the projection read itself fails.
path = Path('app/api/whatsapp/webhook/_lib/v3-os/stateStore.ts')
text = path.read_text(encoding='utf-8')
old = '''      .order("completed_at", { ascending: false })\n      .limit(1)\n      .maybeSingle();\n    if (error) {\n      console.error("v3_delivered_state_recovery_read_failed", { waId, error: error.message });\n      return null;\n    }\n    const state = hydrateConversationState(data?.state_after_json as ConversationState | null | undefined);\n    if (!state) return null;\n    return {\n      state,\n      deliveredAt: String(data?.completed_at || data?.delivered_at || data?.updated_at || state.updatedAt || ""),\n    };\n'''
new = '''      .order("completed_at", { ascending: false })\n      .limit(8);\n    if (error) {\n      console.error("v3_delivered_state_recovery_read_failed", { waId, error: error.message });\n      return null;\n    }\n    const candidates = (Array.isArray(data) ? data : [])\n      .map((row) => {\n        const state = hydrateConversationState(row?.state_after_json as ConversationState | null | undefined);\n        return state ? {\n          state,\n          deliveredAt: String(row?.completed_at || row?.delivered_at || row?.updated_at || state.updatedAt || ""),\n        } : null;\n      })\n      .filter((item): item is { state: ConversationState; deliveredAt: string } => Boolean(item))\n      .sort((a, b) => Date.parse(b.state.updatedAt || "") - Date.parse(a.state.updatedAt || ""));\n    return candidates[0] || null;\n'''
text = replace_once(text, old, new, 'journal latest semantic state selection')
old = '''      if (error) { lastError = error.message; continue; }\n\n      const persisted = hydrateConversationState(data?.state as ConversationState | null | undefined);\n      const delivered = await loadLatestCompletedDeliveredState(clean);\n      return reconcileDeliveredConversationState({\n'''
new = '''      const delivered = await loadLatestCompletedDeliveredState(clean);\n      if (error) {\n        lastError = error.message;\n        if (delivered?.state) return delivered.state;\n        continue;\n      }\n\n      const persisted = hydrateConversationState(data?.state as ConversationState | null | undefined);\n      return reconcileDeliveredConversationState({\n'''
text = replace_once(text, old, new, 'journal fallback on projection failure')
path.write_text(text, encoding='utf-8')

# Make delivery-context publication truly first after durable transport evidence: do
# not wait for the outgoing analytics/log row before completing the Human OS journal.
path = Path('app/api/whatsapp/webhook/route.ts')
text = path.read_text(encoding='utf-8')
log_start = text.find('              await logMessage({\n', text.find('const markerRecorded = await markOutgoingReplyLockDelivered'))
durable_start = text.find('              const durableAfterSend = await durableOutgoingDeliveryForIncoming({\n', log_start)
phase15_start = text.find('              // Phase 15 atomic conversation continuity:', durable_start)
log_ai_start = text.find('              await logAiConversation({\n', phase15_start)
if min(log_start, durable_start, phase15_start, log_ai_start) < 0:
    raise SystemExit('route atomic reorder markers not found')
log_block = text[log_start:durable_start]
durable_and_commit = text[durable_start:log_ai_start]
text = text[:log_start] + durable_and_commit + log_block + text[log_ai_start:]
path.write_text(text, encoding='utf-8')

# Strengthen the regression contract around the exact race that caused the live bug.
path = Path('scripts/v3-phase15-model-native-atomic-conversation-selftest.cjs')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '''const logAiIndex = route.indexOf('await logAiConversation({', completeIndex);\nassert(logAiIndex < 0 || completeIndex < logAiIndex, 'delivered journal must commit before analytics logging');\n''',
    '''const outgoingLogIndex = route.indexOf('await logMessage({', completeIndex);\nassert(outgoingLogIndex < 0 || completeIndex < outgoingLogIndex, 'delivered journal must commit before outgoing message analytics/log persistence');\nconst logAiIndex = route.indexOf('await logAiConversation({', completeIndex);\nassert(logAiIndex < 0 || completeIndex < logAiIndex, 'delivered journal must commit before AI analytics logging');\n''',
    'selftest transport ordering',
)
text = replace_once(
    text,
    '''assert(stateStore.includes('reconcileDeliveredConversationState'), 'state store does not reconcile durable delivered state');\n''',
    '''assert(stateStore.includes('reconcileDeliveredConversationState'), 'state store does not reconcile durable delivered state');\nassert(stateStore.includes('.limit(8)'), 'state store does not inspect multiple completed turns for out-of-order completion safety');\nassert(stateStore.includes('if (delivered?.state) return delivered.state'), 'journal is not a fallback when the projection read fails');\nassert(continuity.includes('time(delivered.updatedAt) || time(input.deliveredAt)'), 'reconciliation can still prefer late completion time over newer semantic state time');\n''',
    'selftest journal authority',
)
path.write_text(text, encoding='utf-8')

print('PHASE 15 ATOMIC CONTINUITY REFINEMENT APPLIED')
