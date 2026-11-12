export const FILE_OPENING_PAYMENT_DESTINATION_VERSION = "2026-09-16-payment-conversion-integrity";
export const FILE_OPENING_PAYMENT_PRESENTATION_VERSION = "2026-11-12-ameen2nd-independent-cliq-beneficiary";
export const FILE_OPENING_PAYMENT_WALLET_TYPE = "Orange Money";
export const FILE_OPENING_PAYMENT_ALIASES = ["PAYAMEEEN", "AMEEN1ST", "AM500337"] as const;
export const FILE_OPENING_PAYMENT_PHONE = "0788500337";
export const FILE_OPENING_PAYMENT_BENEFICIARY = "ABDUL RAHMAN ALHARAHSHEH";
export const FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS = "AMEEN2ND";
export const FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BENEFICIARY = "مصطفى مخلد مطلق";
export const FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BANK = "البنك العربي";

export function fileOpeningPaymentBeneficiaryGuidance() {
  return `Orange Money (${FILE_OPENING_PAYMENT_PHONE}) ومعرفات CliQ (${FILE_OPENING_PAYMENT_ALIASES.join(" / ")}): ${FILE_OPENING_PAYMENT_BENEFICIARY}. أما CliQ (${FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS}) لدى ${FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BANK} فالمستفيد: ${FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BENEFICIARY}`;
}
export const LEGACY_FILE_OPENING_PAYMENT_ALIASES = ["AMEEENPAY", "AMENPAY", "PAYAMEN", "PAYAMEEN", "AMEENPAY"] as const;

export function fileOpeningPaymentWriterTruth() {
  return {
    version: FILE_OPENING_PAYMENT_DESTINATION_VERSION,
    presentationVersion: FILE_OPENING_PAYMENT_PRESENTATION_VERSION,
    channels: {
      orangeMoney: {
        label: "Orange Money",
        phone: FILE_OPENING_PAYMENT_PHONE,
        beneficiaryName: FILE_OPENING_PAYMENT_BENEFICIARY,
      },
      cliq: {
        label: "CliQ",
        aliases: [...FILE_OPENING_PAYMENT_ALIASES, FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS],
        accounts: [
          { aliases: [...FILE_OPENING_PAYMENT_ALIASES], beneficiaryName: FILE_OPENING_PAYMENT_BENEFICIARY },
          {
            aliases: [FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS],
            beneficiaryName: FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BENEFICIARY,
            bankName: FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BANK,
          },
        ],
      },
    },
    beneficiaryName: FILE_OPENING_PAYMENT_BENEFICIARY,
    // Backward-compatible fields for older internal readers. Customer-facing
    // writers must use channels above so CliQ aliases are never mislabeled as
    // Orange Money aliases.
    walletType: FILE_OPENING_PAYMENT_WALLET_TYPE,
    aliases: [...FILE_OPENING_PAYMENT_ALIASES, FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS],
    phone: FILE_OPENING_PAYMENT_PHONE,
    legacyAliases: [...LEGACY_FILE_OPENING_PAYMENT_ALIASES],
  };
}

export function currentFileOpeningPaymentRule(options?: { includeApology?: boolean }) {
  const apology = options?.includeApology === true
    ? "إذا وصلتك بيانات دفع قديمة قبل التحديث، تجاهلها واعتمد البيانات الحالية فقط. "
    : "";
  return `${apology}هاي كل خيارات الدفع المعتمدة لرسوم فتح الملف:\nOrange Money:\n- الرقم: ${FILE_OPENING_PAYMENT_PHONE}\n- اسم المستفيد: ${FILE_OPENING_PAYMENT_BENEFICIARY}\n\nCliQ (المعرفات الحالية):\n- ${FILE_OPENING_PAYMENT_ALIASES.join("\n- ")}\n- اسم المستفيد: ${FILE_OPENING_PAYMENT_BENEFICIARY}\n\nCliQ (${FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BANK}):\n- ${FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS}\n- اسم المستفيد: ${FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BENEFICIARY}\nقبل تأكيد الحوالة تأكد من تطابق اسم المستفيد مع معرف CliQ أو المحفظة اللي اخترتها. إذا ظهر اسم مختلف لا تحول.`;
}

export function containsLegacyFileOpeningPaymentDestination(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  return LEGACY_FILE_OPENING_PAYMENT_ALIASES.some((alias) => text.includes(alias.toUpperCase()));
}

