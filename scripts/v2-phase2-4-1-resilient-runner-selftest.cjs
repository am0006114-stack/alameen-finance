const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const projectRoot = process.argv[2];
if (!projectRoot) throw new Error("Project root argument missing");

const files = [
  "app/admin/whatsapp-v2-lab/ArchiveLabActions.tsx",
  "app/api/internal/whatsapp-v2-archive/control/route.ts",
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
  if (errors.length) {
    throw new Error(`${rel}: ${errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join(" | ")}`);
  }
}

const actions = fs.readFileSync(path.join(projectRoot, files[0]), "utf8");
const worker = fs.readFileSync(path.join(projectRoot, files[2]), "utf8");
if (!actions.includes("limit: 1")) throw new Error("Client is not single-case per request");
if (!actions.includes("runTimed(3)")) throw new Error("3-hour runner missing");
if (!actions.includes("STOP ALL ARCHIVE AI")) throw new Error("Emergency stop missing");
if (!worker.includes("const requested = 1")) throw new Error("Worker is not forced to one case");
if (!worker.includes("lab_run_until")) throw new Error("Timed-run expiry guard missing");

console.log("SELFTEST PASS - V2 PHASE 2.4.1 RESILIENT BURN-IN RUNNER");
console.log("3 TypeScript files transpiled + timeout/timed-run guards verified");
