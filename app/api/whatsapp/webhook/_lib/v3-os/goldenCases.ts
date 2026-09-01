export type GoldenCase = { id: string; message: string; requiredTopics: string[]; requiredRole?: string; forbiddenRole?: string; requiredAction?: string; note: string };

export const V3_GOLDEN_CASES: GoldenCase[] = [
  { id:"multi-topic-1", message:"كم الدفعة الاولى ووين موقعكم؟", requiredTopics:["first_installment","office_location"], note:"must answer both topics" },
  { id:"cancel-1", message:"الغاء الطلب", requiredTopics:["cancellation"], requiredAction:"cancel_application", requiredRole:"omran", note:"direct cancellation is an autonomous Omran transaction; never invert into continue/payment" },
  { id:"cancel-question", message:"بقدر الغي الطلب؟", requiredTopics:["cancellation"], note:"question is not a mutation" },
  { id:"refund-1", message:"بدي الاسترداد تبعي", requiredTopics:["refund"], requiredAction:"request_refund", requiredRole:"omran", note:"Omran owns refund; payment must be confirmed in truth" },
  { id:"stop-refund", message:"تراجعت عن الاسترداد وبدي اكمل", requiredTopics:["refund"], requiredAction:"stop_refund", requiredRole:"omran", note:"Omran stops active refund and reopens only if truth allows" },
  { id:"reopen-1", message:"تراجعت عن الإلغاء بدي ارجع اكمل", requiredTopics:["reopen"], requiredAction:"reopen_application", requiredRole:"omran", note:"reopen is autonomous Omran operation" },
  { id:"device-change-1", message:"غير الجهاز لايفون 16 برو 256", requiredTopics:["device_change","device_recalculation"], requiredAction:"change_device", requiredRole:"omran", note:"catalog match + official installment calculator required" },
  { id:"data-change-1", message:"الراتب غلط عدله إلى 650", requiredTopics:["application_correction"], requiredAction:"change_application_data", requiredRole:"omran", note:"only high-confidence supported scalar correction may mutate" },
  { id:"payment-claim", message:"دفعت وبعت الوصل", requiredTopics:["payment_confirmation"], note:"customer claim never auto-confirms payment; admin remains authority" },
  { id:"repair-1", message:"ما فهمت وضحلي", requiredTopics:["repair"], note:"repair request is a real conversational act" },
  { id:"human-1", message:"بدي موظف احكي معه", requiredTopics:["human_request"], forbiddenRole:"human", note:"AI remains the employee; no human queue/pause" },
  { id:"manager-1", message:"بدي المدير احكي معه", requiredTopics:["manager_request"], requiredRole:"omran", note:"manager means Omran AI supervisor" },
  { id:"legal-1", message:"رح اوكل محامي واعمل شكوى", requiredTopics:["legal"], requiredRole:"omran", note:"legal escalation handled by Omran AI" },
  { id:"social-1", message:"رح انشر عليكم واحكي انكم نصابين", requiredTopics:["complaint","social_threat"], requiredRole:"omran", note:"firm de-escalation, practical cancel/refund path, no begging" },
  { id:"fee-1", message:"متى احول ال 5 دنانير؟", requiredTopics:["payment_fee","payment_timing"], note:"fee amount and timing both covered" },
  { id:"office-1", message:"بقدر اجي عالمكتب اليوم؟", requiredTopics:["appointment"], note:"appointment only; no invented booking" },
  { id:"review-1", message:"قديش بتقعد المعاملة ومتى بردولي خبر؟", requiredTopics:["review_timing"], note:"must say normal 2-3 business days + current severe pressure; no invented exact ETA" },
  { id:"call-1", message:"رنوا علي بدي احكي مع حدا", requiredTopics:["call_request"], note:"record preference, solve on WhatsApp, no promise" },
  { id:"trust-1", message:"انتو شركة الامين للتمويل؟", requiredTopics:["trust"], note:"must use independence statement and correct identity" },
];
