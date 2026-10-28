const API_BASE = (import.meta.env.VITE_API_URL as string) || "";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Identity
  createIdentity: (email?: string) =>
    request<{ did: string; publicKeyPem: string; createdAt: string; email?: string }>(
      "/api/identity/create",
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  getIdentity: (did: string) =>
    request<{
      did: string;
      publicKeyPem: string;
      hasWebauthn: boolean;
      hasRecovery: boolean;
      ethAddress: string | null;
      createdAt: string;
    }>(`/api/identity/${encodeURIComponent(did)}`),

  seedDemoCredentials: (did: string) =>
    request<{ count: number; credentials: any[] }>("/api/identity/seed-demo", {
      method: "POST",
      body: JSON.stringify({ did }),
    }),

  getWallet: (did: string) =>
    request<{ credentials: any[] }>(`/api/identity/${encodeURIComponent(did)}/wallet`),

  revokeCredential: (credentialId: string, reason?: string) =>
    request<{ status: string; credentialId: string; revokedAt: string }>("/api/identity/revoke", {
      method: "POST",
      body: JSON.stringify({ credentialId, reason }),
    }),

  buildPresentation: (holderDid: string, credentialId: string, nonce: string, revealedClaimNames: string[]) =>
    request<{ presentation: any }>("/api/identity/present", {
      method: "POST",
      body: JSON.stringify({ holderDid, credentialId, nonce, revealedClaimNames }),
    }),

  // Verification & Honeypot Defense
  requestChallenge: (verifierId: string, requestedClaims: string[]) =>
    request<{
      nonce: string;
      verifierId: string;
      expiresAt: string;
      warnings: Array<{ code: string; message: string }>;
    }>("/api/verify/challenge", {
      method: "POST",
      body: JSON.stringify({ verifierId, requestedClaims }),
    }),

  verifyPresentation: (presentation: any, requestedClaims: string[]) =>
    request<{
      verified: boolean;
      credentialId: string;
      checks: Array<{ id: number; name: string; passed: boolean; detail: string }>;
      onChain?: any;
      summary: string;
    }>("/api/verify/presentation", {
      method: "POST",
      body: JSON.stringify({ presentation, requestedClaims }),
    }),

  getPolicies: () =>
    request<{ policies: Array<{ verifierId: string; name: string; allowedClaims: string[] }> }>(
      "/api/verify/policies"
    ),

  registerPolicy: (verifierId: string, name: string, allowedClaims: string[]) =>
    request<{ policy: any }>("/api/verify/policy", {
      method: "POST",
      body: JSON.stringify({ verifierId, name, allowedClaims }),
    }),

  // WebAuthn Biometrics
  getWebAuthnRegisterOptions: (did: string) =>
    request<any>("/api/security/webauthn/register/options", {
      method: "POST",
      body: JSON.stringify({ did }),
    }),

  verifyWebAuthnRegister: (did: string, response: any) =>
    request<{ verified: boolean; credentialId: string }>("/api/security/webauthn/register/verify", {
      method: "POST",
      body: JSON.stringify({ did, response }),
    }),

  getWebAuthnAuthenticateOptions: (did: string) =>
    request<any>("/api/security/webauthn/authenticate/options", {
      method: "POST",
      body: JSON.stringify({ did }),
    }),

  verifyWebAuthnAuthenticate: (did: string, response: any) =>
    request<{ verified: boolean; unlockedAt: string }>("/api/security/webauthn/authenticate/verify", {
      method: "POST",
      body: JSON.stringify({ did, response }),
    }),

  // Social Recovery & Key Rotation
  setupRecovery: (did: string, guardians: string[], threshold: number) =>
    request<{ message: string; recoveryConfig: any }>("/api/security/recovery/setup", {
      method: "POST",
      body: JSON.stringify({ did, guardians, threshold }),
    }),

  initiateRecovery: (did: string, newPublicKeyPem: string) =>
    request<{
      requestId: string;
      did: string;
      threshold: number;
      totalGuardians: number;
      guardianCodes: Record<string, string>;
      expiresAt: string;
      demoNote: string;
    }>("/api/security/recovery/initiate", {
      method: "POST",
      body: JSON.stringify({ did, newPublicKeyPem }),
    }),

  approveRecovery: (requestId: string, guardian: string, approvalCode: string) =>
    request<{
      status: string;
      approvalsCount: number;
      threshold: number;
      approved: boolean;
      approvedGuardians: string[];
    }>("/api/security/recovery/approve", {
      method: "POST",
      body: JSON.stringify({ requestId, guardian, approvalCode }),
    }),

  completeRecovery: (requestId: string) =>
    request<{ success: boolean; did: string; message: string; updatedAt: string }>(
      "/api/security/recovery/complete",
      {
        method: "POST",
        body: JSON.stringify({ requestId }),
      }
    ),

  // Dark Web Breach Alerts
  checkDarkWeb: (did: string, email: string, consent: boolean) =>
    request<{
      breaches: Array<{ name: string; title: string; domain: string; breachDate: string; dataClasses: string[] }>;
      emailHash: string;
      isDemoData: boolean;
      lastChecked: string;
    }>("/api/security/darkweb/check", {
      method: "POST",
      body: JSON.stringify({ did, email, consent }),
    }),

  revokeDarkWebConsent: (did: string) =>
    request<{ message: string }>("/api/security/darkweb/consent", {
      method: "DELETE",
      body: JSON.stringify({ did }),
    }),

  getDarkWebStatus: (did: string) =>
    request<{ consentGiven: boolean; lastChecked?: string; breaches: any[] }>(
      `/api/security/darkweb/${encodeURIComponent(did)}`
    ),

  // Tools
  runSmartFormFiller: (
    did: string,
    fields: Array<{ name: string; label: string }>,
    consent: boolean
  ) =>
    request<{
      suggestions: Array<{
        fieldName: string;
        claimName?: string;
        suggestedValue?: any;
        confidence: "high" | "medium" | "none";
        reason: string;
      }>;
      consentGiven: boolean;
      disclaimer: string;
    }>("/api/tools/form-filler", {
      method: "POST",
      body: JSON.stringify({ did, fields, consent }),
    }),

  runVisaSimulator: (did: string, destination: string, travelDate: string, tripDurationDays: number) =>
    request<{
      destination: string;
      profileName: string;
      readinessScore: number;
      daysUntilTravel: number;
      checklist: Array<{ item: string; satisfied: boolean; note: string }>;
      issues: Array<{ severity: "blocker" | "warning" | "info"; message: string }>;
      timeline: Array<{ stage: string; targetDate: string; description: string }>;
      ruleSource: string;
      disclaimer: string;
    }>("/api/tools/visa-simulator", {
      method: "POST",
      body: JSON.stringify({ did, destination, travelDate, tripDurationDays }),
    }),
};
