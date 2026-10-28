import { Router, Request, Response } from "express";
import { randomHex, sha256, verifyPayload, publicKeyFromDid } from "../crypto.js";
import { repository, writeAuditLog } from "../store.js";
import { computeCredentialCommitment, checkOnChainStatus } from "../chain.js";
import type { VerifiableCredential } from "../types.js";

export const verifyRouter = Router();

const SENSITIVE_CLAIMS = new Set([
  "nationalId",
  "passportNumber",
  "dateOfBirth",
  "biometricHash",
  "homeAddress",
  "bankAccount",
  "accountNumber",
]);

// In-memory sliding window request tracker for verifier rate/honeypot warnings
// verifierId -> timestamps in ms
const verifierRequestHistory: Map<string, number[]> = new Map();

function trackVerifierRequests(verifierId: string): number {
  const now = Date.now();
  const history = (verifierRequestHistory.get(verifierId) || []).filter((t) => now - t <= 60000);
  history.push(now);
  verifierRequestHistory.set(verifierId, history);
  return history.length;
}

/**
 * POST /api/verify/policy
 * Registers verifier policy with allowed claims.
 */
verifyRouter.post("/policy", (req: Request, res: Response) => {
  const { verifierId, name, allowedClaims } = req.body || {};

  if (!verifierId || typeof verifierId !== "string") {
    res.status(400).json({ error: "verifierId is required" });
    return;
  }
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!Array.isArray(allowedClaims)) {
    res.status(400).json({ error: "allowedClaims must be an array of claim names" });
    return;
  }

  const policy = {
    verifierId: verifierId.trim(),
    name: name.trim(),
    allowedClaims: allowedClaims.map((c) => String(c).trim()),
    registeredAt: new Date().toISOString(),
  };

  repository.savePolicy(policy);
  writeAuditLog({
    verifierId: policy.verifierId,
    action: "REGISTER_POLICY",
    decision: "ALLOW",
    reason: `Registered policy with ${policy.allowedClaims.length} allowed claims`,
  });

  res.status(201).json({ policy });
});

/**
 * GET /api/verify/policies
 * Returns list of registered verifier policies.
 */
verifyRouter.get("/policies", (_req: Request, res: Response) => {
  res.json({ policies: repository.getAllPolicies() });
});

/**
 * POST /api/verify/challenge
 * Issues a single-use verification challenge nonce with honeypot & policy protection.
 */
verifyRouter.post("/challenge", (req: Request, res: Response) => {
  const { verifierId, requestedClaims } = req.body || {};

  if (!verifierId || typeof verifierId !== "string") {
    res.status(400).json({ error: "verifierId is required" });
    return;
  }
  if (!Array.isArray(requestedClaims) || requestedClaims.length === 0) {
    res.status(400).json({ error: "requestedClaims must be a non-empty array of strings" });
    return;
  }

  const reqClaims = requestedClaims.map((c) => String(c).trim());
  const policy = repository.getPolicy(verifierId);
  const recentCount = trackVerifierRequests(verifierId);

  // Honeypot Protection Check 1: Unregistered verifier requesting sensitive claims
  if (!policy) {
    const sensitiveRequested = reqClaims.filter((c) => SENSITIVE_CLAIMS.has(c));
    if (sensitiveRequested.length > 0) {
      writeAuditLog({
        verifierId,
        action: "REQUEST_CHALLENGE",
        decision: "BLOCK",
        reason: `Unregistered verifier attempted to request sensitive claims: ${sensitiveRequested.join(", ")}`,
        details: { sensitiveCount: sensitiveRequested.length },
      });
      res.status(403).json({
        error: `Access Denied: Verifier '${verifierId}' is not registered and cannot request sensitive claims (${sensitiveRequested.join(", ")}).`,
        code: "UNREGISTERED_SENSITIVE_CLAIM_BLOCK",
      });
      return;
    }
  }

  // Honeypot Protection Check 2: Registered verifier exceeding its policy
  if (policy) {
    const disallowed = reqClaims.filter((c) => !policy.allowedClaims.includes(c));
    if (disallowed.length > 0) {
      writeAuditLog({
        verifierId,
        action: "REQUEST_CHALLENGE",
        decision: "BLOCK",
        reason: `Verifier exceeded registered policy with disallowed claims: ${disallowed.join(", ")}`,
        details: { disallowedCount: disallowed.length },
      });
      res.status(403).json({
        error: `Access Denied: Claims [${disallowed.join(", ")}] exceed the policy registered for '${policy.name}'.`,
        code: "POLICY_EXCEEDED_BLOCK",
      });
      return;
    }
  }

  // Non-blocking warnings
  const warnings: Array<{ code: string; message: string }> = [];

  if (!policy) {
    warnings.push({
      code: "UNREGISTERED_VERIFIER",
      message: `Verifier '${verifierId}' is not in the trusted policy registry. Proceed with caution.`,
    });
  }

  if (reqClaims.length > 6) {
    warnings.push({
      code: "OVER_COLLECTION",
      message: `Verifier requested ${reqClaims.length} claims (>6). Possible over-collection detected.`,
    });
  }

  if (recentCount >= 10) {
    warnings.push({
      code: "HIGH_REQUEST_RATE",
      message: `High request frequency (${recentCount} challenges within 60s). Possible automated scraping or honeypot behavior.`,
    });
  }

  const nonce = randomHex(16);
  const createdAt = Date.now();
  const expiresAt = createdAt + 5 * 60 * 1000; // 5 minutes TTL

  repository.saveChallenge({
    nonce,
    verifierId,
    createdAt,
    expiresAt,
  });

  writeAuditLog({
    verifierId,
    action: "REQUEST_CHALLENGE",
    decision: warnings.length > 0 ? "WARN" : "ALLOW",
    reason: warnings.length > 0 ? `Issued challenge with ${warnings.length} warning(s)` : "Issued valid challenge nonce",
    details: { claimCount: reqClaims.length, warnings: warnings.map((w) => w.code) },
  });

  res.status(201).json({
    nonce,
    verifierId,
    expiresAt: new Date(expiresAt).toISOString(),
    warnings,
  });
});

