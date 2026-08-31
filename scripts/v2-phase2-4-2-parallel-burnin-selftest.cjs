const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const projectRoot = process.argv[2];
if (!projectRoot) throw new Error("Project root argument missing");

const files = [
  "app/admin/whatsapp-v2-lab/ArchiveLabActions.tsx",
  "app/api/internal/whatsapp-v2-archive/worker/route.ts",
];

for (const rel of files) {
  const full = path.join(projectRoot, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing ${rel}`);
  const source = fs.readFileSync(full, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    reportDiagnostics: true,
    fileName: full,
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`${rel}: ${errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join(" | ")}`);
}

const actions = fs.readFileSync(path.join(projectRoot, files[0]), "utf8");
const worker = fs.readFileSync(path.join(projectRoot, files[1]), "utf8");
if (!actions.includes("const PARALLEL_LANES = 6")) throw new Error("Six-lane burn-in runner missing");
if (!actions.includes("Promise.all(Array.from({ length: PARALLEL_LANES }")) throw new Error("Parallel lane execution missing");
if (!actions.includes("limit: 1")) throw new Error("Client must still request one case per HTTP request");
if (!actions.includes("enable_for")) throw new Error("Timed-run enable missing");
if (!actions.includes("STOP ALL ARCHIVE AI")) throw new Error("Emergency stop missing");
if (!worker.includes("const requested = 1")) throw new Error("Worker must remain one-case per request");
if (!worker.includes("export const maxDuration = 300")) throw new Error("Worker maxDuration 300 missing");
console.log("SELFTEST PASS - V2 PHASE 2.4.2 PARALLEL BURN-IN RUNNER");
console.log("2 TypeScript files transpiled + six-lane/one-case/timeout guards verified");
