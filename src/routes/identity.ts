import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { newKeyPair, signPayload, sha256, randomHex } from "../crypto.js";
import { repository } from "../store.js";
import type { VerifiableCredential, HolderWalletCredential, CredentialProof } from "../types.js";

export const identityRouter = Router();

// Demo credential template datasets (Indian Format)
export const DEMO_CREDENTIAL_TEMPLATES: Record<string, { type: string; claims: Record<string, string | number | boolean> }> = {
  passport: {
    type: "PassportCredential",
    claims: {
      fullName: "Aarav Sharma",
      passportNumber: "Z6894321",
      nationality: "INDIAN",
      dateOfBirth: "1996-08-15",
      expiryDate: "2034-08-14",
      issuingCountry: "INDIA",
      placeOfIssue: "NEW DELHI",
      biometricHash: "bio_sha256_in_9f82d1a4",
    },
  },
  bank: {
    type: "BankStatementCredential",
    claims: {
      accountHolder: "Aarav Sharma",
      bankName: "State Bank of India (SBI)",
      accountNumber: "SBIN00012349876",
      balanceInr: 1540000,
      balanceUsd: 18500,
      currency: "INR",
      issueDate: "2026-10-01",
      verifiedProofOfFunds: true,
    },
  },
  insurance: {
    type: "InsuranceCredential",
    claims: {
      policyHolder: "Aarav Sharma",
      provider: "Star Health International Travel Shield",
      policyNumber: "SH-IN-992014",
      coverageAmountInr: 8000000,
      coverageAmountUsd: 100000,
      validUntil: "2027-12-31",
      repatriationIncluded: true,
    },
  },
  itinerary: {
    type: "ItineraryCredential",
    claims: {
      travelerName: "Aarav Sharma",
      airline: "Air India",
      flightNumber: "AI-143",
      departureAirport: "DEL (IGI Airport, New Delhi)",
      destinationCountry: "FRANCE",
      departureDate: "2026-11-10",
      returnDate: "2026-11-28",
      accommodationBooked: true,
    },
  },
};

/**
 * POST /api/identity/create
 * Creates a holder DID and key pair.
 */
