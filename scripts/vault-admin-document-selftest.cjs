const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = read("app/admin/applications/[id]/page.tsx");
const route = read("app/api/admin/document/route.ts");
const helper = read("lib/adminDocumentVault.ts");
const exporter = read("app/api/admin/export-applications/route.ts");

assert(
  page.includes('return `/api/admin/document?id=${encodeURIComponent(document.id)}`;'),
  "admin page does not route identity documents through the protected endpoint"
);
assert(
  page.includes('const isPaymentReceipt = documentType === "payment_receipt";'),
  "payment receipt rendering block unexpectedly changed"
);
assert(
  route.includes("await isAdminLoggedIn()"),
  "protected document route is missing admin-session validation"
);
assert(
  route.includes("if (!isIdentityDocument(document))"),
  "protected document route is not identity-only"
);
assert(
  helper.includes("process.env.ALAMEEN_VAULT_KEY"),
  "Vault helper is missing server-side Vault key"
);
assert(
  helper.includes('"X-Alameen-Vault-Key": vaultKey'),
  "Vault helper is missing authenticated Vault header"
);
assert(
  helper.includes('if (vaultResponse.status !== 404)'),
  "Vault helper does not fail closed on non-404 Vault errors"
);
assert(
  exporter.includes('import {\n  fetchAdminDocument,\n  isIdentityDocument,\n} from "@/lib/adminDocumentVault";') ||
    exporter.includes('import {\r\n  fetchAdminDocument,\r\n  isIdentityDocument,\r\n} from "@/lib/adminDocumentVault";'),
  "admin ZIP export is missing the Vault-aware import"
);
assert(
  exporter.includes("fetchAdminDocument(document)"),
  "admin ZIP export helper does not use the Vault-aware document source"
);
assert(
  exporter.includes("fetchFileAsArrayBuffer(doc, url)"),
  "admin ZIP export call site does not pass the document record"
);
assert(
  !page.includes("ALAMEEN_VAULT_KEY"),
  "Vault secret must never be referenced by the browser/admin page"
);

console.log("VAULT ADMIN DOCUMENT SELFTEST PASS");
