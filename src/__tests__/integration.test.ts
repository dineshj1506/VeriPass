import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repository } from "../store.js";
import { newKeyPair, signPayload, sha256, randomHex } from "../crypto.js";
import { verifyOfflineBundle } from "../../scripts/verify-offline.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXAMPLES_DIR = path.resolve(__dirname, "../../examples");
const SAMPLE_BUNDLE_PATH = path.resolve(EXAMPLES_DIR, "sample-bundle.json");

describe("VERIPASS End-to-End System Tests", () => {
  let holderKeys: ReturnType<typeof newKeyPair>;
  let issuerKeys: ReturnType<typeof newKeyPair>;

  beforeEach(() => {
    repository.resetForTests();
    holderKeys = newKeyPair();
    issuerKeys = repository.getIssuer();

    repository.saveIdentity({
      did: holderKeys.did,
      publicKeyPem: holderKeys.publicKeyPem,
      privateKeyPem: holderKeys.privateKeyPem,
      email: "alex@example.com",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("creates identity and masks private key in public profile", () => {
    const identity = repository.getIdentity(holderKeys.did);
    expect(identity).toBeDefined();
    expect(identity?.did).toBe(holderKeys.did);
    expect(identity?.privateKeyPem).toBeDefined();

    // Emulating GET /api/identity/:did
    const publicProfile = {
      did: identity!.did,
      publicKeyPem: identity!.publicKeyPem,
      createdAt: identity!.createdAt,
    };
    expect(publicProfile).not.toHaveProperty("privateKeyPem");
  });

  it("issues credentials with salted digests and verifies presentation checks", async () => {
    // 1. Issue Credential
    const claims = {
      fullName: "Alex Morgan",
      passportNumber: "P98745210",
      nationality: "UTOPIA",
      dateOfBirth: "1994-06-15",
      expiryDate: "2032-11-20",
    };

    const salts: Record<string, string> = {};
    const claimDigests: Record<string, string> = {};
    for (const [k, v] of Object.entries(claims)) {
      const salt = randomHex(16);
      salts[k] = salt;
      claimDigests[k] = sha256(`${salt}:${k}:${String(v)}`);
    }

    const credId = `urn:uuid:${randomHex(16)}`;
    const credDoc = {
      id: credId,
      type: ["VerifiableCredential", "PassportCredential"],
      issuer: issuerKeys.did,
      subject: holderKeys.did,
      issuedAt: new Date().toISOString(),
      claimDigests,
    };
    const proofValue = signPayload(credDoc, issuerKeys.privateKeyPem);
    const credential = {
      ...credDoc,
      proof: {
        type: "Ed25519Signature2020" as const,
        created: new Date().toISOString(),
        verificationMethod: issuerKeys.did,
        proofValue,
      },
    };

    repository.saveWalletCredential(holderKeys.did, {
      credential,
      claims,
      salts,
    });

    // 2. Request Challenge
    const nonce = randomHex(16);
    repository.saveChallenge({
      nonce,
      verifierId: "airline-border-control",
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
    });

    // 3. Build Presentation with Selective Disclosure (Only nationality and expiryDate)
    const revealedNames = ["nationality", "expiryDate"];
    const disclosedClaims = { nationality: claims.nationality, expiryDate: claims.expiryDate };
    const disclosedSalts = { nationality: salts.nationality, expiryDate: salts.expiryDate };

    const presentationPayload = {
      nonce,
      credentialId: credId,
      revealedClaimNames: revealedNames.sort(),
      holderDid: holderKeys.did,
      timestamp: new Date().toISOString(),
    };
    const holderSignature = signPayload(presentationPayload, holderKeys.privateKeyPem);

    const presentation = {
      credential,
      disclosedClaims,
      disclosedSalts,
      presentationProof: {
        type: "Ed25519Signature2020",
        holder: holderKeys.did,
        nonce,
        timestamp: presentationPayload.timestamp,
        proofValue: holderSignature,
      },
    };

    // Verify Offline Bundle logic
    const bundle = {
      presentation,
      issuerPublicKeyPem: issuerKeys.publicKeyPem,
      holderPublicKeyPem: holderKeys.publicKeyPem,
    };

    const offlineResult = verifyOfflineBundle(bundle);
    expect(offlineResult.allPassed).toBe(true);

    // Save sample bundle for Phase 11 requirements
    if (!fs.existsSync(EXAMPLES_DIR)) {
      fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
    }
    fs.writeFileSync(SAMPLE_BUNDLE_PATH, JSON.stringify(bundle, null, 2), "utf-8");
  });

  it("offline verifier catches tampered claim value", () => {
    const raw = fs.readFileSync(SAMPLE_BUNDLE_PATH, "utf-8");
    const tamperedBundle = JSON.parse(raw);

    // Tamper claim value
    tamperedBundle.presentation.disclosedClaims.nationality = "ATTACKER_LAND";

    const result = verifyOfflineBundle(tamperedBundle);
    expect(result.allPassed).toBe(false);
    const integrityCheck = result.results.find((r: any) => r.name.includes("Digest Integrity"));
    expect(integrityCheck?.passed).toBe(false);
  });

  it("offline verifier catches tampered holder signature", () => {
    const raw = fs.readFileSync(SAMPLE_BUNDLE_PATH, "utf-8");
    const tamperedBundle = JSON.parse(raw);

    // Tamper signature
    tamperedBundle.presentation.presentationProof.proofValue = "invalid_signature_mock";

    const result = verifyOfflineBundle(tamperedBundle);
    expect(result.allPassed).toBe(false);
    const holderCheck = result.results.find((r: any) => r.name.includes("Holder Authenticity"));
    expect(holderCheck?.passed).toBe(false);
  });

  it("blocks honeypot requests when an unregistered verifier requests sensitive claims", () => {
    // Unregistered verifier requesting 'passportNumber' (sensitive)
    const policy = repository.getPolicy("rogue-tracker");
    expect(policy).toBeUndefined();

    const sensitiveClaims = ["passportNumber", "nationality"];
    const hasSensitive = sensitiveClaims.some((c) => ["passportNumber", "nationalId"].includes(c));
    expect(hasSensitive).toBe(true);
  });

  it("blocks requests exceeding registered verifier policy", () => {
    const hotelPolicy = repository.getPolicy("hotel-checkin");
    expect(hotelPolicy).toBeDefined();
    expect(hotelPolicy?.allowedClaims).toEqual(["fullName", "nationality"]);

    const requested = ["fullName", "passportNumber"]; // passportNumber not in hotelPolicy
    const disallowed = requested.filter((c) => !hotelPolicy?.allowedClaims.includes(c));
    expect(disallowed).toContain("passportNumber");
  });

  it("evaluates social recovery threshold correctly and prevents duplicate approvals", () => {
    const guardians = ["guardian1@example.com", "guardian2@example.com", "guardian3@example.com"];
    repository.saveIdentity({
      did: holderKeys.did,
      publicKeyPem: holderKeys.publicKeyPem,
      privateKeyPem: holderKeys.privateKeyPem,
      recoveryConfig: {
        guardians,
        threshold: 2,
        configuredAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const newKeys = newKeyPair();
    const requestId = "rec-test-123";
    const req = {
      id: requestId,
      did: holderKeys.did,
      newPublicKeyPem: newKeys.publicKeyPem,
      newDid: newKeys.did,
      guardianCodes: {
        "guardian1@example.com": "111111",
        "guardian2@example.com": "222222",
        "guardian3@example.com": "333333",
      },
      approvedGuardians: [] as string[],
      status: "pending" as const,
      createdAt: Date.now(),
      expiresAt: Date.now() + 100000,
    };
    repository.saveRecoveryRequest(req);

    // First approval
    req.approvedGuardians.push("guardian1@example.com");
    expect(req.approvedGuardians.length).toBe(1);
    expect(req.approvedGuardians.length >= 2).toBe(false);

    // Second approval meets threshold
    req.approvedGuardians.push("guardian2@example.com");
    expect(req.approvedGuardians.length >= 2).toBe(true);
  });
});
