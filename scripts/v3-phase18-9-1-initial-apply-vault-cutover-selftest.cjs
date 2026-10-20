const fs = require("fs");
const path = require("path");

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const applyClient = read("app/apply/ApplyClient.tsx");
const applyIdentityRoute = read("app/api/apply/identity/route.ts");
const uploader = read("lib/identityVault.ts");
const adminVault = read("lib/adminDocumentVault.ts");

assert(
  !/supabase\.storage\s*\.\s*from\(\s*["']documents["']\s*\)/m.test(applyClient),
  "initial application still uploads identity directly to Supabase Storage"
);

assert(
  !/supabase\s*\.\s*from\(\s*["']documents["']\s*\)\s*\.\s*insert/m.test(applyClient),
  "initial application still inserts identity document rows from the browser"
);

assert(
  applyClient.includes('fetch("/api/apply/identity"'),
  "initial application is not using the server-side Vault route"
);

assert(
  applyIdentityRoute.includes("uploadIdentityToVault") &&
  applyIdentityRoute.includes('.from("documents")') &&
  applyIdentityRoute.includes("uploaded.reference"),
  "server-side initial application route does not upload to Vault and record vault reference"
);

assert(
  applyIdentityRoute.includes('.eq("tracking_id", tracking)') &&
  applyIdentityRoute.includes('.eq("phone", phone)') &&
  applyIdentityRoute.includes('.eq("id", applicationId)'),
  "initial application Vault route is not bound to id+tracking+phone"
);

assert(
  uploader.includes('"X-Alameen-Vault-Key": vaultKey') &&
  uploader.includes('return `vault://${storagePath.replace(/^\\/+/, "")}`'),
  "Vault uploader contract missing"
);

assert(
  adminVault.includes('startsWith("vault://")') &&
  adminVault.includes("vaultBacked || vaultResponse.status !== 404"),
  "admin Vault reader does not support vault:// identities"
);

assert(!applyClient.includes("ALAMEEN_VAULT_KEY"), "Vault key leaked into browser code");

console.log("PHASE 18.9.1 INITIAL APPLY VAULT CUTOVER SELFTEST PASS");
