import { useState, useEffect } from "react";
import { Button, Card, Input, Badge, AlertBanner } from "../components/ui";
import { api } from "../api";
import { checkWebAuthnSupport, registerBiometrics, authenticateBiometrics } from "../webauthn";
import { Fingerprint, Users, ShieldAlert, KeyRound, CheckCircle2, Unlock } from "lucide-react";

interface SecurityProps {
  currentDid: string | null;
}

export function Security({ currentDid }: SecurityProps) {
  const [activeTab, setActiveTab] = useState<"biometrics" | "recovery" | "darkweb">("biometrics");

  // WebAuthn state
  const [webauthnSupport, setWebauthnSupport] = useState<{
    supported: boolean;
    platformAvailable: boolean;
    message?: string;
  } | null>(null);
  const [enrolledBio, setEnrolledBio] = useState(false);
  const [bioStatus, setBioStatus] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);

  // Social Recovery state
  const [guardiansInput, setGuardiansInput] = useState(
    "alice@example.com, bob@example.com, charlie@example.com"
  );
  const [thresholdInput, setThresholdInput] = useState(2);
  const [recoveryConfigured, setRecoveryConfigured] = useState(false);
  const [activeRecoveryRequest, setActiveRecoveryRequest] = useState<any | null>(null);
  const [approvalInputs, setApprovalInputs] = useState<Record<string, string>>({});
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Dark Web state
  const [darkWebConsent, setDarkWebConsent] = useState(false);
  const [darkWebEmail, setDarkWebEmail] = useState("");
  const [darkWebResults, setDarkWebResults] = useState<any | null>(null);
  const [darkWebLoading, setDarkWebLoading] = useState(false);
  const [darkWebError, setDarkWebError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkWebAuthnSupport().then(setWebauthnSupport).catch(console.error);

    if (currentDid) {
      api.getIdentity(currentDid).then((id) => {
        setEnrolledBio(id.hasWebauthn);
        setRecoveryConfigured(id.hasRecovery);
      }).catch(console.error);

      api.getDarkWebStatus(currentDid).then((dw) => {
        if (dw.consentGiven) {
          setDarkWebConsent(true);
          setDarkWebResults(dw);
        }
      }).catch(console.error);
    }
  }, [currentDid]);

  // 1. Biometrics Handlers
  const handleEnrollBiometrics = async () => {
    if (!currentDid) return;
    try {
      setLoading(true);
      setBioError(null);
      setBioStatus("Prompting device platform authenticator (TouchID / FaceID)...");
      const res = await registerBiometrics(currentDid);
      if (res.success) {
        setEnrolledBio(true);
        setBioStatus("Biometrics successfully enrolled with hardware platform key!");
      }
    } catch (err: any) {
      setBioError(err.message);
      setBioStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTestUnlock = async () => {
    if (!currentDid) return;
    try {
      setLoading(true);
      setBioError(null);
      setBioStatus("Verifying user biometrics on device...");
      const res = await authenticateBiometrics(currentDid);
      if (res.success) {
        setBioStatus(`Biometric unlock verified successfully at ${new Date(res.unlockedAt || "").toLocaleTimeString()}!`);
      }
    } catch (err: any) {
      setBioError(err.message);
      setBioStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // 2. Social Recovery Handlers
  const handleSetupRecovery = async () => {
    if (!currentDid) return;
    try {
      setLoading(true);
      setRecoveryError(null);
      const guardians = guardiansInput.split(",").map((g) => g.trim()).filter(Boolean);
      const res = await api.setupRecovery(currentDid, guardians, Number(thresholdInput));
      setRecoveryConfigured(true);
      setRecoveryMessage(res.message);
    } catch (err: any) {
      setRecoveryError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateRecovery = async () => {
    if (!currentDid) return;
    try {
      setLoading(true);
      setRecoveryError(null);
      // Generate a new temporary mock Ed25519 public key to emulate a new replacement device
      const mockNewPublicKeyPem = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA${Math.random().toString(36).substring(2, 12)}DEMO_ROTATION_KEY_MOCK==\n-----END PUBLIC KEY-----`;
      const res = await api.initiateRecovery(currentDid, mockNewPublicKeyPem);
      setActiveRecoveryRequest(res);
      setRecoveryMessage("Recovery request initiated! Codes are displayed below for demo simulation.");
    } catch (err: any) {
      setRecoveryError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCode = async (guardian: string) => {
    if (!activeRecoveryRequest) return;
    const code = approvalInputs[guardian] || activeRecoveryRequest.guardianCodes[guardian];
    if (!code) return;

    try {
      setLoading(true);
      setRecoveryError(null);
      const res = await api.approveRecovery(activeRecoveryRequest.requestId, guardian, code);
      setActiveRecoveryRequest((prev: any) => ({
        ...prev,
        approvedGuardians: res.approvedGuardians,
        approved: res.approved,
        status: res.status,
      }));
      setRecoveryMessage(`Guardian ${guardian} approved! (${res.approvalsCount}/${res.threshold} approvals)`);
    } catch (err: any) {
      setRecoveryError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRecovery = async () => {
    if (!activeRecoveryRequest) return;
    try {
      setLoading(true);
      setRecoveryError(null);
      const res = await api.completeRecovery(activeRecoveryRequest.requestId);
      setRecoveryMessage(`Recovery & Key Rotation Complete! ${res.message}`);
      setActiveRecoveryRequest(null);
    } catch (err: any) {
      setRecoveryError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Dark Web Handlers
  const handleRunDarkWebCheck = async () => {
    if (!currentDid) return;
    if (!darkWebConsent) {
      setDarkWebError("Explicit user consent is mandatory before checking breach databases.");
      return;
    }
    if (!darkWebEmail) {
      setDarkWebError("Email address is required.");
      return;
    }

    try {
      setDarkWebLoading(true);
      setDarkWebError(null);
      const res = await api.checkDarkWeb(currentDid, darkWebEmail, true);
      setDarkWebResults(res);
    } catch (err: any) {
      setDarkWebError(err.message);
    } finally {
      setDarkWebLoading(false);
    }
  };

  const handleRevokeConsent = async () => {
    if (!currentDid) return;
    try {
      setDarkWebLoading(true);
      await api.revokeDarkWebConsent(currentDid);
      setDarkWebResults(null);
      setDarkWebConsent(false);
    } catch (err: any) {
      setDarkWebError(err.message);
    } finally {
      setDarkWebLoading(false);
    }
  };

  if (!currentDid) {
    return (
      <Card title="No Active Identity Found">
        <p className="text-slate-400 text-sm">
          Please initialize or select a Decentralized Identity in the Wallet tab first.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Tab Navigation */}
      <div className="flex bg-slate-900/70 p-1 rounded-2xl border border-slate-800/80 w-fit">
        <button
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "biometrics"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          onClick={() => setActiveTab("biometrics")}
        >
          <Fingerprint className="w-4 h-4" />
          Hardware Biometrics
        </button>
        <button
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "recovery"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          onClick={() => setActiveTab("recovery")}
        >
          <Users className="w-4 h-4" />
          M-of-N Key Vault Recovery
        </button>
        <button
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "darkweb"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          onClick={() => setActiveTab("darkweb")}
        >
          <ShieldAlert className="w-4 h-4" />
          Breach Surveillance
        </button>
      </div>

      {/* ============================================================== */}
      {/* 1. BIOMETRIC UNLOCK TAB */}
      {/* ============================================================== */}
      {activeTab === "biometrics" && (
        <div className="space-y-6">
          <Card
            title="Hardware Platform Biometric Security (WebAuthn)"
            subtitle="Raw biometric data never leaves your device. Only cryptographic assertions are verified."
            badge={
              enrolledBio ? (
                <Badge variant="success">Biometrics Enrolled</Badge>
              ) : (
                <Badge variant="neutral">Not Enrolled</Badge>
              )
            }
          >
            {bioError && <AlertBanner type="danger" title="Error" message={bioError} />}
            {bioStatus && <AlertBanner type="success" title="Status" message={bioStatus} />}

            {/* Platform capability check */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <span className="font-semibold text-slate-300">Browser Environment Capability:</span>
              <p className="text-slate-400">{webauthnSupport?.message || "Detecting WebAuthn support..."}</p>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <Button
                variant="primary"
                onClick={handleEnrollBiometrics}
                loading={loading}
              >
                <Fingerprint className="w-4 h-4 mr-2" />
                {enrolledBio ? "Re-Enroll Platform Authenticator" : "Enroll Platform Biometrics"}
              </Button>

              {enrolledBio && (
                <Button variant="secondary" onClick={handleTestUnlock} loading={loading}>
                  <Unlock className="w-4 h-4 mr-2" />
                  Test Biometric Unlock Assertion
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. SOCIAL RECOVERY & KEY ROTATION TAB */}
      {/* ============================================================== */}
      {activeTab === "recovery" && (
        <div className="space-y-6">
          <Card
            title="M-of-N Social Recovery with Stable DID Key Rotation"
            subtitle="Guardians authorize re-enrolling a lost device without breaking your sovereign DID identifier."
            badge={
              recoveryConfigured ? (
                <Badge variant="success">Recovery Configured</Badge>
              ) : (
                <Badge variant="neutral">Not Configured</Badge>
              )
            }
          >
            {recoveryError && <AlertBanner type="danger" title="Error" message={recoveryError} />}
            {recoveryMessage && <AlertBanner type="info" title="Recovery Notice" message={recoveryMessage} />}

            {/* Step 1: Configuration */}
            <div className="space-y-4">
              <Input
                label="Guardians (3 to 7 comma-separated names or emails):"
                value={guardiansInput}
                onChange={(e) => setGuardiansInput(e.target.value)}
              />

              <Input
                label="Threshold M (Minimum distinct approvals required, 2 ≤ M ≤ N):"
                type="number"
                min={2}
                max={7}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(Number(e.target.value))}
              />

              <Button variant="primary" size="sm" onClick={handleSetupRecovery} loading={loading}>
                Save Recovery Configuration
              </Button>
            </div>
          </Card>

          {/* Step 2: Active Recovery Simulation */}
          {recoveryConfigured && (
            <Card
              title="Initiate Lost Device Recovery & Key Rotation"
              subtitle="Generates one-time approval codes for each designated guardian."
            >
              {!activeRecoveryRequest ? (
                <Button variant="outline" onClick={handleInitiateRecovery} loading={loading}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Simulate Lost Device Recovery Request
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Request ID:</span>
                      <span className="font-mono text-emerald-400 font-bold">{activeRecoveryRequest.requestId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Approvals Progress:</span>
                      <span className="font-bold text-slate-200">
                        {activeRecoveryRequest.approvedGuardians?.length || 0} / {activeRecoveryRequest.threshold} required
                      </span>
                    </div>
                    <p className="text-amber-400 pt-1 font-medium">{activeRecoveryRequest.demoNote}</p>
                  </div>

                  {/* Guardian Approval Action Cards */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300">Guardian Approval Dispatch:</h4>
                    {Object.entries(activeRecoveryRequest.guardianCodes || {}).map(([guardian, code]) => {
                      const isApproved = activeRecoveryRequest.approvedGuardians?.includes(guardian);
                      return (
                        <div
                          key={guardian}
                          className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-200 block">{guardian}</span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              One-time code: <strong className="text-emerald-400">{String(code)}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs font-mono w-24 text-center text-slate-100"
                              placeholder={String(code)}
                              value={approvalInputs[guardian] || ""}
                              onChange={(e) =>
                                setApprovalInputs((prev) => ({ ...prev, [guardian]: e.target.value }))
                              }
                            />
                            {isApproved ? (
                              <Badge variant="success">Approved</Badge>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleApproveCode(guardian)}
                                loading={loading}
                              >
                                Approve
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Complete Recovery Button */}
                  {activeRecoveryRequest.approved && (
                    <div className="pt-2">
                      <Button variant="primary" onClick={handleCompleteRecovery} loading={loading}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Finalize Key Rotation & Re-enroll Device
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. DARK WEB BREACH ALERTS TAB */}
      {/* ============================================================== */}
      {activeTab === "darkweb" && (
        <div className="space-y-6">
          <Card
            title="Have I Been Pwned Integration"
            subtitle="Proactive breach surveillance. Emails are never logged in plaintext; only SHA-256 hashes are recorded."
          >
            {darkWebError && <AlertBanner type="danger" title="Error" message={darkWebError} />}

            <div className="space-y-4">
              <Input
                label="Target Email Address to Inspect:"
                type="email"
                placeholder="e.g. holder@example.com"
                value={darkWebEmail}
                onChange={(e) => setDarkWebEmail(e.target.value)}
              />

              <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
                  checked={darkWebConsent}
                  onChange={(e) => setDarkWebConsent(e.target.checked)}
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-200 block">
                    Explicit User Consent for Breach Surveillance (Required)
                  </span>
                  <span className="text-slate-400 block mt-0.5">
                    I authorize VeriPass to query breach databases. I understand I can revoke consent and purge records at any time.
                  </span>
                </div>
              </label>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  onClick={handleRunDarkWebCheck}
                  disabled={!darkWebConsent}
                  loading={darkWebLoading}
                >
                  Inspect Dark Web Breaches
                </Button>

                {darkWebResults && (
                  <Button variant="danger" onClick={handleRevokeConsent} loading={darkWebLoading}>
                    Revoke Consent & Purge Records
                  </Button>
                )}
              </div>
            </div>

            {/* Breach Results Display */}
            {darkWebResults && (
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-200">
                    Breach Incidents Found: {darkWebResults.breaches.length}
                  </h4>
                  {darkWebResults.isDemoData && (
                    <Badge variant="warning">Demo Dataset (No API Key Provided)</Badge>
                  )}
                </div>

                {darkWebResults.breaches.length === 0 ? (
                  <div className="p-4 bg-emerald-950/30 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>No known security breaches found for this identity!</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {darkWebResults.breaches.map((b: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-slate-200 text-sm block">{b.title}</span>
                            <span className="text-slate-500 font-mono text-[11px]">
                              Domain: {b.domain} | Breach Date: {b.breachDate}
                            </span>
                          </div>
                          <Badge variant="danger">Compromised</Badge>
                        </div>

                        <div>
                          <span className="text-slate-400 font-semibold block mb-1">
                            Compromised Data Classes:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {b.dataClasses.map((dc: string) => (
                              <span
                                key={dc}
                                className="bg-rose-950/50 text-rose-300 border border-rose-800/40 px-2 py-0.5 rounded text-[11px]"
                              >
                                {dc}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
