export const AMMAN_TIME_ZONE = "Asia/Amman";

export const OPERATIONAL_CALENDAR_RULE =
  "أيام الدراسة والتشغيل والمواعيد والتسليم هي الأحد إلى الخميس. الجمعة والسبت عطلة تشغيلية: لا تُحتسبان ضمن أيام الدراسة، ولا تُنفذ فيهما دراسة أو مراجعة أو تسليم، ولا يُعطى فيهما موعد حضور أو استلام. الموقع وواتساب يستمران باستقبال الطلبات والرسائل خلال العطلة.";

export const IPHONE18_DELIVERY_CALENDAR_RULE =
  "جميع أجهزة iPhone 18 باختلاف أنواعها يكون استحقاق التسليم بعد شهر كامل من تاريخ الموافقة النهائية الموثقة، وليس من تاريخ التقديم أو الدفع. إذا وافق تاريخ الاستحقاق يوم الجمعة أو السبت ينتقل لأول يوم تشغيل تالٍ. قبل الموافقة النهائية لا يبدأ عداد شهر التسليم ولا يُعطى موعد استلام.";

function jordanParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMMAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function dateFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function daySerial(value: Date) {
  const p = jordanParts(value);
  return Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
}

export function jordanDateKey(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return null;
  const { year, month, day } = jordanParts(date);
  if (!year || !month || !day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isOperationalDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const { year, month, day } = jordanParts(date);
  const weekday = dateFromParts(year, month, day).getUTCDay();
  return weekday !== 5 && weekday !== 6;
}

export function moveToNextOperationalDate(value: Date | string) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const p = jordanParts(date);
  let cursor = dateFromParts(p.year, p.month, p.day);
  for (let i = 0; i < 3; i += 1) {
    if (isOperationalDate(cursor)) return cursor;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return cursor;
}

export function addOneCalendarMonthOperational(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return null;
  const p = jordanParts(date);
  const rawTargetMonth = p.month + 1;
  const targetYear = p.year + Math.floor((rawTargetMonth - 1) / 12);
  const targetMonth = ((rawTargetMonth - 1) % 12) + 1;
  const targetDay = Math.min(p.day, daysInMonth(targetYear, targetMonth));
  return moveToNextOperationalDate(dateFromParts(targetYear, targetMonth, targetDay));
}

export function countOperationalDaysElapsed(start: Date | string | null | undefined, end: Date | string = new Date()) {
  const startDate = start instanceof Date ? start : new Date(String(start || ""));
  const endDate = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return null;
  const sp = jordanParts(startDate);
  const ep = jordanParts(endDate);
  let cursor = dateFromParts(sp.year, sp.month, sp.day);
  const endCursor = dateFromParts(ep.year, ep.month, ep.day);
  let count = 0;
  cursor = new Date(cursor.getTime() + 86_400_000);
  while (cursor <= endCursor) {
    if (isOperationalDate(cursor)) count += 1;
    cursor = new Date(cursor.getTime() + 86_400_000);
    if (count > 5000) break;
  }
  return count;
}

export function isIphone18Device(value: string | null | undefined) {
  return /(?:iphone|ايفون|آيفون)\s*18\b/i.test(String(value || ""));
}

export function formatOperationalDate(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO", {
    timeZone: AMMAN_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type Iphone18DeliveryCalendarState =
  | "not_iphone18"
  | "awaiting_final_approval"
  | "approval_date_missing"
  | "within_delivery_window"
  | "delivery_due";

export function iphone18DeliveryCalendar(input: {
  deviceName?: string | null;
  paymentConfirmed?: boolean;
  status?: string | null;
  finalApprovalAt?: string | null;
  now?: Date;
}) {
  if (!isIphone18Device(input.deviceName)) return { state: "not_iphone18" as const, dueDate: null, daysRemaining: null };
  if (!input.paymentConfirmed || String(input.status || "").toLowerCase() !== "approved") {
    return { state: "awaiting_final_approval" as const, dueDate: null, daysRemaining: null };
  }
  if (!input.finalApprovalAt) return { state: "approval_date_missing" as const, dueDate: null, daysRemaining: null };
  const dueDate = addOneCalendarMonthOperational(input.finalApprovalAt);
  if (!dueDate) return { state: "approval_date_missing" as const, dueDate: null, daysRemaining: null };
  const now = input.now || new Date();
  const nowKey = jordanDateKey(now);
  const dueKey = jordanDateKey(dueDate);
  if (!nowKey || !dueKey) return { state: "approval_date_missing" as const, dueDate: null, daysRemaining: null };
  const daysRemaining = Math.ceil((daySerial(dueDate) - daySerial(now)) / 86_400_000);
  return nowKey >= dueKey
    ? { state: "delivery_due" as const, dueDate, daysRemaining: Math.max(0, daysRemaining) }
    : { state: "within_delivery_window" as const, dueDate, daysRemaining: Math.max(0, daysRemaining) };
}
