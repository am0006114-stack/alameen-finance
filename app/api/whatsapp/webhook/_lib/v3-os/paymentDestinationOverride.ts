export const FILE_OPENING_PAYMENT_DESTINATION_VERSION = "2026-09-16-payment-conversion-integrity";
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
  const apology = options?.includeApology === true
    ? "إذا وصلتك بيانات دفع قديمة قبل التحديث، تجاهلها واعتمد البيانات الحالية فقط. "
    : "";
  return `${apology}هاي كل خيارات الدفع المعتمدة لرسوم فتح الملف:\n- Orange Money على الرقم ${FILE_OPENING_PAYMENT_PHONE}\n- CliQ على أي واحد من المعرفات: ${FILE_OPENING_PAYMENT_ALIASES.join(" أو ")}\nاسم المستفيد: ${FILE_OPENING_PAYMENT_BENEFICIARY}\nقبل تأكيد الحوالة تأكد إن اسم المستفيد ظاهر بنفس الاسم.`;
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

export function containsAllCurrentFileOpeningPaymentDestinations(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  return FILE_OPENING_PAYMENT_ALIASES.every((alias) => text.includes(alias.toUpperCase()))
    && text.includes(FILE_OPENING_PAYMENT_PHONE)
    && text.includes(FILE_OPENING_PAYMENT_BENEFICIARY.toUpperCase())
    && text.includes(FILE_OPENING_PAYMENT_WALLET_TYPE.toUpperCase());
}

export function allFileOpeningPaymentExecutionTokens() {
  return [
    ...FILE_OPENING_PAYMENT_ALIASES,
    FILE_OPENING_PAYMENT_PHONE,
    ...LEGACY_FILE_OPENING_PAYMENT_ALIASES,
  ];
}
