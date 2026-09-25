export const FILE_OPENING_PAYMENT_DESTINATION_VERSION = "2026-09-16-payment-conversion-integrity";
export const FILE_OPENING_PAYMENT_PRESENTATION_VERSION = "2026-09-25-channel-classification-integrity";
export const FILE_OPENING_PAYMENT_WALLET_TYPE = "Orange Money";
export const FILE_OPENING_PAYMENT_ALIASES = ["PAYAMEEEN", "AMEEN1ST", "AM500337"] as const;
export const FILE_OPENING_PAYMENT_PHONE = "0788500337";
export const FILE_OPENING_PAYMENT_BENEFICIARY = "ABDUL RAHMAN ALHARAHSHEH";
export const LEGACY_FILE_OPENING_PAYMENT_ALIASES = ["AMEEENPAY", "AMENPAY", "PAYAMEN", "PAYAMEEN", "AMEENPAY"] as const;

export function fileOpeningPaymentWriterTruth() {
  return {
    version: FILE_OPENING_PAYMENT_DESTINATION_VERSION,
    presentationVersion: FILE_OPENING_PAYMENT_PRESENTATION_VERSION,
    channels: {
      orangeMoney: {
        label: "Orange Money",
        phone: FILE_OPENING_PAYMENT_PHONE,
      },
      cliq: {
        label: "CliQ",
        aliases: [...FILE_OPENING_PAYMENT_ALIASES],
      },
    },
    beneficiaryName: FILE_OPENING_PAYMENT_BENEFICIARY,
    // Backward-compatible fields for older internal readers. Customer-facing
    // writers must use channels above so CliQ aliases are never mislabeled as
    // Orange Money aliases.
    walletType: FILE_OPENING_PAYMENT_WALLET_TYPE,
    aliases: [...FILE_OPENING_PAYMENT_ALIASES],
    phone: FILE_OPENING_PAYMENT_PHONE,
    legacyAliases: [...LEGACY_FILE_OPENING_PAYMENT_ALIASES],
  };
}

export function currentFileOpeningPaymentRule(options?: { includeApology?: boolean }) {
  const apology = options?.includeApology === true
    ? "إذا وصلتك بيانات دفع قديمة قبل التحديث، تجاهلها واعتمد البيانات الحالية فقط. "
    : "";
  return `${apology}هاي كل خيارات الدفع المعتمدة لرسوم فتح الملف:\nOrange Money:\n- الرقم: ${FILE_OPENING_PAYMENT_PHONE}\n\nCliQ:\n- ${FILE_OPENING_PAYMENT_ALIASES.join("\n- ")}\n\nاسم المستفيد: ${FILE_OPENING_PAYMENT_BENEFICIARY}\nقبل تأكيد الحوالة تأكد إن اسم المستفيد ظاهر بنفس الاسم.`;
}

export function containsLegacyFileOpeningPaymentDestination(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  return LEGACY_FILE_OPENING_PAYMENT_ALIASES.some((alias) => text.includes(alias.toUpperCase()));
}

export function containsCurrentFileOpeningPaymentDestination(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  return FILE_OPENING_PAYMENT_ALIASES.some((alias) => text.includes(alias.toUpperCase()))
    || text.includes(FILE_OPENING_PAYMENT_PHONE);
}

export function paymentDestinationPresentationViolations(value: string | null | undefined) {
  const text = String(value || "");
  const upper = text.toUpperCase();
  const phonePresent = text.includes(FILE_OPENING_PAYMENT_PHONE);
  const aliasesPresent = FILE_OPENING_PAYMENT_ALIASES.filter((alias) => upper.includes(alias.toUpperCase()));
  if (!phonePresent && aliasesPresent.length === 0) return [] as string[];

  const violations: string[] = [];
  if (phonePresent && !/Orange\s*Money[\s\S]{0,180}0788500337/i.test(text)) violations.push("orange_money_phone_not_labeled");
  if (aliasesPresent.length > 0 && !/CliQ[\s\S]{0,300}(?:PAYAMEEEN|AMEEN1ST|AM500337)/i.test(text)) violations.push("cliq_aliases_not_labeled");
  const fullDestinationBlock = phonePresent && aliasesPresent.length === FILE_OPENING_PAYMENT_ALIASES.length;
  if (fullDestinationBlock && !upper.includes(FILE_OPENING_PAYMENT_BENEFICIARY.toUpperCase())) violations.push("beneficiary_missing");
  return violations;
}

export function containsAllCurrentFileOpeningPaymentDestinations(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  return FILE_OPENING_PAYMENT_ALIASES.every((alias) => text.includes(alias.toUpperCase()))
    && text.includes(FILE_OPENING_PAYMENT_PHONE)
    && text.includes(FILE_OPENING_PAYMENT_BENEFICIARY.toUpperCase())
    && text.includes(FILE_OPENING_PAYMENT_WALLET_TYPE.toUpperCase())
    && text.includes("CLIQ")
    && paymentDestinationPresentationViolations(value).length === 0;
}

export function allFileOpeningPaymentExecutionTokens() {
  return [
    ...FILE_OPENING_PAYMENT_ALIASES,
    FILE_OPENING_PAYMENT_PHONE,
    ...LEGACY_FILE_OPENING_PAYMENT_ALIASES,
  ];
}
