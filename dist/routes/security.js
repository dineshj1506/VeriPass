import { Router } from "express";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, } from "@simplewebauthn/server";
import { didFromPublicKey, sha256, randomHex } from "../crypto.js";
import { repository, writeAuditLog } from "../store.js";
export const securityRouter = Router();
const RP_ID = process.env.RP_ID || "localhost";
const RP_NAME = process.env.RP_NAME || "VeriPass";
const EXPECTED_ORIGIN = process.env.ORIGIN || "http://localhost:5173";
// In-memory challenge store for WebAuthn registration/authentication
const webauthnChallenges = new Map();
// ==========================================
// Phase 6: Biometric Unlock (WebAuthn)
// ==========================================
/**
 * POST /api/security/webauthn/register/options
 */
securityRouter.post("/webauthn/register/options", async (req, res) => {
    const { did } = req.body || {};
    if (!did || typeof did !== "string") {
        res.status(400).json({ error: "did is required" });
        return;
    }
    const identity = repository.getIdentity(did);
    if (!identity) {
        res.status(404).json({ error: "Identity not found" });
        return;
    }
    try {
        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: RP_ID,
            userID: new Uint8Array(Buffer.from(did)),
            userName: did.slice(0, 20) + "...",
            userDisplayName: identity.email || "VeriPass Holder",
            attestationType: "none",
            authenticatorSelection: {
                authenticatorAttachment: "platform",
                userVerification: "required",
                residentKey: "preferred",
            },
        });
        webauthnChallenges.set(`reg:${did}`, options.challenge);
        res.json(options);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to generate WebAuthn options", detail: String(err) });
    }
});
/**
 * POST /api/security/webauthn/register/verify
 */
securityRouter.post("/webauthn/register/verify", async (req, res) => {
    const { did, response } = req.body || {};
    if (!did || !response) {
        res.status(400).json({ error: "did and WebAuthn response are required" });
        return;
    }
    const identity = repository.getIdentity(did);
    if (!identity) {
        res.status(404).json({ error: "Identity not found" });
        return;
    }
    const expectedChallenge = webauthnChallenges.get(`reg:${did}`);
    if (!expectedChallenge) {
        res.status(400).json({ error: "No pending registration challenge found" });
        return;
    }
    try {
        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: EXPECTED_ORIGIN,
            expectedRPID: RP_ID,
            requireUserVerification: true,
        });
        if (verification.verified && verification.registrationInfo) {
            const { credential } = verification.registrationInfo;
            const credRecord = {
                id: credential.id,
                publicKey: Buffer.from(credential.publicKey).toString("base64url"),
                counter: credential.counter,
                createdAt: new Date().toISOString(),
            };
            if (!identity.webauthnCredentials) {
                identity.webauthnCredentials = [];
            }
            identity.webauthnCredentials.push(credRecord);
            repository.saveIdentity(identity);
            webauthnChallenges.delete(`reg:${did}`);
            writeAuditLog({
                action: "WEBAUTHN_ENROLL",
                decision: "ALLOW",
                reason: "Enrolled platform biometric authenticator",
                details: { did, credentialId: credRecord.id },
            });
            res.json({ verified: true, credentialId: credRecord.id });
        }
        else {
            res.status(400).json({ verified: false, error: "WebAuthn attestation verification failed" });
        }
    }
    catch (err) {
        res.status(400).json({ verified: false, error: err instanceof Error ? err.message : String(err) });
    }
});
/**
 * POST /api/security/webauthn/authenticate/options
 */
securityRouter.post("/webauthn/authenticate/options", async (req, res) => {
    const { did } = req.body || {};
    if (!did || typeof did !== "string") {
        res.status(400).json({ error: "did is required" });
        return;
    }
    const identity = repository.getIdentity(did);
    if (!identity || !identity.webauthnCredentials || identity.webauthnCredentials.length === 0) {
        res.status(400).json({ error: "No biometric credentials enrolled for this identity" });
        return;
    }
    try {
        const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            allowCredentials: identity.webauthnCredentials.map((c) => ({
                id: c.id,
                type: "public-key",
            })),
            userVerification: "required",
        });
        webauthnChallenges.set(`auth:${did}`, options.challenge);
        res.json(options);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to generate authentication options", detail: String(err) });
    }
});
/**
 * POST /api/security/webauthn/authenticate/verify
 */
