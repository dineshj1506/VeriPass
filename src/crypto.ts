import crypto from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Deterministic JSON stringifier with keys sorted recursively.
 * Must produce identical outputs across server and standalone scripts.
 */
export function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonical(item)).join(",") + "]";
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const pairs = sortedKeys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`);
  return "{" + pairs.join(",") + "}";
}

/**
 * SHA-256 hash returned as lowercase hex string.
 */
export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Generates secure random hex string.
 */
export function randomHex(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Extracts raw 32-byte Ed25519 public key from PEM SPKI.
 */
export function rawPublicKeyFromPem(pem: string): Buffer {
  const pubKey = crypto.createPublicKey(pem);
  const der = pubKey.export({ type: "spki", format: "der" });
  if (der.length < 32) {
    throw new Error("Invalid Ed25519 SPKI DER length");
  }
  return der.subarray(der.length - 32);
}

/**
 * Reconstructs a KeyObject from raw 32-byte public key buffer or base64url string.
 */
export function keyObjectFromRawPublicKey(raw: Buffer | string): crypto.KeyObject {
  const rawBuf = typeof raw === "string" ? Buffer.from(raw, "base64url") : raw;
  if (rawBuf.length !== 32) {
    throw new Error(`Expected 32-byte Ed25519 public key, got ${rawBuf.length}`);
  }
  const der = Buffer.concat([ED25519_SPKI_PREFIX, rawBuf]);
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

/**
 * Reconstructs a KeyObject from a DID string of the form did:veri:<base64url>.
 */
export function publicKeyFromDid(did: string): crypto.KeyObject {
  const prefix = "did:veri:";
  if (!did.startsWith(prefix)) {
    throw new Error(`Unsupported DID scheme: ${did}`);
  }
  const rawB64 = did.slice(prefix.length);
  return keyObjectFromRawPublicKey(rawB64);
}

/**
 * Derives a DID from an Ed25519 public key PEM or KeyObject.
 */
export function didFromPublicKey(key: string | crypto.KeyObject): string {
  const pem = typeof key === "string" ? key : key.export({ type: "spki", format: "pem" }).toString();
  const raw = rawPublicKeyFromPem(pem);
  return `did:veri:${raw.toString("base64url")}`;
}

export interface KeyPairResult {
  did: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

/**
 * Generates an Ed25519 key pair and associated DID.
 */
export function newKeyPair(): KeyPairResult {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const did = didFromPublicKey(publicKeyPem);

  return {
    did,
    publicKeyPem,
    privateKeyPem,
  };
}

/**
 * Signs a payload after canonicalizing it to deterministic JSON.
 * Returns base64url-encoded Ed25519 signature.
 */
export function signPayload(payload: unknown, privateKeyPem: string): string {
  const canonicalJson = canonical(payload);
  const data = Buffer.from(canonicalJson, "utf8");
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, data, privateKey);
  return sig.toString("base64url");
}

/**
 * Verifies a canonicalized payload signature using a public key PEM, KeyObject, or DID.
 */
export function verifyPayload(
  payload: unknown,
  signatureBase64Url: string,
  keyInput: string | crypto.KeyObject
): boolean {
  try {
    let key: crypto.KeyObject;
    if (typeof keyInput === "string") {
      if (keyInput.startsWith("did:veri:")) {
        key = publicKeyFromDid(keyInput);
      } else {
        key = crypto.createPublicKey(keyInput);
      }
    } else {
      key = keyInput;
    }

    const canonicalJson = canonical(payload);
    const data = Buffer.from(canonicalJson, "utf8");
    const sig = Buffer.from(signatureBase64Url, "base64url");
    return crypto.verify(null, data, key, sig);
  } catch {
    return false;
  }
}
