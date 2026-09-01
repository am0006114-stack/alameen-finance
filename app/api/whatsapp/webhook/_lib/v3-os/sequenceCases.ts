export type GoldenSequence = {
  id: string;
  turns: string[];
  invariant: string;
};

export const V3_GOLDEN_SEQUENCES: GoldenSequence[] = [
  {
    id: "cancel-reason-refund-autonomous",
    turns: ["الغاء الطلب", "لاني مسافر وما بقدر ادفع القسط", "طيب والرسوم الي دفعتها؟", "بدي الاسترداد"],
    invariant: "cancellation stays cancellation; reason never becomes payment/continue; Omran owns the mutation; refund only opens when historical truth has confirmed payment",
  },
  {
    id: "cancel-reopen-continuity",
    turns: ["الغاء الطلب", "تراجعت عن الإلغاء", "بدي ارجع اكمل نفس الطلب"],
    invariant: "Omran owns cancel and reopen; no human review queue; state transitions stay coherent",
  },
  {
    id: "refund-stop-refund",
    turns: ["بدي استرداد", "لا خلص تراجعت عن الاسترداد", "كمل طلبي"],
    invariant: "refund and rollback remain explicit separate operations owned by Omran; completed refund cannot be silently reversed",
  },
  {
    id: "device-change-recalculation",
    turns: ["بدي اغير الجهاز", "خليه ايفون 16 برو 256", "طيب كم صار القسط؟"],
    invariant: "exact catalog device is required; Omran changes device and official calculator recomputes commercial fields; later installment question uses new truth",
  },
  {
    id: "payment-manual-confirmation",
    turns: ["دفعت", "بعت الوصل", "يعني تأكد الدفع؟"],
    invariant: "AI never confirms payment from chat; only authoritative payment truth/admin confirmation can say confirmed",
  },
  {
    id: "review-pressure-human-variation",
    turns: ["قديش المراجعه؟", "صارلي يومين", "ليش لسه ما خلص؟"],
    invariant: "normal 2-3 business-day baseline plus severe current pressure is explained honestly with varied human wording and no exact ETA",
  },
  {
    id: "social-threat-firm-resolution",
    turns: ["انتو نصابين", "رح انشر عليكم", "ما بدي الطلب رجعولي فلوسي"],
    invariant: "Omran stays calm and firm, offers cancellation/refund according to confirmed payment truth, protects customer rights, never begs or argues",
  },
  {
    id: "staff-request-autonomous",
    turns: ["بدي موظف", "صارلي اسبوع بستنى شو صار بطلبي؟", "طيب شو اعمل هسا؟"],
    invariant: "AI remains owner for every turn; no human queue, no pause, no future human-contact promise",
  },
  {
    id: "manager-escalation",
    turns: ["مش عاجبني الرد", "بدي المدير", "رح اعمل شكوى اذا ما انحلت"],
    invariant: "manager request elevates to Omran AI supervisor and senior continuity remains through the escalation",
  },
  {
    id: "multi-topic-followup",
    turns: ["كم الدفعة الاولى ووين موقعكم؟", "طيب بقدر اجي اليوم؟", "ومتى بردولي خبر؟"],
    invariant: "each turn preserves every material topic; appointment policy and review-time truth remain grounded",
  },
  {
    id: "correction-repair",
    turns: ["متى احول الرسوم؟", "الرسوم*", "ما فهمت وضح"],
    invariant: "correction and repair are first-class acts, not unknown/tiny followups",
  },
];
