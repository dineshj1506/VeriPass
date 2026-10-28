import { describe, it, expect } from "vitest";
import { canonical, newKeyPair, didFromPublicKey, signPayload, verifyPayload, sha256, randomHex, } from "../crypto.js";
describe("Core Cryptography", () => {
    it("computes deterministic canonical JSON regardless of key insertion order", () => {
        const objA = { z: 1, a: "hello", m: { beta: [2, 1], alpha: true } };
        const objB = { m: { alpha: true, beta: [2, 1] }, a: "hello", z: 1 };
        const canonicalA = canonical(objA);
        const canonicalB = canonical(objB);
        expect(canonicalA).toBe(canonicalB);
        expect(canonicalA).toBe('{"a":"hello","m":{"alpha":true,"beta":[2,1]},"z":1}');
    });
    it("matches canonical test vector", () => {
        const testVector = {
            issuer: "did:veri:testIssuer123",
            issuedAt: "2026-10-13T00:00:00.000Z",
            claims: {
                country: "UTOPIA",
                ageOver21: true,
            },
        };
        const expected = '{"claims":{"ageOver21":true,"country":"UTOPIA"},"issuedAt":"2026-10-13T00:00:00.000Z","issuer":"did:veri:testIssuer123"}';
        expect(canonical(testVector)).toBe(expected);
    });
    it("generates an Ed25519 key pair with valid did:veri format", () => {
        const { did, publicKeyPem, privateKeyPem } = newKeyPair();
        expect(did).toMatch(/^did:veri:[A-Za-z0-9_-]{43}$/);
        expect(publicKeyPem).toContain("BEGIN PUBLIC KEY");
        expect(privateKeyPem).toContain("BEGIN PRIVATE KEY");
        const derivedDid = didFromPublicKey(publicKeyPem);
        expect(derivedDid).toBe(did);
    });
    it("signs and verifies payload successfully with PEM and DID", () => {
        const { did, publicKeyPem, privateKeyPem } = newKeyPair();
        const payload = {
            sub: did,
            nonce: randomHex(16),
            timestamp: Date.now(),
        };
        const signature = signPayload(payload, privateKeyPem);
        expect(typeof signature).toBe("string");
        expect(signature.length).toBeGreaterThan(20);
        // Verify using PEM
        expect(verifyPayload(payload, signature, publicKeyPem)).toBe(true);
        // Verify directly using DID
        expect(verifyPayload(payload, signature, did)).toBe(true);
    });
    it("detects tampered payload", () => {
        const { did, privateKeyPem } = newKeyPair();
        const payload = { amount: 100, recipient: "Alice" };
        const signature = signPayload(payload, privateKeyPem);
        const tampered = { amount: 1000, recipient: "Alice" };
        expect(verifyPayload(tampered, signature, did)).toBe(false);
    });
    it("computes standard SHA-256 and random hex", () => {
        const hash = sha256("veripass");
        expect(hash).toBe("39fa0f3c0c8a2b4d01f2cfd22d0e29d07111fb0289fe0a7923132c7bbbf1816e");
        const hex = randomHex(8);
        expect(hex).toHaveLength(16);
    });
});