identityRouter.post("/create", (req: Request, res: Response) => {
  const { email } = req.body || {};
  if (email && typeof email !== "string") {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  const keys = newKeyPair();
  const identity = {
    did: keys.did,
    publicKeyPem: keys.publicKeyPem,
    privateKeyPem: keys.privateKeyPem,
    email: email?.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  repository.saveIdentity(identity);

  // In this prototype, we return the DID and public info, plus privateKeyPem for the local demo holder simulation
  res.status(201).json({
    did: identity.did,
    publicKeyPem: identity.publicKeyPem,
    createdAt: identity.createdAt,
    email: identity.email,
  });
});

/**
 * GET /api/identity/:did
 * Returns public profile only, never private keys.
 */
identityRouter.get("/:did", (req: Request, res: Response) => {
  const did = String(req.params.did);
  const identity = repository.getIdentity(did);
  if (!identity) {
    res.status(404).json({ error: "Identity not found" });
    return;
  }

  // Never return private keys
  res.json({
    did: identity.did,
    publicKeyPem: identity.publicKeyPem,
    hasWebauthn: Boolean(identity.webauthnCredentials && identity.webauthnCredentials.length > 0),
    hasRecovery: Boolean(identity.recoveryConfig),
    ethAddress: identity.ethAddress || null,
    createdAt: identity.createdAt,
  });
});

/**
 * POST /api/identity/issue
 * Issuer ("VeriPass Demo Authority") issues a credential with salted digests.
 */
identityRouter.post("/issue", (req: Request, res: Response) => {
  const { subjectDid, type, claims } = req.body || {};

  if (!subjectDid || typeof subjectDid !== "string") {
    res.status(400).json({ error: "subjectDid is required" });
    return;
  }
  if (!type || typeof type !== "string") {
    res.status(400).json({ error: "type is required" });
    return;
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    res.status(400).json({ error: "claims object is required" });
    return;
  }

  const issuer = repository.getIssuer();
  const credentialId = `urn:uuid:${crypto.randomUUID()}`;
  const salts: Record<string, string> = {};
  const claimDigests: Record<string, string> = {};

  // For each claim: generate random 16-byte salt, compute sha256(salt:name:value)
  for (const [name, value] of Object.entries(claims)) {
    const salt = randomHex(16);
    salts[name] = salt;
    claimDigests[name] = sha256(`${salt}:${name}:${String(value)}`);
  }

  const credentialDocToSign = {
    id: credentialId,
    type: ["VerifiableCredential", type],
    issuer: issuer.did,
    subject: subjectDid,
    issuedAt: new Date().toISOString(),
    claimDigests,
  };

  const proofValue = signPayload(credentialDocToSign, issuer.privateKeyPem);
  const proof: CredentialProof = {
    type: "Ed25519Signature2020",
    created: new Date().toISOString(),
    verificationMethod: issuer.did,
    proofValue,
  };

  const fullCredential: VerifiableCredential = {
    ...credentialDocToSign,
    proof,
  };

  const walletItem: HolderWalletCredential = {
    credential: fullCredential,
    claims,
    salts,
  };

  repository.saveWalletCredential(subjectDid, walletItem);

  res.status(201).json({
    credential: fullCredential,
    claims,
    salts,
  });
});

/**
 * POST /api/identity/seed-demo
 * Issues standard 4 demo credentials for a holder DID.
 */
identityRouter.post("/seed-demo", (req: Request, res: Response) => {
  const { did } = req.body || {};
  if (!did || typeof did !== "string") {
    res.status(400).json({ error: "did is required" });
    return;
  }

  const issuer = repository.getIssuer();
  const issuedList: HolderWalletCredential[] = [];

  for (const [_key, template] of Object.entries(DEMO_CREDENTIAL_TEMPLATES)) {
    const credentialId = `urn:uuid:${crypto.randomUUID()}`;
    const salts: Record<string, string> = {};
    const claimDigests: Record<string, string> = {};

    for (const [name, value] of Object.entries(template.claims)) {
      const salt = randomHex(16);
      salts[name] = salt;
      claimDigests[name] = sha256(`${salt}:${name}:${String(value)}`);
    }

    const doc = {
      id: credentialId,
      type: ["VerifiableCredential", template.type],
      issuer: issuer.did,
      subject: did,
      issuedAt: new Date().toISOString(),
      claimDigests,
    };

    const proofValue = signPayload(doc, issuer.privateKeyPem);
    const proof: CredentialProof = {
      type: "Ed25519Signature2020",
      created: new Date().toISOString(),
      verificationMethod: issuer.did,
      proofValue,
    };

    const fullCred: VerifiableCredential = {
      ...doc,
      proof,
    };

    const walletItem: HolderWalletCredential = {
      credential: fullCred,
      claims: template.claims,
      salts,
    };

    repository.saveWalletCredential(did, walletItem);
    issuedList.push(walletItem);
  }

  res.status(201).json({ count: issuedList.length, credentials: issuedList });
});

/**
 * GET /api/identity/:did/wallet
 * Lists credentials with claims visible to the holder only.
 */
identityRouter.get("/:did/wallet", (req: Request, res: Response) => {
  const did = String(req.params.did);
  const wallet = repository.getWallet(did);
  res.json({ credentials: wallet });
});

/**
 * POST /api/identity/revoke
 * Marks a credential as revoked.
 */
identityRouter.post("/revoke", (req: Request, res: Response) => {
  const { credentialId, reason } = req.body || {};
  if (!credentialId || typeof credentialId !== "string") {
    res.status(400).json({ error: "credentialId is required" });
    return;
  }

  repository.revokeCredential(credentialId, reason);
  res.json({ status: "revoked", credentialId, revokedAt: new Date().toISOString() });
});

/**
 * POST /api/identity/present
 * Selective disclosure presentation builder.
 */
identityRouter.post("/present", (req: Request, res: Response) => {
  const { holderDid, credentialId, nonce, revealedClaimNames } = req.body || {};

  if (!holderDid || !credentialId || !nonce || !Array.isArray(revealedClaimNames)) {
    res.status(400).json({ error: "holderDid, credentialId, nonce, and revealedClaimNames are required" });
    return;
  }

  const identity = repository.getIdentity(holderDid);
  if (!identity) {
    res.status(404).json({ error: "Holder identity not found" });
    return;
  }

  const wallet = repository.getWallet(holderDid);
  const item = wallet.find((w) => w.credential.id === credentialId);
  if (!item) {
    res.status(404).json({ error: "Credential not found in holder wallet" });
    return;
  }

  // Filter revealed claims and salts
  const disclosedClaims: Record<string, string | number | boolean> = {};
  const disclosedSalts: Record<string, string> = {};

  for (const name of revealedClaimNames) {
    if (name in item.claims && name in item.salts) {
      disclosedClaims[name] = item.claims[name];
      disclosedSalts[name] = item.salts[name];
    }
  }

  // Holder signs { nonce, credentialId, revealedClaimNames, holderDid, timestamp }
  const presentationPayload = {
    nonce,
    credentialId,
    revealedClaimNames: [...revealedClaimNames].sort(),
    holderDid,
    timestamp: new Date().toISOString(),
  };

  const holderSignature = signPayload(presentationPayload, identity.privateKeyPem);

  const presentation = {
    credential: item.credential,
    disclosedClaims,
    disclosedSalts,
    presentationProof: {
      type: "Ed25519Signature2020",
      holder: holderDid,
      nonce,
      timestamp: presentationPayload.timestamp,
      proofValue: holderSignature,
    },
  };

  res.json({ presentation });
});
