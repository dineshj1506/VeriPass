import { useState, useEffect } from "react";
import { Button, Card, Input, Badge, AlertBanner } from "../components/ui";
import { api } from "../api";
import { isMetaMaskFeatureEnabled, connectMetaMaskWallet, ConnectedWallet } from "../wallet";
import {
  Key,
  Copy,
  Check,
  RefreshCw,
  Link2,
  QrCode,
  Plane,
  Building2,
  CreditCard,
  UserCheck,
  Radio,
  FileCheck2,
  Globe,
} from "lucide-react";

interface WalletProps {
  currentDid: string | null;
  onDidChanged: (did: string) => void;
}

export function Wallet({ currentDid, onDidChanged }: WalletProps) {
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  const loadWallet = async (did: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getWallet(did);
      setCredentials(res.credentials || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentDid) {
      loadWallet(currentDid);
    }
  }, [currentDid]);

  const handleCreateIdentity = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.createIdentity(emailInput || undefined);
      onDidChanged(res.did);
      localStorage.setItem("veripass_did", res.did);
      await api.seedDemoCredentials(res.did);
      await loadWallet(res.did);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedCredentials = async () => {
    if (!currentDid) return;
    try {
      setLoading(true);
      setError(null);
      await api.seedDemoCredentials(currentDid);
      await loadWallet(currentDid);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    if (!currentDid) return;
    try {
      setLoading(true);
      await api.revokeCredential(credentialId, "Revoked by holder via sovereign dashboard");
      await loadWallet(currentDid);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDid = () => {
    if (!currentDid) return;
    navigator.clipboard.writeText(currentDid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectMetaMask = async () => {
    if (!currentDid) return;
    try {
      setError(null);
      const wallet = await connectMetaMaskWallet(currentDid);
      setConnectedWallet(wallet);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const passportCred = credentials.find((c) => c.credential.type.includes("PassportCredential"));
  const bankCred = credentials.find((c) => c.credential.type.includes("BankStatementCredential"));
  const insuranceCred = credentials.find((c) => c.credential.type.includes("InsuranceCredential"));
  const itineraryCred = credentials.find((c) => c.credential.type.includes("ItineraryCredential"));

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              Digital Passport & Credential Vault
            </h2>
            <span className="flex h-2 w-2 relative">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Self-Sovereign Identity &bull; W3C Verifiable Credentials &bull; ICAO Doc 9303 Compliant
          </p>
        </div>

        {currentDid && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowQrModal(true)}
              className="bg-slate-900 border-slate-800 text-xs text-amber-300 hover:text-white cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              NFC / QR Share
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadWallet(currentDid)}
              loading={loading}
              className="bg-slate-900 border-slate-800 text-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1 text-slate-400" />
              Sync Wallet
            </Button>
          </div>
        )}
      </div>

      {error && <AlertBanner type="danger" title="System Notice" message={error} />}

      {/* Identity Initializer when not logged in */}
      {!currentDid ? (
        <Card
          title="Initialize Sovereign Identity"
          subtitle="Generate an Ed25519 cryptographic keypair and self-sovereign DID."
          className="border-amber-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950"
        >
          <div className="max-w-lg space-y-4">
            <Input
              label="Contact Email (Optional - for recovery notifications)"
              placeholder="e.g. aarav.sharma@example.com"
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              helper="VeriPass operates without central databases. Raw email is never stored in credentials."
            />
            <Button
              variant="primary"
              onClick={handleCreateIdentity}
              loading={loading}
              className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-black font-bold"
            >
              <Key className="w-4 h-4 mr-2" />
              Create Indian e-Passport & DID
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* ========================================================================= */}
          {/* DIGITAL e-PASSPORT CARD (ICAO DOC 9303 & W3C STANDARD) */}
          {/* ========================================================================= */}
          <div className="relative group">
            {/* Ambient subtle glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-emerald-500/10 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition duration-500" />

            <div className="relative rounded-2xl bg-gradient-to-br from-[#0b101e] via-[#080d19] to-[#050811] border border-slate-700/80 p-6 sm:p-8 shadow-2xl text-slate-100 overflow-hidden">
              {/* Subtle security background curve */}
              <div className="absolute right-10 top-1/2 -translate-y-1/2 w-80 h-80 rounded-full border border-sky-500/5 pointer-events-none flex items-center justify-center">
                <div className="w-72 h-72 rounded-full border border-dashed border-sky-400/10" />
                <div className="w-48 h-48 rounded-full border border-sky-400/5" />
              </div>

              {/* Top Passport Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800 relative z-10">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-inner">
                    <Globe className="w-6 h-6 text-sky-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold tracking-widest text-slate-300 uppercase">
                        REPUBLIC OF INDIA
                      </h3>
                      <span className="text-[10px] bg-slate-800 text-sky-300 px-2 py-0.5 rounded font-mono font-bold">
                        IND
                      </span>
                    </div>
                    <div className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                      PASSPORT
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono font-medium">
                        e-Passport &bull; ICAO Doc 9303
                      </span>
                    </div>
                  </div>
                </div>

                {/* Golden e-Passport Biometric Chip Logo */}
                <div className="flex items-center gap-2.5">
                  <div className="hidden sm:flex flex-col items-end text-[10px] text-slate-400 font-mono">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                      NFC READY
                    </span>
                    <span>TYPE: P &bull; CODE: IND</span>
                  </div>
                  <div className="w-10 h-7 border-2 border-amber-400/80 rounded-md flex items-center justify-center p-0.5 shadow-md bg-amber-950/20">
                    <div className="w-full h-full border border-amber-400/50 rounded flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Passport Holder Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 my-6 items-center relative z-10">
                {/* Photo Silhouette with Biometric Radar */}
                <div className="flex flex-col items-center justify-center">
                  <div className="w-32 h-40 rounded-xl bg-slate-900/90 border border-slate-700/80 relative flex flex-col items-center justify-center overflow-hidden shadow-inner group-hover:border-sky-500/50 transition">
                    <div className="w-16 h-16 rounded-full bg-sky-500/10 border border-sky-400/20 flex items-center justify-center mb-2">
                      <UserCheck className="w-8 h-8 text-sky-400" />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-200 uppercase tracking-widest text-center px-1">
                      AARAV SHARMA
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      BIO-HASH: in_9f82d1
                    </span>

                    {/* Scan line effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-sky-400/10 to-transparent pointer-events-none animate-pulse" />
                  </div>
                </div>

                {/* Passport Fields in Standard English */}
                <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                  <div>
                    <span className="text-[10px] font-medium tracking-wider text-slate-400 block uppercase">
                      Surname & Given Names
                    </span>
                    <span className="text-sm font-semibold text-white tracking-wide block">
                      {String(passportCred?.claims.fullName || "Aarav Sharma")}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-medium tracking-wider text-slate-400 block uppercase">
                      Nationality
                    </span>
                    <span className="text-sm font-bold text-emerald-400 block">
                      INDIAN
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-medium tracking-wider text-slate-400 block uppercase">
                      Passport Document No.
                    </span>
                    <span className="text-sm font-mono font-bold text-amber-300 block">
                      {String(passportCred?.claims.passportNumber || "Z6894321")}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-medium tracking-wider text-slate-400 block uppercase">
                      Date of Birth
                    </span>
                    <span className="text-xs font-mono text-slate-200 block font-semibold">
                      15/08/1996
                    </span>
                    <span className="text-[10px] text-slate-400">15 AUG 1996</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-medium tracking-wider text-slate-400 block uppercase">
                      Date of Expiry
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-400 block">
                      14/08/2034
                    </span>
                    <span className="text-[10px] text-emerald-400">14 AUG 2034 (VALID)</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-medium tracking-wider text-slate-400 block uppercase">
                      Place of Issue
                    </span>
                    <span className="text-xs font-medium text-slate-200 block">
                      NEW DELHI, INDIA
                    </span>
                    <span className="text-[10px] text-slate-400">Passport Issuing Authority</span>
                  </div>

                  <div className="col-span-2 sm:col-span-3 pt-1">
                    <span className="text-[10px] font-medium tracking-wider text-slate-400 block mb-1 uppercase">
                      Decentralized Identifier (DID)
                    </span>
                    <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-sky-300">
                      <span className="truncate flex-1 select-all">{currentDid}</span>
                      <button
                        onClick={handleCopyDid}
                        className="p-1 hover:text-white transition text-slate-400 cursor-pointer"
                        title="Copy DID"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Official ICAO Machine Readable Zone (MRZ) */}
              <div className="mt-4 pt-3 border-t border-slate-800 relative z-10 bg-slate-950/80 -mx-6 -mb-6 p-4 rounded-b-2xl">
                <div className="font-mono text-[10px] sm:text-xs text-slate-300 tracking-wider sm:tracking-widest leading-relaxed select-all">
                  <p>P&lt;INDSHARMA&lt;&lt;AARAV&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>
                  <p>Z689432104IND9608154M3408146&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;08</p>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CREDENTIAL PORTFOLIO */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-sky-400" />
                  Verified Credential Portfolio
                </h3>
                <p className="text-xs text-slate-400">
                  Cryptographically anchored Verifiable Credentials with selective disclosure.
                </p>
              </div>

              {credentials.length === 0 && (
                <Button variant="primary" size="sm" onClick={handleSeedCredentials} loading={loading}>
                  Issue Credentials
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 1. Air India Flight Itinerary */}
              {itineraryCred && (
                <div className="rounded-2xl bg-gradient-to-br from-[#0c1424] to-[#060a14] border border-orange-500/30 p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30">
                        <Plane className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-orange-400 uppercase tracking-widest block font-bold">
                          AIR INDIA
                        </span>
                        <h4 className="text-sm font-bold text-white">
                          Flight {String(itineraryCred.claims.flightNumber || "AI-143")}
                        </h4>
                      </div>
                    </div>
                    <Badge variant="success">Confirmed</Badge>
                  </div>

                  <div className="space-y-2 text-xs py-3 border-y border-slate-800 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Route:</span>
                      <span className="text-white font-semibold">DEL ➔ CDG (Paris)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Departure:</span>
                      <span className="text-slate-200">{String(itineraryCred.claims.departureDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Return:</span>
                      <span className="text-slate-200">{String(itineraryCred.claims.returnDate)}</span>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-between items-center text-[11px]">
                    <span className="text-emerald-400 font-mono">Hotel Booking: Verified</span>
                    {!itineraryCred.credential.revoked && (
                      <button
                        onClick={() => handleRevoke(itineraryCred.credential.id)}
                        className="text-rose-400 hover:text-rose-300 text-xs font-medium cursor-pointer"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 2. State Bank of India (SBI) Proof of Funds */}
              {bankCred && (
                <div className="rounded-2xl bg-gradient-to-br from-[#0c1424] to-[#060a14] border border-blue-500/30 p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest block font-bold">
                          STATE BANK OF INDIA
                        </span>
                        <h4 className="text-sm font-bold text-white">
                          SBI Proof of Solvency
                        </h4>
                      </div>
                    </div>
                    <Badge variant="success">Solvent</Badge>
                  </div>

                  <div className="space-y-2 text-xs py-3 border-y border-slate-800 font-mono">
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-400">Verified Balance:</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        ₹{Number(bankCred.claims.balanceInr || 1540000).toLocaleString("en-IN")} INR
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Account No:</span>
                      <span className="text-slate-200">{String(bankCred.claims.accountNumber)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Issue Date:</span>
                      <span className="text-slate-200">{String(bankCred.claims.issueDate)}</span>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-mono">Financial Solvency Certified</span>
                    {!bankCred.credential.revoked && (
                      <button
                        onClick={() => handleRevoke(bankCred.credential.id)}
                        className="text-rose-400 hover:text-rose-300 text-xs font-medium cursor-pointer"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 3. Star Health International Travel Insurance */}
              {insuranceCred && (
                <div className="rounded-2xl bg-gradient-to-br from-[#0c1424] to-[#060a14] border border-emerald-500/30 p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest block font-bold">
                          STAR HEALTH INSURANCE
                        </span>
                        <h4 className="text-sm font-bold text-white">
                          Global Travel Shield
                        </h4>
                      </div>
                    </div>
                    <Badge variant="success">Active</Badge>
                  </div>

                  <div className="space-y-2 text-xs py-3 border-y border-slate-800 font-mono">
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-400">Coverage:</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        ₹{Number(insuranceCred.claims.coverageAmountInr || 8000000).toLocaleString("en-IN")} INR
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Repatriation:</span>
                      <span className="text-emerald-300 font-semibold">Included</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Valid Until:</span>
                      <span className="text-slate-200">{String(insuranceCred.claims.validUntil)}</span>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-mono">Schengen Article 12 Ready</span>
                    {!insuranceCred.credential.revoked && (
                      <button
                        onClick={() => handleRevoke(insuranceCred.credential.id)}
                        className="text-rose-400 hover:text-rose-300 text-xs font-medium cursor-pointer"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Optional Web3 Wallet Link */}
          {isMetaMaskFeatureEnabled && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Link2 className="w-4 h-4 text-amber-400" />
                <span>
                  Ethereum Blockchain Anchor:{" "}
                  {connectedWallet ? (
                    <strong className="text-white font-mono">{connectedWallet.address}</strong>
                  ) : (
                    "Not linked"
                  )}
                </span>
              </div>
              {!connectedWallet ? (
                <Button variant="outline" size="sm" onClick={handleConnectMetaMask}>
                  Link MetaMask
                </Button>
              ) : (
                <Badge variant="info">Bound to DID</Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* QR Code Presentation Modal */}
      {showQrModal && currentDid && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-white flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-amber-400" />
              Indian Digital Identity QR
            </h4>
            <p className="text-xs text-slate-400">
              Present this code at verified checkpoints to initiate contactless selective disclosure.
            </p>

            <div className="bg-white p-4 rounded-2xl mx-auto w-48 h-48 flex items-center justify-center shadow-lg relative">
              <div className="w-full h-full border-4 border-slate-950 rounded-lg flex flex-col items-center justify-center font-mono text-[10px] text-slate-900 font-bold p-2 text-center break-all select-none">
                <div className="w-8 h-8 rounded bg-slate-950 mb-2 flex items-center justify-center text-amber-400 font-serif text-xs font-bold">
                  IND
                </div>
                {currentDid.slice(0, 24)}...
              </div>
            </div>

            <div className="text-[11px] font-mono text-amber-300 bg-slate-950 p-2 rounded-lg border border-slate-800">
              NFC Signal Ready &bull; Single-Use Nonce Enforced
            </div>

            <Button variant="secondary" size="sm" onClick={() => setShowQrModal(false)} className="w-full cursor-pointer">
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