export function containsCurrentFileOpeningPaymentDestination(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  return FILE_OPENING_PAYMENT_ALIASES.some((alias) => text.includes(alias.toUpperCase()))
    || text.includes(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS)
    || text.includes(FILE_OPENING_PAYMENT_PHONE);
}

export function paymentDestinationPresentationViolations(value: string | null | undefined) {
  const text = String(value || "");
  const upper = text.toUpperCase();
  const phonePresent = text.includes(FILE_OPENING_PAYMENT_PHONE);
  const primaryPresent = FILE_OPENING_PAYMENT_ALIASES.filter((alias) => upper.includes(alias));
  const secondaryIndex = upper.indexOf(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS);
  if (!phonePresent && primaryPresent.length === 0 && secondaryIndex < 0) return [] as string[];

  const violations: string[] = [];
  if (phonePresent && !/Orange\s*Money[\s\S]{0,180}0788500337/i.test(text)) violations.push("orange_money_phone_not_labeled");
  if (primaryPresent.length > 0 && !/CliQ[\s\S]{0,300}(?:PAYAMEEEN|AMEEN1ST|AM500337)/i.test(text)) violations.push("cliq_aliases_not_labeled");
  if (primaryPresent.length === FILE_OPENING_PAYMENT_ALIASES.length) {
    const lastPrimaryIndex = Math.max(...FILE_OPENING_PAYMENT_ALIASES.map((alias) => upper.indexOf(alias)));
    const oldAccountBlockEnd = secondaryIndex > lastPrimaryIndex ? secondaryIndex : lastPrimaryIndex + 160;
    const afterOldAliases = text.slice(lastPrimaryIndex, Math.min(oldAccountBlockEnd, lastPrimaryIndex + 180));
    if (!afterOldAliases.toUpperCase().includes(FILE_OPENING_PAYMENT_BENEFICIARY)) {
      violations.push("primary_cliq_beneficiary_missing_or_wrong");
    }
  }
  if (secondaryIndex >= 0) {
    const before = text.slice(Math.max(0, secondaryIndex - 130), secondaryIndex);
    const after = text.slice(secondaryIndex, secondaryIndex + 175);
    if (!/CliQ/i.test(before)) violations.push("secondary_cliq_not_labeled");
    if (!before.includes(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BANK) && !after.includes(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BANK)) {
      violations.push("secondary_cliq_bank_missing");
    }
    const intendedNameAt = after.indexOf(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BENEFICIARY);
    if (intendedNameAt < 0) violations.push("secondary_cliq_beneficiary_missing_or_wrong");
    const otherNameAt = after.toUpperCase().indexOf(FILE_OPENING_PAYMENT_BENEFICIARY);
    if (otherNameAt >= 0 && (intendedNameAt < 0 || otherNameAt < intendedNameAt)) {
      violations.push("secondary_cliq_cross_beneficiary");
    }
  }
  const fullDestinationBlock = phonePresent && primaryPresent.length === FILE_OPENING_PAYMENT_ALIASES.length && secondaryIndex >= 0;
  if (fullDestinationBlock && !upper.includes(FILE_OPENING_PAYMENT_BENEFICIARY)) violations.push("primary_beneficiary_missing");
  return violations;
}

export function containsAllCurrentFileOpeningPaymentDestinations(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  return FILE_OPENING_PAYMENT_ALIASES.every((alias) => text.includes(alias))
    && text.includes(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS)
    && text.includes(FILE_OPENING_PAYMENT_PHONE)
    && text.includes(FILE_OPENING_PAYMENT_BENEFICIARY.toUpperCase())
    && text.includes(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BENEFICIARY.toUpperCase())
    && text.includes(FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BANK.toUpperCase())
    && text.includes(FILE_OPENING_PAYMENT_WALLET_TYPE.toUpperCase())
    && text.includes("CLIQ")
    && paymentDestinationPresentationViolations(value).length === 0;
}

export function allFileOpeningPaymentExecutionTokens() {
  return [
    ...FILE_OPENING_PAYMENT_ALIASES,
    FILE_OPENING_PAYMENT_SECONDARY_CLIQ_ALIAS,
    FILE_OPENING_PAYMENT_SECONDARY_CLIQ_BENEFICIARY,
    FILE_OPENING_PAYMENT_PHONE,
    ...LEGACY_FILE_OPENING_PAYMENT_ALIASES,
  ];
}