export interface VerificationCheckResult {
  id: number;
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * POST /api/verify/presentation
 * Evaluates the 8 core cryptographic and data-minimization checks.
 */
verifyRouter.post("/presentation", async (req: Request, res: Response) => {
  const { presentation, requestedClaims } = req.body || {};

  if (!presentation || typeof presentation !== "object") {
    res.status(400).json({ error: "presentation object is required" });
    return;
  }
  if (!Array.isArray(requestedClaims)) {
    res.status(400).json({ error: "requestedClaims array is required" });
    return;
  }

  const { credential, disclosedClaims, disclosedSalts, presentationProof } = presentation;
  if (!credential || !disclosedClaims || !disclosedSalts || !presentationProof) {
    res.status(400).json({ error: "presentation must contain credential, disclosedClaims, disclosedSalts, and presentationProof" });
    return;
  }

  const checks: VerificationCheckResult[] = [];
  const trustedIssuer = repository.getIssuer();

  // 1. Nonce exists, is fresh, and is consumed (deleted) on use
  const challengeCheck = repository.consumeChallenge(presentationProof.nonce);
  checks.push({
    id: 1,
    name: "Nonce Freshness and Single-Use Consumption",
    passed: challengeCheck.valid,
    detail: challengeCheck.valid
      ? `Nonce ${presentationProof.nonce} verified and consumed successfully.`
      : `Challenge failed: ${challengeCheck.reason || "Invalid nonce"}.`,
  });

  // 2. Issuer is trusted
  const isTrustedIssuer = credential.issuer === trustedIssuer.did;
  checks.push({
    id: 2,
    name: "Issuer Trust Verification",
    passed: isTrustedIssuer,
    detail: isTrustedIssuer
      ? `Issuer ${credential.issuer} is trusted by the VeriPass Authority.`
      : `Issuer ${credential.issuer} is not recognized by this verifier.`,
  });

  // 3. Issuer signature is valid
  let issuerSigValid = false;
  try {
    const docToVerify = {
      id: credential.id,
      type: credential.type,
      issuer: credential.issuer,
      subject: credential.subject,
      issuedAt: credential.issuedAt,
      claimDigests: credential.claimDigests,
    };
    issuerSigValid = verifyPayload(docToVerify, credential.proof.proofValue, credential.issuer);
  } catch {
    issuerSigValid = false;
  }
  checks.push({
    id: 3,
    name: "Issuer Cryptographic Signature",
    passed: issuerSigValid,
    detail: issuerSigValid
      ? "Issuer Ed25519 signature over canonical credential digests is authentic."
      : "Issuer signature is invalid or does not match public key.",
  });

  // 4. Credential is not revoked
  const revoked = repository.isRevoked(credential.id);
  checks.push({
    id: 4,
    name: "Credential Revocation Status",
    passed: !revoked,
    detail: !revoked
      ? `Credential ${credential.id} is active and not on the revocation list.`
      : `Credential ${credential.id} has been revoked by the issuer.`,
  });

  // 5. Credential subject matches the holder DID
  const subjectMatches = credential.subject === presentationProof.holder;
  checks.push({
    id: 5,
    name: "Holder Subject Binding",
    passed: subjectMatches,
    detail: subjectMatches
      ? `Credential subject matches presenting holder: ${credential.subject}.`
      : `Mismatch: credential subject (${credential.subject}) does not match holder (${presentationProof.holder}).`,
  });

  // 6. Holder signature is valid
  let holderSigValid = false;
  try {
    const revealedNames = Object.keys(disclosedClaims).sort();
    const holderPayload = {
      nonce: presentationProof.nonce,
      credentialId: credential.id,
      revealedClaimNames: revealedNames,
      holderDid: presentationProof.holder,
      timestamp: presentationProof.timestamp,
    };
    holderSigValid = verifyPayload(holderPayload, presentationProof.proofValue, presentationProof.holder);
  } catch {
    holderSigValid = false;
  }
  checks.push({
    id: 6,
    name: "Holder Authenticity and Proof of Possession",
    passed: holderSigValid,
    detail: holderSigValid
      ? "Holder Ed25519 signature authenticates selective disclosure without revealing private key."
      : "Holder presentation signature verification failed.",
  });

  // 7. Each revealed claim matches its salted digest
  let allDigestsMatch = true;
  const digestDetails: string[] = [];
  const revealedKeys = Object.keys(disclosedClaims);

  if (revealedKeys.length === 0) {
    allDigestsMatch = false;
    digestDetails.push("No claims revealed in presentation.");
  } else {
    for (const name of revealedKeys) {
      const val = disclosedClaims[name];
      const salt = disclosedSalts[name];
      const expectedDigest = credential.claimDigests[name];

      if (!salt) {
        allDigestsMatch = false;
        digestDetails.push(`Missing salt for claim '${name}'.`);
        continue;
      }
      if (!expectedDigest) {
        allDigestsMatch = false;
        digestDetails.push(`No commitment digest found for '${name}' in credential.`);
        continue;
      }

      const computedDigest = sha256(`${salt}:${name}:${String(val)}`);
      if (computedDigest !== expectedDigest) {
        allDigestsMatch = false;
        digestDetails.push(`Digest mismatch for '${name}': claim has been tampered with.`);
      }
    }
  }

  checks.push({
    id: 7,
    name: "Salted Claim Digest Integrity",
    passed: allDigestsMatch,
    detail: allDigestsMatch
      ? `All ${revealedKeys.length} disclosed claims match their salted cryptographic digests.`
      : `Integrity check failed: ${digestDetails.join("; ")}`,
  });

  // 8. No claim was disclosed beyond what was requested (data minimization)
  const reqSet = new Set(requestedClaims);
  const overDisclosed = revealedKeys.filter((k) => !reqSet.has(k));
  const dataMinimizationPassed = overDisclosed.length === 0;
  checks.push({
    id: 8,
    name: "Data Minimization and Zero Over-Disclosure",
    passed: dataMinimizationPassed,
    detail: dataMinimizationPassed
      ? `Strict minimization satisfied: only requested claims (${revealedKeys.join(", ")}) were disclosed.`
      : `Data minimization violated: over-disclosed claims [${overDisclosed.join(", ")}].`,
  });

  // On-chain anchor verification (optional)
  const commitment = computeCredentialCommitment(credential as VerifiableCredential);
  const onChain = await checkOnChainStatus(commitment);

  const verified = checks.every((c) => c.passed);

  writeAuditLog({
    verifierId: challengeCheck.verifierId || "unknown",
    action: "VERIFY_PRESENTATION",
    decision: verified ? "ALLOW" : "BLOCK",
    reason: verified ? "All 8 verification checks passed" : "One or more verification checks failed",
    details: {
      passedCount: checks.filter((c) => c.passed).length,
      totalCount: checks.length,
      onChainValid: onChain.isValid ?? null,
    },
  });

  res.json({
    verified,
    credentialId: credential.id,
    checks,
    onChain,
    summary: verified
      ? "Credential presentation is valid, authentic, and strictly minimized."
      : "Credential presentation failed cryptographic or policy validation.",
  });
});
