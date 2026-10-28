#!/usr/bin/env node

/**
 * VERIPASS Standalone Offline Verifier
 * Performs 100% offline cryptographic verification with ZERO network dependencies.
 *
 * Verifies:
 * 1. Issuer signature over canonical credential digests
 * 2. Holder presentation signature (proof of possession)
 * 3. Salted claim digest integrity (anti-tamper)
 * 4. Holder-to-Subject cryptographic binding
 *
 * Explicitly notes offline limitations:
 * Nonce freshness and revocation status CANNOT be checked offline.
 */

import fs from "node:fs";
import crypto from "node:crypto";

function canonical(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonical(item)).join(",") + "]";
  }
  const record = obj;
  const sortedKeys = Object.keys(record).sort();
  const pairs = sortedKeys
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`);
  return "{" + pairs.join(",") + "}";
}

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function verifyPayloadWithKey(payload, signatureBase64Url, publicKeyPem) {
  try {
    const data = Buffer.from(canonical(payload), "utf8");
    const sig = Buffer.from(signatureBase64Url, "base64url");
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, data, key, sig);
  } catch {
    return false;
  }
}

export function verifyOfflineBundle(bundle) {
  const { presentation, issuerPublicKeyPem, holderPublicKeyPem } = bundle;
  if (!presentation || !issuerPublicKeyPem || !holderPublicKeyPem) {
    throw new Error("Invalid bundle: missing presentation or public keys");
  }

  const { credential, disclosedClaims, disclosedSalts, presentationProof } = presentation;
  const results = [];

  // Check 1: Issuer signature
  const issuerDoc = {
    id: credential.id,
    type: credential.type,
    issuer: credential.issuer,
    subject: credential.subject,
    issuedAt: credential.issuedAt,
    claimDigests: credential.claimDigests,
  };
  const issuerSigPass = verifyPayloadWithKey(
    issuerDoc,
    credential.proof.proofValue,
    issuerPublicKeyPem
  );
  results.push({
    name: "Issuer Cryptographic Signature",
    passed: issuerSigPass,
    detail: issuerSigPass ? "Valid Ed25519 signature from authority" : "Invalid issuer signature",
  });

  // Check 2: Holder presentation signature
  const revealedNames = Object.keys(disclosedClaims).sort();
  const holderDoc = {
    nonce: presentationProof.nonce,
    credentialId: credential.id,
    revealedClaimNames: revealedNames,
    holderDid: presentationProof.holder,
    timestamp: presentationProof.timestamp,
  };
  const holderSigPass = verifyPayloadWithKey(
    holderDoc,
    presentationProof.proofValue,
    holderPublicKeyPem
  );
  results.push({
    name: "Holder Authenticity Signature",
    passed: holderSigPass,
    detail: holderSigPass ? "Valid Ed25519 proof-of-possession signature" : "Invalid holder signature",
  });

  // Check 3: Salted claim digest integrity
  let digestsPass = true;
  const failures = [];
  for (const name of Object.keys(disclosedClaims)) {
    const val = disclosedClaims[name];
    const salt = disclosedSalts[name];
    const expected = credential.claimDigests[name];
    if (!salt || !expected) {
      digestsPass = false;
      failures.push(`Missing salt/digest for '${name}'`);
      continue;
    }
    const computed = sha256(`${salt}:${name}:${String(val)}`);
    if (computed !== expected) {
      digestsPass = false;
      failures.push(`Digest mismatch for '${name}'`);
    }
  }
  results.push({
    name: "Claim Digest Integrity (Anti-Tamper)",
    passed: digestsPass,
    detail: digestsPass
      ? `All ${Object.keys(disclosedClaims).length} revealed claims match cryptographic commitments`
      : failures.join("; "),
  });

  // Check 4: Subject binding
  const bindingPass = credential.subject === presentationProof.holder;
  results.push({
    name: "Holder-to-Subject Identity Binding",
    passed: bindingPass,
    detail: bindingPass
      ? "Credential subject matches presenting holder DID"
      : `Subject mismatch (${credential.subject} != ${presentationProof.holder})`,
  });

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// CLI Execution if run directly
const isCli = process.argv[1] && process.argv[1].endsWith("verify-offline.mjs");
if (isCli && process.argv[2]) {
  try {
    const filePath = process.argv[2];
    const raw = fs.readFileSync(filePath, "utf-8");
    const bundle = JSON.parse(raw);
    const { allPassed, results } = verifyOfflineBundle(bundle);

    console.log("\n=======================================================");
    console.log("       VERIPASS OFFLINE VERIFIER (AIR-GAPPED MODE)      ");
    console.log("=======================================================\n");

    for (const r of results) {
      const badge = r.passed ? "[\x1b[32mPASS\x1b[0m]" : "[\x1b[31mFAIL\x1b[0m]";
      console.log(`${badge} ${r.name}`);
      console.log(`       Detail: ${r.detail}`);
    }

    console.log("\n-------------------------------------------------------");
    console.log("[\x1b[33mNOTICE - OFFLINE LIMITATIONS\x1b[0m]");
    console.log("  * Nonce freshness CANNOT be checked offline.");
    console.log("  * Credential revocation list CANNOT be fetched offline.");
    console.log("  * On-chain state CANNOT be verified offline.");
    console.log("-------------------------------------------------------");

    if (allPassed) {
      console.log("\n>>> \x1b[32mVERIFICATION RESULT: ALL OFFLINE CHECKS PASSED\x1b[0m <<<\n");
      process.exit(0);
    } else {
      console.error("\n>>> \x1b[31mVERIFICATION RESULT: ONE OR MORE CHECKS FAILED\x1b[0m <<<\n");
      process.exit(1);
    }
  } catch (err) {
    console.error("Offline verification error:", err.message);
    process.exit(1);
  }
}
