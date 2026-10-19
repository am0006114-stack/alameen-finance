const fs = require("fs");
const path = require("path");

const root = process.cwd();
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const identityRoute = read("app/api/identity/route.ts");
const guarantorRoute = read("app/api/guarantor/route.ts");
const guarantorClient = read("app/guarantor/GuarantorClient.tsx");
const uploader = read("lib/identityVault.ts");
const adminVault = read("lib/adminDocumentVault.ts");
const adminDocumentRoute = read("app/api/admin/document/route.ts");

assert(identityRoute.includes("uploadIdentityToVault"), "applicant identity route is not using private Vault");
assert(!identityRoute.includes('.storage.from("documents")'), "applicant route still uploads identity to Supabase Storage");
assert(guarantorRoute.includes('documentType: "guarantor_front"') && guarantorRoute.includes('documentType: "guarantor_back"'), "guarantor server route missing private identity uploads");
assert(guarantorRoute.includes('.eq("tracking_id", tracking)') && guarantorRoute.includes('.eq("phone", phone)'), "guarantor route is not bound to tracking+phone");
assert(!guarantorClient.includes('.storage\n      .from("documents")') && !guarantorClient.includes('.storage.from("documents")'), "guarantor browser still uploads to Supabase Storage");
assert(!guarantorClient.includes('.from("documents").insert'), "guarantor browser still inserts document rows directly");
assert(guarantorClient.includes('fetch("/api/guarantor"'), "guarantor browser is not using server-side submission route");
assert(uploader.includes('"X-Alameen-Vault-Key": vaultKey') && uploader.includes('"X-Alameen-Content-SHA256": sha256'), "Vault uploader missing key/SHA headers");
assert(uploader.includes('`vault://${storagePath.replace(/^\\/+/, "")}`'), "new identities are not Vault-native references");
assert(adminVault.includes('startsWith("vault://")') && adminVault.includes("vaultBacked || vaultResponse.status !== 404"), "admin Vault reader lacks vault:// fail-closed behavior");
assert(adminDocumentRoute.includes("await isAdminLoggedIn()"), "protected admin identity route lost authentication");
assert(!guarantorClient.includes("ALAMEEN_VAULT_KEY"), "Vault key leaked into browser code");

console.log("PHASE 18.9 PRIVATE IDENTITY VAULT DIRECT UPLOAD SELFTEST PASS");
