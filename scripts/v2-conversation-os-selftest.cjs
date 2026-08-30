const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const base = path.join(projectRoot, "app", "api", "whatsapp", "webhook", "_lib", "v2-conversation");
const cache = new Map();

function loadModule(filePath) {
  const resolved = filePath.endsWith(".ts") ? filePath : `${filePath}.ts`;
  if (cache.has(resolved)) return cache.get(resolved).exports;
  if (!fs.existsSync(resolved)) throw new Error(`Missing module ${resolved}`);

  const source = fs.readFileSync(resolved, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: resolved,
  }).outputText;

  const module = { exports: {} };
  cache.set(resolved, module);

  function localRequire(specifier) {
    if (specifier.startsWith(".")) {
      return loadModule(path.resolve(path.dirname(resolved), specifier));
    }
    return require(specifier);
  }

  const sandbox = {
    module,
    exports: module.exports,
    require: localRequire,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(out, sandbox, { filename: resolved });
  return module.exports;
}

const interpreter = loadModule(path.join(base, "deterministicInterpreter"));
const resolver = loadModule(path.join(base, "referenceResolver"));
const reducer = loadModule(path.join(base, "stateReducer"));
const quality = loadModule(path.join(base, "quality"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function topics(text) {
  return interpreter.deterministicInterpret({ customerText: text, messageType: "text" }).topics;
}
function acts(text) {
  return interpreter.deterministicInterpret({ customerText: text, messageType: "text" }).acts;
}
function hasTopic(text, topic) {
  assert(topics(text).includes(topic), `${text} missing ${topic}; got ${topics(text).join(",")}`);
}
function hasAct(text, predicate, label) {
  const rows = acts(text);
  assert(rows.some(predicate), `${text} missing ${label}; got ${JSON.stringify(rows)}`);
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("multi-topic first installment + location", () => {
  const t = topics("كم الدفعه الاولى ووين موقعكم؟");
  assert(t.includes("first_installment"), JSON.stringify(t));
  assert(t.includes("office_location"), JSON.stringify(t));
});

test("multi-topic price + installment duration", () => {
  const t = topics("بدي اعرف السعر وكم من شهر");
  assert(t.includes("product_price"), JSON.stringify(t));
  assert(t.includes("installment_duration"), JSON.stringify(t));
});

test("explicit cancellation cannot disappear", () => {
  hasAct("بدي الغي الطلب", (a) => a.type === "request_action" && a.topic === "cancellation" && a.action === "cancel_application", "cancel action");
});

test("cancellation reason is a separate act", () => {
  hasAct("بدي الغي لاني مسافر ولا استطيع دفع القسط", (a) => a.type === "provide_reason" && a.topic === "cancellation", "cancellation reason");
});

test("cancellation question is not a mutation", () => {
  const rows = acts("بقدر الغي الطلب؟");
  assert(rows.some((a) => a.type === "ask" && a.topic === "cancellation"), JSON.stringify(rows));
  assert(!rows.some((a) => a.action === "cancel_application"), JSON.stringify(rows));
});

test("explicit refund request", () => {
  hasAct("بدي الاسترداد تبعي", (a) => a.topic === "refund", "refund");
});

test("refund status followup", () => {
  hasAct("وهسا شو صار بالاسترداد؟", (a) => a.type === "ask" && a.topic === "refund", "refund followup");
});

test("human agent request is first-class", () => {
  hasAct("بدي موضف", (a) => a.type === "handoff_request" && a.topic === "human_handoff" && a.action === "human_handoff", "handoff");
});

test("no guarantor is stored as a fact", () => {
  hasAct("ماعندي كفيل نهائي", (a) => a.type === "provide_fact" && a.topic === "guarantor" && a.value === "none", "guarantor none");
});

test("repair request is not noise", () => {
  hasAct("ما فهمت", (a) => a.type === "repair_request", "repair");
});

test("correction star is first-class", () => {
  const turn = interpreter.deterministicInterpret({ customerText: "الرسوم*", messageType: "text" });
  assert(turn.acts.some((a) => a.type === "correct"), JSON.stringify(turn.acts));
  assert(turn.corrections.some((c) => c.replacement === "الرسوم"), JSON.stringify(turn.corrections));
});

test("review timing clarification", () => {
  hasTopic("قصدي متا بردولي خبر على الجهاز", "review_timing");
});

test("site troubleshooting continuation", () => {
  hasTopic("جربت عدت من اول وجديد ما زبطت", "site_issue");
});

test("receipt upload question", () => {
  hasTopic("تمام حولت بس كيف احط الوصل", "receipt_upload");
});

test("payment timing question", () => {
  hasTopic("متى احول 5 دنانير، عند الموافقه ام الآن", "payment_timing");
});

test("short transfer question remains payment-related", () => {
  hasTopic("احول ؟", "payment_timing");
});

test("pickup-location question stays location", () => {
  hasTopic("وين موقع الاستلام", "office_location");
});

test("non-continuation is not continuation", () => {
  const rows = acts("لا ارغب بالاستمرار حاليا");
  assert(rows.some((a) => a.action === "decline_application"), JSON.stringify(rows));
  assert(!rows.some((a) => a.action === "continue_application"), JSON.stringify(rows));
});

test("short no resolves guarantor open loop", () => {
  const state = reducer.emptyConversationState("962700000000");
  state.openLoops.push({
    id: "loop-g",
    topic: "guarantor",
    owedBy: "customer",
    state: "open",
    question: "عندك كفيل بدون ضمان، ولا ما عندك كفيل نهائيًا؟",
    sourceTurnId: "prev",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const turn = interpreter.deterministicInterpret({ customerText: "ماعندي", messageType: "text" });
  const resolved = resolver.resolveTurnReferences({ turn, state });
  assert(resolved.acts.some((a) => a.type === "provide_fact" && a.topic === "guarantor" && a.value === "none"), JSON.stringify(resolved.acts));
});

test("repair resolves to latest topic", () => {
  const state = reducer.emptyConversationState("962700000001");
  state.currentTopic = "payment_fee";
  state.openLoops.push({
    id: "loop-p",
    topic: "payment_fee",
    owedBy: "assistant",
    state: "open",
    question: "رسوم فتح الملف",
    sourceTurnId: "prev",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const turn = interpreter.deterministicInterpret({ customerText: "كيف يعني", messageType: "text" });
  const resolved = resolver.resolveTurnReferences({ turn, state });
  assert(resolved.acts.some((a) => a.type === "repair_request" && a.topic === "payment_fee"), JSON.stringify(resolved.acts));
});

test("correction inherits conversational topic", () => {
  const state = reducer.emptyConversationState("962700000002");
  state.currentTopic = "payment_fee";
  const turn = interpreter.deterministicInterpret({ customerText: "الرسوم*", messageType: "text" });
  const resolved = resolver.resolveTurnReferences({ turn, state });
  assert(resolved.acts.some((a) => a.type === "correct" && a.topic === "payment_fee"), JSON.stringify(resolved.acts));
});

test("assistant guarantor question creates customer-open loop", () => {
  const state = reducer.emptyConversationState("962700000003");
  const turn = interpreter.deterministicInterpret({ customerText: "ما عندي كفيل", messageType: "text" });
  const next = reducer.reduceConversationState({
    state,
    turn,
    turnId: "t1",
    customerText: "ما عندي كفيل",
    actualReply: "عندك كفيل بدون ضمان، ولا ما عندك كفيل نهائيًا؟",
  });
  assert(next.openLoops.some((l) => l.topic === "guarantor" && l.owedBy === "customer" && l.state === "open"), JSON.stringify(next.openLoops));
});

test("human handoff persists into state", () => {
  const state = reducer.emptyConversationState("962700000004");
  const turn = interpreter.deterministicInterpret({ customerText: "بدي موظف", messageType: "text" });
  const next = reducer.reduceConversationState({ state, turn, turnId: "t1", customerText: "بدي موظف", actualReply: "" });
  assert(next.humanHandoff.requested === true, JSON.stringify(next.humanHandoff));
  assert(next.openLoops.some((l) => l.topic === "human_handoff" && l.owedBy === "staff"), JSON.stringify(next.openLoops));
});

test("quality gate catches no lost explicit cancellation", () => {
  const turn = interpreter.deterministicInterpret({ customerText: "الغاء الطلب", messageType: "text" });
  const q = quality.evaluateUnderstanding({ customerText: "الغاء الطلب", messageType: "text", turn });
  assert(q.pass, JSON.stringify(q));
  assert(!q.criticalFlags.includes("missed_explicit_cancellation"), JSON.stringify(q));
});

let passed = 0;
for (const [name, fn] of tests) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}/${tests.length}: ${name}`);
}
console.log(`SELFTEST PASS - ${passed}/${tests.length} V2 Conversation OS Phase0+1 regressions`);
