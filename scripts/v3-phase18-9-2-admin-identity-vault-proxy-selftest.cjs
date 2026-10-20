const fs = require("fs");
const path = require("path");

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const adminPage = read("app/admin/page.tsx");
const adminDetail = read("app/admin/applications/[id]/page.tsx");
const adminRoute = read("app/api/admin/document/route.ts");
const adminVault = read("lib/adminDocumentVault.ts");

const functionStart = adminPage.indexOf("function getDocumentUrl(document: DocumentRecord | undefined)");
assert(functionStart >= 0, "admin list getDocumentUrl function missing");

const functionSlice = adminPage.slice(functionStart, functionStart + 1200);
const proxyIndex = functionSlice.indexOf("/api/admin/document?id=");
const rawIndex = functionSlice.indexOf("if (document.file_url) return document.file_url");

assert(proxyIndex >= 0, "admin list identity preview is not routed through protected admin document proxy");
assert(rawIndex >= 0, "admin list raw document fallback unexpectedly missing");
assert(proxyIndex < rawIndex, "admin list still prefers raw Supabase identity URL before Vault proxy");

assert(
  functionSlice.includes("isApplicantFrontDocument(document)") &&
  functionSlice.includes("isApplicantBackDocument(document)"),
  "admin list Vault proxy is not scoped to applicant identity images"
);

assert(
  adminDetail.includes("/api/admin/document?id="),
  "admin application detail lost protected identity document proxy"
);

assert(
  adminRoute.includes("await isAdminLoggedIn()") &&
  adminRoute.includes("fetchAdminDocument"),
  "protected admin document route lost auth or Vault fetch"
);

assert(
  adminVault.includes('startsWith("vault://")') &&
  adminVault.includes("source: \"vault\" as const"),
  "admin Vault reader contract missing"
);

console.log("PHASE 18.9.2 ADMIN IDENTITY VAULT PROXY SELFTEST PASS");
