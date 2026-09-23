import type { InterpretedTurn, TruthBundle } from "./types";
import { applicationJourneyStage } from "./applicationJourney";
import { fileOpeningPaymentWriterTruth } from "./paymentDestinationOverride";
import { buildSingleConversationAuthorityReply } from "./singleConversationAuthority";

function quoted(value: string) { return `«${String(value || "").replace(/\s+/g," ").trim()}»`; }

export function buildSemanticFailClosedReply(input: { turn: InterpretedTurn; truth: TruthBundle; state?: import("./types").ConversationState }) {
  const authority = input.state ? buildSingleConversationAuthorityReply({ turn: input.turn, state: input.state, truth: input.truth }) : null;
  if (authority) return authority;
  const frame = input.turn.semantic;
  if (!frame) return null;

  if (["deferred","conditional"].includes(frame.decision.continuation)) {
    const condition = frame.decision.condition ? ` حسب كلامك، قرار الاستمرار مرتبط بـ${quoted(frame.decision.condition)}.` : "";
    return `تمام، ما رح أعتبرك اخترت الاستمرار الآن.${condition} لما يتضح هالشي وتقرر تكمل، وقتها بنمشي بخطوة الاستمرار.`;
  }
  if (frame.decision.continuation === "declined") {
    return "تمام، ما رح أعتبرك اخترت الاستمرار، وما رح أفتح عليك خطوة دفع بسبب هالرسالة.";
  }

  const unknownWallet = frame.entities.find((entity) => entity.kind === "wallet_or_payment_app" && entity.knownFactStatus === "unknown");
  if (unknownWallet && frame.currentQuestion) {
    const stage = applicationJourneyStage(input.truth.application);
    const payment = fileOpeningPaymentWriterTruth();
    if (stage === "continuation_confirmed_fee_due") {
      return `فهمت عليك: سؤالك إذا بتقدر تحوّل رسوم فتح الملف من ${quoted(unknownWallet.surface)}. ما عندي توثيق عن المحفظة نفسها حتى أضمن توافقها، لكن إذا بتسمح لك تعمل تحويل إلى Orange Money أو CliQ فبتقدر تستخدم وجهة الدفع المعتمدة عندنا: Orange Money على ${payment.phone}، أو CliQ عبر ${payment.aliases.join(" أو ")}. قبل التأكيد تأكد إن اسم المستفيد ظاهر ${payment.beneficiaryName}.`;
    }
    return `فهمت عليك: سؤالك عن استخدام ${quoted(unknownWallet.surface)} كوسيلة يبدأ منها التحويل. ما عندي توثيق عن المحفظة نفسها حتى أعطيك نعم أو لا مطلقة، وما رح أفترض إنها محفظة ثانية. لما تكون خطوة الدفع مستحقة على طلبك، المرجع هو وجهات الدفع الرسمية اللي بنعطيك إياها وقتها.`;
  }

  const question = String(frame.currentQuestion || "").toLowerCase();
  if (question && /قسط|الأقساط|اقساط/.test(question) && /كيف|تحويل|اقتطاع|اسدد|أدفع|ادفع|دفع/.test(question)) {
    return "إذا قصدك طريقة تسديد القسط الشهري: السداد بيكون حسب تفضيلك عبر CliQ، أو تحويل بنكي، أو بالحضور للموقع اللي تم فيه توقيع العقد والدفع هناك. هاي مختلفة عن رسوم فتح الملف.";
  }

  if (frame.currentQuestion) {
    return `سؤالك واضح: ${quoted(frame.currentQuestion)}. المعلومة المحددة اللازمة للجواب مش موجودة عندي ضمن الحقيقة الموثقة الحالية، لذلك ما رح أخمّن أو أبدل سؤالك بموضوع ثاني.`;
  }
  return null;
}
