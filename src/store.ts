import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newKeyPair } from "./crypto.js";
import type { DataStore, IdentityRecord, HolderWalletCredential, VerifiableCredential, VerifierPolicy, RecoveryRequest, BreachConsentRecord } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, "../data.json");
const AUDIT_DIR = path.resolve(__dirname, "../data");
const AUDIT_LOG = path.resolve(AUDIT_DIR, "audit.log");

// TODO: Migrate store to PostgreSQL repository in production.
// Replace this single-file JSON repository with a connection pool (e.g. pg / Prisma)
// and implement partitioned tables for identities, credentials, audit logs, and revocations.

let memoryStore: DataStore | null = null;

function initDefaultStore(): DataStore {
  const issuerKey = newKeyPair();
  return {
    identities: {},
    issuerKeyPair: issuerKey,
    wallets: {},
    revocations: {},
    challenges: {},
    policies: {
      "immigration-delhi-airport": {
        verifierId: "immigration-delhi-airport",
        name: "Bureau of Immigration (BOI) - IGI Airport New Delhi",
        allowedClaims: [
          "passportNumber",
          "nationality",
          "fullName",
          "dateOfBirth",
          "expiryDate",
          "visaStatus",
        ],
        registeredAt: new Date().toISOString(),
      },
      "hotel-checkin": {
        verifierId: "hotel-checkin",
        name: "Taj Palace & IRCTC Hospitality Gate",
        allowedClaims: ["fullName", "nationality"],
        registeredAt: new Date().toISOString(),
      },
      "digilocker-kyc": {
        verifierId: "digilocker-kyc",
        name: "DigiLocker KYC Trust Network",
        allowedClaims: ["fullName", "passportNumber", "dateOfBirth"],
        registeredAt: new Date().toISOString(),
      },
    },
    recoveryRequests: {},
    breaches: {},
  };
}

export function loadStore(): DataStore {
  if (memoryStore) {
    return memoryStore;
  }

  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      memoryStore = JSON.parse(raw) as DataStore;
      return memoryStore;
    } catch {
      console.warn("Failed to parse data.json, initializing clean store.");
    }
  }

  memoryStore = initDefaultStore();
  saveStore(memoryStore);
  return memoryStore;
}

export function saveStore(store: DataStore): void {
  memoryStore = store;
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist store to data.json", err);
  }
}

/**
 * Append-only audit logger for anti-honeypot and verification events.
 * Never logs raw claim values or secrets.
 */
export function writeAuditLog(entry: {
  verifierId?: string;
  action: string;
  decision: "ALLOW" | "BLOCK" | "WARN";
  reason: string;
  details?: Record<string, unknown>;
}): void {
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }) + "\n";
    fs.appendFileSync(AUDIT_LOG, logLine, "utf-8");
  } catch (err) {
    console.error("Failed to write to audit log", err);
  }
}

// Store Repository Methods
export const repository = {
  getIssuer() {
    return loadStore().issuerKeyPair;
  },

  getIdentity(did: string): IdentityRecord | undefined {
    return loadStore().identities[did];
  },

  saveIdentity(identity: IdentityRecord): void {
    const store = loadStore();
    store.identities[identity.did] = identity;
    saveStore(store);
  },

  getWallet(did: string): HolderWalletCredential[] {
    return loadStore().wallets[did] || [];
  },

  saveWalletCredential(did: string, cred: HolderWalletCredential): void {
    const store = loadStore();
    if (!store.wallets[did]) {
      store.wallets[did] = [];
    }
    store.wallets[did].push(cred);
    saveStore(store);
  },

  revokeCredential(credentialId: string, reason?: string): boolean {
    const store = loadStore();
    store.revocations[credentialId] = {
      revokedAt: new Date().toISOString(),
      reason: reason || "Revoked by issuer/holder",
    };
    // Update any wallet credential flags
    for (const did of Object.keys(store.wallets)) {
      for (const item of store.wallets[did]) {
        if (item.credential.id === credentialId) {
          item.credential.revoked = true;
          item.credential.revokedAt = store.revocations[credentialId].revokedAt;
        }
      }
    }
    saveStore(store);
    return true;
  },

  isRevoked(credentialId: string): boolean {
    const store = loadStore();
    return Boolean(store.revocations[credentialId]);
  },

  saveChallenge(challenge: { nonce: string; verifierId: string; createdAt: number; expiresAt: number }): void {
    const store = loadStore();
    store.challenges[challenge.nonce] = { ...challenge, used: false };
    saveStore(store);
  },

  consumeChallenge(nonce: string): { valid: boolean; verifierId?: string; reason?: string } {
    const store = loadStore();
    const challenge = store.challenges[nonce];
    if (!challenge) {
      return { valid: false, reason: "Challenge nonce not found" };
    }
    if (challenge.used) {
      return { valid: false, reason: "Challenge nonce already consumed" };
    }
    if (Date.now() > challenge.expiresAt) {
      delete store.challenges[nonce];
      saveStore(store);
      return { valid: false, reason: "Challenge nonce expired" };
    }

    challenge.used = true;
    delete store.challenges[nonce]; // Single-use consumption
    saveStore(store);
    return { valid: true, verifierId: challenge.verifierId };
  },

  getPolicy(verifierId: string): VerifierPolicy | undefined {
    return loadStore().policies[verifierId];
  },

  savePolicy(policy: VerifierPolicy): void {
    const store = loadStore();
    store.policies[policy.verifierId] = policy;
    saveStore(store);
  },

  getAllPolicies(): VerifierPolicy[] {
    return Object.values(loadStore().policies);
  },

  saveRecoveryRequest(request: RecoveryRequest): void {
    const store = loadStore();
    store.recoveryRequests[request.id] = request;
    saveStore(store);
  },

  getRecoveryRequest(id: string): RecoveryRequest | undefined {
    return loadStore().recoveryRequests[id];
  },

  getBreachRecord(did: string): BreachConsentRecord | undefined {
    return loadStore().breaches[did];
  },

  saveBreachRecord(record: BreachConsentRecord): void {
    const store = loadStore();
    store.breaches[record.did] = record;
    saveStore(store);
  },

  deleteBreachRecord(did: string): void {
    const store = loadStore();
    delete store.breaches[did];
    saveStore(store);
  },

  resetForTests(): void {
    memoryStore = initDefaultStore();
    saveStore(memoryStore);
  },
};
