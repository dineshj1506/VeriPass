export interface WebAuthnCredential {
  id: string; // base64url credential id
  publicKey: string; // base64url public key or PEM
  counter: number;
  transports?: string[];
  createdAt: string;
}

export interface RecoveryConfig {
  guardians: string[]; // 3-7 guardian identifiers/emails
  threshold: number; // M where 2 <= M <= N
  configuredAt: string;
}

export interface RecoveryRequest {
  id: string;
  did: string;
  newPublicKeyPem: string;
  newDid: string;
  guardianCodes: Record<string, string>; // guardian identifier -> one-time approval code
  approvedGuardians: string[];
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: number;
  expiresAt: number;
}

export interface IdentityRecord {
  did: string;
  publicKeyPem: string;
  privateKeyPem: string;
  email?: string;
  ethAddress?: string;
  webauthnCredentials?: WebAuthnCredential[];
  recoveryConfig?: RecoveryConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialProof {
  type: "Ed25519Signature2020";
  created: string;
  verificationMethod: string;
  proofValue: string;
}

export interface VerifiableCredential {
  id: string;
  type: string[];
  issuer: string;
  subject: string;
  issuedAt: string;
  claimDigests: Record<string, string>; // name -> sha256(`${salt}:${name}:${value}`)
  proof: CredentialProof;
  revoked?: boolean;
  revokedAt?: string;
}

export interface HolderWalletCredential {
  credential: VerifiableCredential;
  claims: Record<string, string | number | boolean>;
  salts: Record<string, string>;
  onChainAnchored?: boolean;
  onChainCommitment?: string;
}

export interface ChallengeRecord {
  nonce: string;
  verifierId: string;
  createdAt: number;
  expiresAt: number;
  used?: boolean;
}

export interface VerifierPolicy {
  verifierId: string;
  name: string;
  allowedClaims: string[];
  registeredAt: string;
}

export interface BreachConsentRecord {
  did: string;
  emailHash: string; // never store raw email
  consentGiven: boolean;
  consentTimestamp: string;
  lastChecked?: string;
  breaches: Array<{
    name: string;
    title: string;
    domain: string;
    breachDate: string;
    dataClasses: string[];
  }>;
}

export interface DataStore {
  identities: Record<string, IdentityRecord>;
  issuerKeyPair: {
    did: string;
    publicKeyPem: string;
    privateKeyPem: string;
  };
  wallets: Record<string, HolderWalletCredential[]>; // holder DID -> array of credentials
  revocations: Record<string, { revokedAt: string; reason?: string }>;
  challenges: Record<string, ChallengeRecord>;
  policies: Record<string, VerifierPolicy>;
  recoveryRequests: Record<string, RecoveryRequest>;
  breaches: Record<string, BreachConsentRecord>;
}
