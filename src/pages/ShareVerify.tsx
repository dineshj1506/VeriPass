import { useState, useEffect } from "react";
import { Button, Card, Input, Badge, AlertBanner } from "../components/ui";
import { api } from "../api";
import { downloadOfflineBundle } from "../offline";
import { CheckCircle2, XCircle, ShieldCheck, Download, AlertOctagon, ArrowRight, ShieldAlert } from "lucide-react";

interface ShareVerifyProps {
  currentDid: string | null;
}

export function ShareVerify({ currentDid }: ShareVerifyProps) {
  const [walletCredentials, setWalletCredentials] = useState<any[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>("");
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);

  // Verifier Selection & Policy
  const [policies, setPolicies] = useState<Array<{ verifierId: string; name: string; allowedClaims: string[] }>>([]);
  const [selectedVerifierId, setSelectedVerifierId] = useState<string>("immigration-delhi-airport");
  const [customVerifierId, setCustomVerifierId] = useState<string>("");

  // Honeypot & Challenge State
  const [challenge, setChallenge] = useState<any | null>(null);
  const [challengeWarnings, setChallengeWarnings] = useState<any[]>([]);
  const [honeypotBlockError, setHoneypotBlockError] = useState<string | null>(null);

  // Presentation & Verification State
  const [presentation, setPresentation] = useState<any | null>(null);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Policy registration state
  const [newVerifierId, setNewVerifierId] = useState("");
  const [newVerifierName, setNewVerifierName] = useState("");
  const [newAllowedClaims, setNewAllowedClaims] = useState("");
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  useEffect(() => {
    if (currentDid) {
      api.getWallet(currentDid).then((res) => {
        const creds = res.credentials || [];
        setWalletCredentials(creds);
        if (creds.length > 0 && !selectedCredentialId) {
          setSelectedCredentialId(creds[0].credential.id);
        }
      }).catch(console.error);
    }
    loadPolicies();
  }, [currentDid]);

  const loadPolicies = async () => {
    try {
      const res = await api.getPolicies();
      setPolicies(res.policies || []);
    } catch (err: any) {
      console.error("Failed to load policies", err);
    }
  };

  const activeCredentialItem = walletCredentials.find(
    (c) => c.credential.id === selectedCredentialId
  );
  const availableClaimNames = activeCredentialItem ? Object.keys(activeCredentialItem.claims || {}) : [];

  const handleClaimToggle = (name: string) => {
    if (selectedClaims.includes(name)) {
      setSelectedClaims(selectedClaims.filter((c) => c !== name));
    } else {
      setSelectedClaims([...selectedClaims, name]);
    }
  };

  const handleSelectAllClaims = () => {
    if (selectedClaims.length === availableClaimNames.length) {
      setSelectedClaims([]);
    } else {
      setSelectedClaims([...availableClaimNames]);
    }
  };

  // Step 1: Request Challenge (Triggers anti-honeypot policy engine)
  const handleRequestChallenge = async () => {
    const verifierIdToUse = customVerifierId.trim() || selectedVerifierId;
    if (selectedClaims.length === 0) {
      setGeneralError("Please select at least one claim to disclose.");
      return;
    }

    try {
      setLoading(true);
      setGeneralError(null);
      setHoneypotBlockError(null);
      setChallenge(null);
      setChallengeWarnings([]);
      setPresentation(null);
      setVerificationResult(null);

      const res = await api.requestChallenge(verifierIdToUse, selectedClaims);
      setChallenge(res);
      setChallengeWarnings(res.warnings || []);
    } catch (err: any) {
      setHoneypotBlockError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Build Presentation
  const handleBuildPresentation = async () => {
    if (!currentDid || !selectedCredentialId || !challenge) return;

    try {
      setLoading(true);
      setGeneralError(null);
      const res = await api.buildPresentation(
        currentDid,
        selectedCredentialId,
        challenge.nonce,
        selectedClaims
      );
      setPresentation(res.presentation);
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify Presentation
  const handleVerify = async () => {
    if (!presentation) return;

    try {
      setLoading(true);
      setGeneralError(null);
      const res = await api.verifyPresentation(presentation, selectedClaims);
      setVerificationResult(res);
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Download Offline Bundle
  const handleDownloadBundle = async () => {
    if (!currentDid || !presentation) return;
    try {
      const idRes = await api.getIdentity(currentDid);
      downloadOfflineBundle({
        presentation,
        issuerPublicKeyPem: idRes.publicKeyPem, // or issuer key
        holderPublicKeyPem: idRes.publicKeyPem,
      });
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  const handleRegisterPolicy = async () => {
    if (!newVerifierId || !newVerifierName || !newAllowedClaims) return;
    try {
      setLoading(true);
      const claimsArray = newAllowedClaims.split(",").map((c) => c.trim()).filter(Boolean);
      await api.registerPolicy(newVerifierId, newVerifierName, claimsArray);
      await loadPolicies();
      setSelectedVerifierId(newVerifierId);
      setShowPolicyModal(false);
      setNewVerifierId("");
      setNewVerifierName("");
      setNewAllowedClaims("");
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setLoading(false);
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
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
            CHECKPOINT TERMINAL
          </span>
          <span className="text-xs text-slate-500 font-mono">ENCRYPTED PROTOCOL</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5 mt-1">
          <ShieldCheck className="w-7 h-7 text-emerald-400" />
          Selective Disclosure & Verification Gate
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Disclose minimal necessary attributes. Anti-honeypot policy engine blocks unauthorized surveillance.
        </p>
      </div>

      {generalError && <AlertBanner type="danger" title="Error" message={generalError} />}

      {/* Step 1: Select Credential and Claims */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="1. Choose Credential & Claims to Disclose">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Select Verifiable Credential:
              </label>
              <select
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                value={selectedCredentialId}
                onChange={(e) => {
                  setSelectedCredentialId(e.target.value);
                  setSelectedClaims([]);
                }}
              >
                {walletCredentials.map((c) => (
                  <option key={c.credential.id} value={c.credential.id}>
                    {c.credential.type[1] || c.credential.type[0]} ({c.credential.id.slice(0, 16)}...)
                  </option>
                ))}
              </select>
            </div>

            {availableClaimNames.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Available Claims:</span>
                  <button
                    type="button"
                    onClick={handleSelectAllClaims}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer"
                  >
                    {selectedClaims.length === availableClaimNames.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2 max-h-60 overflow-y-auto">
                  {availableClaimNames.map((claimName) => {
                    const isChecked = selectedClaims.includes(claimName);
                    const val = activeCredentialItem.claims[claimName];
                    return (
                      <label
                        key={claimName}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-900 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
                          checked={isChecked}
                          onChange={() => handleClaimToggle(claimName)}
                        />
                        <div className="text-xs leading-normal">
                          <span className="font-semibold text-slate-200">{claimName}</span>
                          <span className="text-slate-500 block break-all font-mono">
                            Value: {String(val)}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-emerald-400/90 font-medium">
                  {selectedClaims.length} of {availableClaimNames.length} claims selected for minimal disclosure.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Step 2: Target Verifier & Policy Engine */}
        <Card
          title="2. Verifier Policy Registry"
          subtitle="Prevents honeypots and over-collection through strict policy governance."
          footer={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPolicyModal(!showPolicyModal)}
            >
              + Register New Verifier Policy
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Verifier Organization:
              </label>
              <select
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                value={selectedVerifierId}
                onChange={(e) => setSelectedVerifierId(e.target.value)}
              >
                {policies.map((p) => (
                  <option key={p.verifierId} value={p.verifierId}>
                    {p.name} ({p.verifierId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Input
                label="Or Test Custom Verifier ID (e.g. rogue-data-harvester):"
                placeholder="Leave blank to use selection above"
                value={customVerifierId}
                onChange={(e) => setCustomVerifierId(e.target.value)}
                helper="Test Honeypot Block: enter an unregistered ID while requesting passportNumber or dateOfBirth!"
              />
            </div>

            {/* Policy Allowed Claims Preview */}
            {policies.find((p) => p.verifierId === selectedVerifierId) && (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-400 font-semibold block mb-1">
                  Registered Allowed Claims for this Verifier:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {policies
                    .find((p) => p.verifierId === selectedVerifierId)
                    ?.allowedClaims.map((claim) => (
                      <span
                        key={claim}
                        className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono text-[11px]"
                      >
                        {claim}
                      </span>
                    ))}
                </div>
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleRequestChallenge}
              loading={loading}
              className="w-full"
            >
              Request Verifier Challenge Nonce
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Honeypot Blocked Banner (HTTP 403 Response) */}
      {honeypotBlockError && (
        <div className="bg-rose-950/60 border border-rose-700/80 p-5 rounded-2xl flex items-start gap-4 text-rose-200">
          <ShieldAlert className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-rose-100 text-base">
              Anti-Honeypot Defense Triggered (HTTP 403 Forbidden)
            </h4>
            <p className="text-sm">{honeypotBlockError}</p>
            <p className="text-xs text-rose-300 mt-2">
              Action blocked: VeriPass enforces cryptographic data-minimization rules to stop unauthorized scraping and sensitive data harvesting.
            </p>
          </div>
        </div>
      )}

      {/* Honeypot Warnings Banner */}
      {challengeWarnings.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/80 p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <AlertOctagon className="w-5 h-5" />
            <span>Anti-Honeypot Warnings ({challengeWarnings.length})</span>
          </div>
          <ul className="text-xs text-amber-300 space-y-1 list-disc list-inside">
            {challengeWarnings.map((w, idx) => (
              <li key={idx}>
                <strong>[{w.code}]:</strong> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 3: Challenge Nonce & Presentation Generation */}
      {challenge && !honeypotBlockError && (
        <Card
          title="3. Challenge Nonce & Holder Authorization"
          subtitle="A single-use fresh cryptographic nonce guarantees freshness against replay attacks."
        >
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between gap-3 items-center">
              <div>
                <span className="text-xs text-slate-400 block">Single-Use Nonce (Expires in 5m):</span>
                <span className="font-mono text-emerald-400 text-sm font-semibold">
                  {challenge.nonce}
                </span>
              </div>
              <Badge variant="success">Fresh Challenge</Badge>
            </div>

            {!presentation ? (
              <Button
                variant="primary"
                onClick={handleBuildPresentation}
                loading={loading}
              >
                Sign Presentation with Holder Key
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1">
                  <div className="text-slate-400 font-semibold">Presentation Ready:</div>
                  <div className="text-slate-300">
                    Disclosed Claims: <strong>{Object.keys(presentation.disclosedClaims).join(", ")}</strong>
                  </div>
                  <div className="text-slate-500 font-mono text-[11px] truncate">
                    Holder Proof: {presentation.presentationProof.proofValue}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" onClick={handleVerify} loading={loading}>
                    Submit to Cryptographic Verifier
                  </Button>
                  <Button variant="secondary" onClick={handleDownloadBundle}>
                    <Download className="w-4 h-4 mr-1.5" />
                    Download Offline Bundle
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Step 4: Verification Results (8 Checks) */}
      {verificationResult && (
        <Card
          title="4. Cryptographic Verification Results"
          subtitle="Verifies all 8 core identity, cryptographic, and data-minimization guarantees."
          badge={
            verificationResult.verified ? (
              <Badge variant="success">ALL 8 CHECKS PASSED</Badge>
            ) : (
              <Badge variant="danger">VERIFICATION FAILED</Badge>
            )
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {verificationResult.checks.map((c: any) => (
                <div
                  key={c.id}
                  className={`p-3.5 rounded-xl border ${
                    c.passed
                      ? "bg-emerald-950/20 border-emerald-800/40"
                      : "bg-rose-950/20 border-rose-800/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {c.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-semibold text-xs text-slate-200">
                      #{c.id}. {c.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-6 leading-relaxed">
                    {c.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
              <div>
                <span className="text-slate-400">On-Chain Anchor Status: </span>
                <span className="text-slate-200 font-semibold">
                  {verificationResult.onChain?.isAnchored ? "Anchored on EVM" : "Not Anchored (Off-chain mode)"}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={handleDownloadBundle}>
                <Download className="w-3.5 h-3.5 mr-1" />
                Export Air-Gapped Bundle
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Register Policy Modal */}
      {showPolicyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Register Verifier Policy</h3>
            <p className="text-xs text-slate-400">
              Establish allowed claims to protect holders from unauthorized over-collection.
            </p>
            <Input
              label="Verifier ID (slug)"
              placeholder="e.g. rail-europe-checkin"
              value={newVerifierId}
              onChange={(e) => setNewVerifierId(e.target.value)}
            />
            <Input
              label="Organization Name"
              placeholder="e.g. EuroRail Verification Portal"
              value={newVerifierName}
              onChange={(e) => setNewVerifierName(e.target.value)}
            />
            <Input
              label="Allowed Claims (comma-separated)"
              placeholder="e.g. fullName, nationality, dateOfBirth"
              value={newAllowedClaims}
              onChange={(e) => setNewAllowedClaims(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowPolicyModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleRegisterPolicy} loading={loading}>
                Save Policy
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