securityRouter.post("/webauthn/authenticate/verify", async (req, res) => {
    const { did, response } = req.body || {};
    if (!did || !response) {
        res.status(400).json({ error: "did and response are required" });
        return;
    }
    const identity = repository.getIdentity(did);
    if (!identity || !identity.webauthnCredentials) {
        res.status(404).json({ error: "Identity or credentials not found" });
        return;
    }
    const expectedChallenge = webauthnChallenges.get(`auth:${did}`);
    if (!expectedChallenge) {
        res.status(400).json({ error: "No pending authentication challenge found" });
        return;
    }
    const credential = identity.webauthnCredentials.find((c) => c.id === response.id);
    if (!credential) {
        res.status(400).json({ error: "Unrecognized credential ID" });
        return;
    }
    try {
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: EXPECTED_ORIGIN,
            expectedRPID: RP_ID,
            credential: {
                id: credential.id,
                publicKey: new Uint8Array(Buffer.from(credential.publicKey, "base64url")),
                counter: credential.counter,
            },
            requireUserVerification: true,
        });
        if (verification.verified) {
            credential.counter = verification.authenticationInfo.newCounter;
            repository.saveIdentity(identity);
            webauthnChallenges.delete(`auth:${did}`);
            writeAuditLog({
                action: "WEBAUTHN_UNLOCK",
                decision: "ALLOW",
                reason: "Biometric assertion verified successfully",
                details: { did },
            });
            res.json({ verified: true, unlockedAt: new Date().toISOString() });
        }
        else {
            res.status(400).json({ verified: false, error: "Assertion verification failed" });
        }
    }
    catch (err) {
        res.status(400).json({ verified: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ==========================================
// Phase 7: Social Recovery & Key Rotation
// ==========================================
/**
 * POST /api/security/recovery/setup
 */
securityRouter.post("/recovery/setup", (req, res) => {
    const { did, guardians, threshold } = req.body || {};
    if (!did || !Array.isArray(guardians) || typeof threshold !== "number") {
        res.status(400).json({ error: "did, guardians (array), and threshold (number) are required" });
        return;
    }
    if (guardians.length < 3 || guardians.length > 7) {
        res.status(400).json({ error: "Guardian count must be between 3 and 7" });
        return;
    }
    if (threshold < 2 || threshold > guardians.length) {
        res.status(400).json({ error: `Threshold must be between 2 and ${guardians.length}` });
        return;
    }
    const identity = repository.getIdentity(did);
    if (!identity) {
        res.status(404).json({ error: "Identity not found" });
        return;
    }
    identity.recoveryConfig = {
        guardians: guardians.map((g) => String(g).trim()),
        threshold,
        configuredAt: new Date().toISOString(),
    };
    repository.saveIdentity(identity);
    res.status(200).json({
        message: "Social recovery configured successfully",
        recoveryConfig: identity.recoveryConfig,
    });
});
/**
 * POST /api/security/recovery/initiate
 */
securityRouter.post("/recovery/initiate", (req, res) => {
    const { did, newPublicKeyPem } = req.body || {};
    if (!did || !newPublicKeyPem) {
        res.status(400).json({ error: "did and newPublicKeyPem are required" });
        return;
    }
    const identity = repository.getIdentity(did);
    if (!identity || !identity.recoveryConfig) {
        res.status(400).json({ error: "Social recovery is not configured for this identity" });
        return;
    }
    const newDid = didFromPublicKey(newPublicKeyPem);
    const requestId = `rec-${randomHex(8)}`;
    const guardianCodes = {};
    for (const guardian of identity.recoveryConfig.guardians) {
        // 6-digit one-time approval code
        guardianCodes[guardian] = Math.floor(100000 + Math.random() * 900000).toString();
    }
    const recoveryRequest = {
        id: requestId,
        did,
        newPublicKeyPem,
        newDid,
        guardianCodes,
        approvedGuardians: [],
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 72 * 60 * 60 * 1000, // 72 hours
    };
    repository.saveRecoveryRequest(recoveryRequest);
    res.status(201).json({
        requestId,
        did,
        threshold: identity.recoveryConfig.threshold,
        totalGuardians: identity.recoveryConfig.guardians.length,
        guardianCodes, // Shown in demo UI; in production sent via secure channels
        expiresAt: new Date(recoveryRequest.expiresAt).toISOString(),
        demoNote: "Approval codes are displayed here for demo simulation. Real email delivery is out of scope.",
    });
});
/**
 * POST /api/security/recovery/approve
 */
securityRouter.post("/recovery/approve", (req, res) => {
    const { requestId, guardian, approvalCode } = req.body || {};
    if (!requestId || !guardian || !approvalCode) {
        res.status(400).json({ error: "requestId, guardian, and approvalCode are required" });
        return;
    }
    const request = repository.getRecoveryRequest(requestId);
    if (!request) {
        res.status(404).json({ error: "Recovery request not found" });
        return;
    }
    if (Date.now() > request.expiresAt) {
        request.status = "expired";
        repository.saveRecoveryRequest(request);
        res.status(400).json({ error: "Recovery request has expired" });
        return;
    }
    if (request.status !== "pending") {
        res.status(400).json({ error: `Recovery request is already ${request.status}` });
        return;
    }
    // Validate approval code
    if (request.guardianCodes[guardian] !== String(approvalCode).trim()) {
        res.status(400).json({ error: "Invalid guardian approval code" });
        return;
    }
    // Duplicate approvals must not count twice
    if (request.approvedGuardians.includes(guardian)) {
        res.status(400).json({ error: "Guardian has already approved this request" });
        return;
    }
    request.approvedGuardians.push(guardian);
    const identity = repository.getIdentity(request.did);
    const threshold = identity?.recoveryConfig?.threshold || 2;
    if (request.approvedGuardians.length >= threshold) {
        request.status = "approved";
    }
    repository.saveRecoveryRequest(request);
    res.json({
        status: request.status,
        approvalsCount: request.approvedGuardians.length,
        threshold,
        approved: request.status === "approved",
        approvedGuardians: request.approvedGuardians,
    });
});
/**
 * POST /api/security/recovery/complete
 * Rotates key and authorizes re-enrollment while keeping DID stable.
 */
securityRouter.post("/recovery/complete", (req, res) => {
    const { requestId } = req.body || {};
    if (!requestId) {
        res.status(400).json({ error: "requestId is required" });
        return;
    }
    const request = repository.getRecoveryRequest(requestId);
    if (!request) {
        res.status(404).json({ error: "Recovery request not found" });
        return;
    }
    if (request.status !== "approved") {
        res.status(400).json({ error: "Recovery request threshold has not been met" });
        return;
    }
    const identity = repository.getIdentity(request.did);
    if (!identity) {
        res.status(404).json({ error: "Identity not found" });
        return;
    }
    // Rotate key while keeping DID stable (updating identity.publicKeyPem)
    identity.publicKeyPem = request.newPublicKeyPem;
    identity.updatedAt = new Date().toISOString();
    repository.saveIdentity(identity);
    writeAuditLog({
        action: "KEY_ROTATION",
        decision: "ALLOW",
        reason: `Completed key rotation via social recovery (request ${requestId})`,
        details: { did: identity.did },
    });
    res.json({
        success: true,
        did: identity.did,
        message: "Identity key rotated successfully. Device re-enrolled.",
        updatedAt: identity.updatedAt,
    });
});
// ==========================================
// Phase 10: Dark Web Alerts
// ==========================================
const MOCK_BREACH_DATA = [
    {
        name: "GlobalAirways2024",
        title: "Global Airways Passenger Leak",
        domain: "globalairways.com",
        breachDate: "2024-03-12",
        dataClasses: ["Email addresses", "Passport numbers", "Flight itineraries"],
    },
    {
        name: "HotelRewardsNexus",
        title: "Nexus Hotel Loyalty Breach",
        domain: "nexusrewards.com",
        breachDate: "2023-11-05",
        dataClasses: ["Email addresses", "Phone numbers", "Physical addresses"],
    },
];
/**
 * POST /api/security/darkweb/check
 */
securityRouter.post("/darkweb/check", async (req, res) => {
    const { did, email, consent } = req.body || {};
    if (!consent) {
        res.status(400).json({ error: "Explicit consent is required before performing dark web breach checks." });
        return;
    }
    if (!did || !email || typeof email !== "string") {
        res.status(400).json({ error: "did and email are required" });
        return;
    }
    const emailHash = sha256(email.toLowerCase().trim());
    let breaches = MOCK_BREACH_DATA;
    let isDemoData = true;
    const hibpKey = process.env.HIBP_API_KEY;
    if (hibpKey) {
        try {
            const response = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`, {
                headers: {
                    "hibp-api-key": hibpKey,
                    "user-agent": "VeriPass-SelfSovereign-DigitalPassport",
                },
            });
            if (response.status === 200) {
                const data = (await response.json());
                breaches = data.map((b) => ({
                    name: b.Name,
                    title: b.Title,
                    domain: b.Domain,
                    breachDate: b.BreachDate,
                    dataClasses: b.DataClasses,
                }));
                isDemoData = false;
            }
            else if (response.status === 404) {
                breaches = [];
                isDemoData = false;
            }
        }
        catch {
            // Graceful fallback to mock data on network error
            isDemoData = true;
        }
    }
    const record = {
        did,
        emailHash, // Never store email in plaintext
        consentGiven: true,
        consentTimestamp: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
        breaches,
    };
    repository.saveBreachRecord(record);
    writeAuditLog({
        action: "DARK_WEB_CHECK",
        decision: "ALLOW",
        reason: `Breach check performed with user consent (${breaches.length} found)`,
        details: { did, breachCount: breaches.length, isDemoData },
    });
    res.json({
        breaches,
        emailHash,
        isDemoData,
        lastChecked: record.lastChecked,
    });
});
/**
 * DELETE /api/security/darkweb/consent
 */
securityRouter.delete("/darkweb/consent", (req, res) => {
    const { did } = req.body || {};
    if (!did) {
        res.status(400).json({ error: "did is required" });
        return;
    }
    repository.deleteBreachRecord(did);
    writeAuditLog({
        action: "REVOKE_BREACH_CONSENT",
        decision: "ALLOW",
        reason: "User revoked dark web check consent and purged stored records",
        details: { did },
    });
    res.json({ message: "Consent revoked and stored breach results purged." });
});
/**
 * GET /api/security/darkweb/:did
 */
securityRouter.get("/darkweb/:did", (req, res) => {
    const did = String(req.params.did);
    const record = repository.getBreachRecord(did);
    if (!record) {
        res.json({ consentGiven: false, breaches: [] });
        return;
    }
    res.json({
        consentGiven: record.consentGiven,
        lastChecked: record.lastChecked,
        breaches: record.breaches,
    });
});
