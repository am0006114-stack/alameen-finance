export const FILE_OPENING_PAYMENT_DESTINATION_VERSION = "2026-09-07-emergency-wallet-update";
export const FILE_OPENING_PAYMENT_WALLET_TYPE = "Orange Money";
export const FILE_OPENING_PAYMENT_ALIASES = ["PAYAMEEEN", "AMEEN1ST", "AM500337"] as const;
export const FILE_OPENING_PAYMENT_PHONE = "0788500337";
export const FILE_OPENING_PAYMENT_BENEFICIARY = "ABDUL RAHMAN ALHARAHSHEH";
export const LEGACY_FILE_OPENING_PAYMENT_ALIASES = ["AMEEENPAY", "AMENPAY", "PAYAMEN", "PAYAMEEN", "AMEENPAY"] as const;

export function fileOpeningPaymentWriterTruth() {
  return {
    version: FILE_OPENING_PAYMENT_DESTINATION_VERSION,
    walletType: FILE_OPENING_PAYMENT_WALLET_TYPE,
    aliases: [...FILE_OPENING_PAYMENT_ALIASES],
    phone: FILE_OPENING_PAYMENT_PHONE,
    beneficiaryName: FILE_OPENING_PAYMENT_BENEFICIARY,
    legacyAliases: [...LEGACY_FILE_OPENING_PAYMENT_ALIASES],
  };
}

export function currentFileOpeningPaymentRule(options?: { includeApology?: boolean }) {
  const apology = options?.includeApology === false
    ? ""
    : "نعتذر عن أي لخبطة؛ صار تحديث طارئ ببيانات محفظة الدفع. ";
  return `${apology}الجهة المستلمة محفظة ${FILE_OPENING_PAYMENT_WALLET_TYPE}. التحويل عبر CliQ يكون إلى ${FILE_OPENING_PAYMENT_ALIASES.join(" أو ")}، أو باستخدام الرقم ${FILE_OPENING_PAYMENT_PHONE}. ويجب مراجعة اسم المستفيد ${FILE_OPENING_PAYMENT_BENEFICIARY} قبل تأكيد الحوالة.`;
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

export function allFileOpeningPaymentExecutionTokens() {
  return [
    ...FILE_OPENING_PAYMENT_ALIASES,
    FILE_OPENING_PAYMENT_PHONE,
    ...LEGACY_FILE_OPENING_PAYMENT_ALIASES,
  ];
}
