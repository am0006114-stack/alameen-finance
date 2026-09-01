import type { ActionExecutorAdapter } from "./actionPlane";
import { calculateRequestedDeviceChange, extractApplicationPatch } from "./commercialOperations";
import type { ApplicationTruth, TruthBundle } from "./types";
import { hasPaymentRefundIntegrityConflict, truthHasAuthoritativePaymentConfirmation } from "./paymentTruth";

function mutableApp(context: { truth: TruthBundle }) {
  return context.truth.application;
}

function details(app: ApplicationTruth) {
  return { simulatedApplication: app };
}

export const v3SimulationActionAdapter: ActionExecutorAdapter = {
  async execute(planned, context) {
    const action = planned.action;
    const app = mutableApp(context);
    if (!app && !["none","switch_ai_role","record_call_preference"].includes(action)) return { success:false, blocker:"application_required" };
    if (context.state.role.currentRole !== "omran" && ["cancel_application","continue_application","request_refund","stop_refund","change_application_data","change_device","reopen_application"].includes(action)) return { success:false, blocker:"omran_supervisor_required" };
    if (!app) return { success:true, alreadyDone:true, summary:"no_business_application" };

    const next: ApplicationTruth = { ...app };

    if (hasPaymentRefundIntegrityConflict(app) && ["cancel_application","request_refund","stop_refund","reopen_application","continue_application","change_application_data","change_device"].includes(action)) {
      return { success:false, blocker:"payment_refund_integrity_conflict_requires_admin" };
    }

    if (action === "cancel_application") {
      const paid = truthHasAuthoritativePaymentConfirmation(context.truth);
      if (app.status === "cancelled" && paid && app.paymentStatus === "refund_requested") return { success:true, alreadyDone:true, mutationId:app.id, summary:"الطلب ملغي ومسار الاسترداد مسجل أصلًا.", details:details(next) };
      if (app.status === "cancelled" && !paid) return { success:true, alreadyDone:true, mutationId:app.id, summary:"الطلب ملغي أصلًا ولا يوجد دفع مؤكد لفتح استرداد.", details:details(next) };
      if (paid) {
        next.status="cancelled"; next.paymentStatus="refund_requested";
        return { success:true, mutationId:app.id, summary:"تم إلغاء الطلب وفتح مسار الاسترداد تلقائيًا لأن الدفع مؤكد إداريًا.", details:details(next) };
      }
      next.status="cancelled"; next.paymentStatus=app.paymentStatus || "not_requested_yet";
      return { success:true, mutationId:app.id, summary:"تم إلغاء الطلب تلقائيًا، بدون استرداد لأنه لا يوجد دفع مؤكد.", details:details(next) };
    }

    if (action === "request_refund") {
      if (!truthHasAuthoritativePaymentConfirmation(context.truth)) return { success:false, blocker:"confirmed_payment_required" };
      if (app.status === "refund_completed" || app.paymentStatus === "refund_completed") return { success:true, alreadyDone:true, mutationId:app.id, summary:"الاسترداد مكتمل أصلًا.", details:details(next) };
      next.status="refund_requested"; next.paymentStatus="refund_requested";
      return { success:true, mutationId:app.id, summary:"تم تسجيل طلب الاسترداد فعليًا بواسطة عمران.", details:details(next) };
    }

    if (action === "stop_refund" || action === "reopen_application" || (action === "continue_application" && (["cancelled","refund_requested"].includes(String(app.status || "")) || app.paymentStatus === "refund_requested"))) {
      if (app.status === "refund_completed" || app.paymentStatus === "refund_completed") return { success:false, blocker:"refund_already_completed_same_application_cannot_reopen" };
      const wasPaid = truthHasAuthoritativePaymentConfirmation(context.truth);
      next.status="customer_confirmed_continue";
      next.paymentStatus=wasPaid?"confirmed":"payment_info_sent";
      return { success:true, mutationId:app.id, summary: app.paymentStatus === "refund_requested" || app.status === "refund_requested" ? "تم إيقاف مسار الاسترداد وإعادة تفعيل الطلب فعليًا بواسطة عمران." : "تم التراجع عن الإلغاء وإعادة تفعيل الطلب فعليًا بواسطة عمران.", details:details(next) };
    }

    if (action === "continue_application") {
      if (app.status === "customer_confirmed_continue") return { success:true, alreadyDone:true, mutationId:app.id, summary:"رغبة الاستمرار مسجلة أصلًا.", details:details(next) };
      if (app.status !== "preliminary_qualified") return { success:false, blocker:"application_not_preliminary_qualified" };
      next.status="customer_confirmed_continue"; next.paymentStatus="payment_info_sent";
      return { success:true, mutationId:app.id, summary:"تم تسجيل رغبة الاستمرار على الطلب فعليًا بواسطة عمران.", details:details(next) };
    }

    if (action === "change_device") {
      const text=String(planned.payload?.requestedValue || context.state.lastCustomerText || "");
      const change=calculateRequestedDeviceChange(app,text);
      if(!change.ok) return {success:false,blocker:change.blocker};
      Object.assign(next,change.truthPatch);
      return {success:true,mutationId:app.id,summary:change.summary,details:details(next)};
    }

    if (action === "change_application_data") {
      const text=String(planned.payload?.requestedValue || context.state.lastCustomerText || "");
      const patch=extractApplicationPatch(text);
      if(!Object.keys(patch).length) return {success:false,blocker:"clear_supported_field_and_value_required"};
      if(typeof patch.full_name==="string") next.fullName=patch.full_name;
      if(typeof patch.phone==="string") next.phone=patch.phone;
      if(typeof patch.email==="string") next.email=patch.email;
      if(typeof patch.salary==="number") next.salary=patch.salary;
      return {success:true,mutationId:app.id,summary:`تم تعديل بيانات الطلب فعليًا بواسطة عمران: ${Object.keys(patch).join("، ")}.`,details:details(next)};
    }

    if (action === "generate_secure_upload_link" || action === "generate_receipt_link") return {success:true,alreadyDone:true,summary:"الرابط الرسمي الآمن متاح بدون تعديل حالة الدفع.",details:details(next)};
    return {success:false,blocker:`unsupported_simulated_action:${action}`};
  },
};

export function applySimulatedActionTruth(truth: TruthBundle, results: Array<{ executed:boolean; details?:Record<string,unknown>|null }>): TruthBundle {
  let application=truth.application;
  for(const result of results){
    const simulated=(result.details as any)?.simulatedApplication as ApplicationTruth|undefined;
    if(result.executed && simulated) application=simulated;
  }
  return {...truth,application};
}
