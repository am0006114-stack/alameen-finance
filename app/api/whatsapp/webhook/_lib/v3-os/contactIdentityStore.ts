import { emptyState } from "./state";
import { loadV3ConversationState, saveV3ConversationState } from "./stateStore";
import { canonicalWaId, makeVerifiedContactBinding, verifiedPrimaryWaId } from "./contactIdentity";

export type ContactAliasPersistResult = {
  ok: boolean;
  conflict: boolean;
  aliasWaId: string | null;
  primaryWaId: string | null;
  reason: string;
};

export async function persistVerifiedAlternateContact(input: { primaryWaId: string; aliasWaId: string }): Promise<ContactAliasPersistResult> {
  const primary = canonicalWaId(input.primaryWaId);
  const alias = canonicalWaId(input.aliasWaId);
  if (!primary || !alias || primary === alias) return { ok: false, conflict: false, aliasWaId: alias || null, primaryWaId: primary || null, reason: "invalid_or_same_contact" };

  const existing = await loadV3ConversationState(alias);
  const existingPrimary = existing ? verifiedPrimaryWaId(existing, alias) : null;
  if (existingPrimary && existingPrimary !== primary) {
    return { ok: false, conflict: true, aliasWaId: alias, primaryWaId: existingPrimary, reason: "alias_already_verified_for_different_primary" };
  }

  const base = existing || emptyState(alias);
  await saveV3ConversationState({
    ...base,
    waId: alias,
    verifiedContactBinding: makeVerifiedContactBinding({ aliasWaId: alias, primaryWaId: primary }),
    contactResolution: {
      status: "verified_alias",
      trackingId: base.contactResolution?.trackingId || null,
      explanation: "alternate_number",
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, conflict: false, aliasWaId: alias, primaryWaId: primary, reason: existingPrimary ? "alias_already_verified_same_primary" : "alias_verified_from_registered_sender" };
}
