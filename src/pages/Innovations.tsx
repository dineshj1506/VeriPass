import { Card, Badge } from "../components/ui";
import { Lock, ShieldCheck, Fingerprint, Users, WifiOff, Blocks } from "lucide-react";

export function Innovations() {
  const innovations = [
    {
      id: 1,
      icon: <Lock className="w-6 h-6 text-emerald-400" />,
      title: "1. Salted Cryptographic Commitments & Selective Disclosure",
      protection:
        "The credential document issued by authorities contains ONLY cryptographic digests of each claim: sha256(salt:name:value). The holder reveals strictly the individual claims needed by a verifier, retaining full control over all other claims.",
      mechanism:
        "When sharing, the holder supplies the plaintext claim and its random 16-byte salt for the selected claims only. The verifier verifies the hash matches the signed commitment without learning any omitted claims.",
      limitation:
        "Prototype Limitation: The holder's plaintext claims and salts are stored locally in the simulated server store. In production, these belong exclusively in the user's secure enclave or hardware wallet.",
    },
    {
      id: 2,
      icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />,
      title: "2. Anti-Honeypot Policy Engine & Rate Defense",
      protection:
        "Protects holders against rogue or fake verifiers attempting to over-collect personal information, and blocks scraping attacks that aggregate surveillance databases.",
      mechanism:
        "Unregistered verifiers requesting sensitive claims (e.g. passport number, national ID, date of birth) are automatically blocked with HTTP 403. Registered verifiers are restricted to their pre-approved allowed claim policies. Requests exceeding 6 claims or 10 challenges/minute trigger explicit holder warnings.",
      limitation:
        "Prototype Limitation: Policies are registered via an in-memory/JSON store. In production, this requires decentralized DNS-based domain verification or verifiable trust registries.",
    },
    {
      id: 3,
      icon: <Fingerprint className="w-6 h-6 text-emerald-400" />,
      title: "3. Hardware Platform Biometric Unlock (WebAuthn)",
      protection:
        "Raw biometrics (fingerprint, facial geometry) NEVER leave the user's hardware device. No biometric templates are transmitted over the network or stored in databases.",
      mechanism:
        "Leverages W3C WebAuthn with SimpleWebAuthn. The platform authenticator (TouchID, FaceID, Windows Hello) signs challenge assertions locally using an asymmetric hardware key pair. The server verifies the assertion signature and counter.",
      limitation:
        "Prototype Limitation: Requires HTTPS or localhost and a supported platform authenticator. Non-secure browser contexts cannot trigger hardware biometric prompts.",
    },
    {
      id: 4,
      icon: <Users className="w-6 h-6 text-emerald-400" />,
      title: "4. M-of-N Social Recovery with Stable DID Key Rotation",
      protection:
        "Prevents permanent identity loss when a holder loses their physical device, without requiring a centralized account administrator.",
      mechanism:
        "A holder designates 3 to 7 trusted guardians with threshold M (e.g., 2 of 3). In an incident, guardians approve single-use authorization codes. Once the threshold is met, the holder rotates to a new cryptographic keypair while keeping their public DID identifier stable.",
      limitation:
        "Prototype Limitation: One-time approval codes are displayed directly in the demo UI for testing convenience. In production, codes must be transmitted via end-to-end encrypted messaging.",
    },
    {
      id: 5,
      icon: <WifiOff className="w-6 h-6 text-emerald-400" />,
      title: "5. Air-Gapped / Offline Verification Mode",
      protection:
        "Enables border guards, remote checkpoints, or disaster-response officials to cryptographically verify travel credentials with ZERO internet connectivity.",
      mechanism:
        "The holder exports a lightweight self-contained JSON bundle containing the selective presentation and public keys. The standalone verify-offline.mjs script verifies signatures, claim integrity, and identity binding with pure Node.js crypto.",
      limitation:
        "Prototype Limitation: Offline verification mathematically guarantees integrity and authenticity, but cannot check dynamic properties like nonce replay freshness or real-time revocation lists.",
    },
    {
      id: 6,
      icon: <Blocks className="w-6 h-6 text-emerald-400" />,
      title: "6. Privacy-Preserving Blockchain Anchoring",
      protection:
        "Enables public, censorship-resistant verification and immutable revocation without exposing any Personally Identifiable Information (PII) on a public ledger.",
      mechanism:
        "The CredentialAnchor smart contract stores only 32-byte cryptographic commitments (hashes). Anyone can query isValid(commitment) without learning who the holder is or what claims exist.",
      limitation:
        "Prototype Limitation: Operates in off-chain mode by default unless connected to a local Hardhat node or Sepolia testnet RPC with funded gas keys.",
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          Architecture & Core Innovations
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          How VeriPass re-engineers digital identity for self-sovereignty, privacy, and cryptographic defense.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {innovations.map((item) => (
          <Card
            key={item.id}
            title={item.title}
            badge={<Badge variant="info">Innovation #{item.id}</Badge>}
          >
            <div className="space-y-3 text-xs leading-relaxed">
              <div className="flex items-center gap-2 mb-2">
                {item.icon}
                <span className="font-semibold text-slate-200 text-sm">Protection Guarantee</span>
              </div>
              <p className="text-slate-300 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                {item.protection}
              </p>

              <div>
                <span className="font-semibold text-slate-400 block mb-1">Cryptographic Mechanism:</span>
                <p className="text-slate-400">{item.mechanism}</p>
              </div>

              <div className="pt-2 border-t border-slate-800/60">
                <span className="font-semibold text-amber-400 block mb-1">Prototype Boundary:</span>
                <p className="text-slate-500 italic">{item.limitation}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
