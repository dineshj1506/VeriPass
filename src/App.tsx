import { useState, useEffect } from "react";
import { Wallet } from "./pages/Wallet";
import { ShareVerify } from "./pages/ShareVerify";
import { Tools } from "./pages/Tools";
import { Security } from "./pages/Security";
import { Key, Share2, Compass, Lock, WifiOff, Cpu, ShieldCheck, Globe } from "lucide-react";

export function App() {
  const [activeTab, setActiveTab] = useState<string>("wallet");
  const [currentDid, setCurrentDid] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const savedDid = localStorage.getItem("veripass_did");
    if (savedDid) {
      setCurrentDid(savedDid);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleDidChanged = (did: string) => {
    setCurrentDid(did);
    localStorage.setItem("veripass_did", did);
  };

  const tabs = [
    {
      id: "wallet",
      label: "Digital Passport",
      icon: <Key className="w-4 h-4 text-emerald-400" />,
    },
    {
      id: "share",
      label: "Checkpoint & Verify",
      icon: <Share2 className="w-4 h-4 text-sky-400" />,
    },
    {
      id: "tools",
      label: "Travel & Visa Tools",
      icon: <Compass className="w-4 h-4 text-indigo-400" />,
    },
    {
      id: "security",
      label: "Biometrics & Security",
      icon: <Lock className="w-4 h-4 text-purple-400" />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black antialiased relative overflow-x-hidden">
      {/* Ambient subtle glowing accents */}
      <div className="fixed top-0 left-1/4 w-[32rem] h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[32rem] h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Universal Standard Status Bar */}
      <div className="bg-slate-950/90 border-b border-slate-800/80 px-4 py-1.5 flex flex-wrap items-center justify-between text-[11px] text-slate-300 gap-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-slate-200 font-semibold tracking-wide">
            SELF-SOVEREIGN IDENTITY NETWORK
          </span>
          <span className="text-slate-600">&bull;</span>
          <span className="text-slate-400 font-medium hidden sm:inline">
            W3C Verifiable Credentials &bull; ICAO Doc 9303 Standard
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full text-[10px] text-slate-300 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zero-Knowledge Selective Disclosure &bull; Ed25519</span>
          </span>
        </div>
      </div>

      {/* Offline Status Alert Banner */}
      {!isOnline && (
        <div className="bg-sky-950/90 border-b border-sky-800/80 text-sky-200 text-xs py-2 px-4 text-center flex items-center justify-center gap-2 backdrop-blur-md">
          <WifiOff className="w-4 h-4 text-sky-400 animate-pulse" />
          <span>
            Air-Gapped Offline Mode Active: Standalone cryptographic verification available with zero network access.
          </span>
        </div>
      )}

      {/* Main Header Shelf */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Digital Identity Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-sky-600 to-emerald-500 p-[1.5px] shadow-lg shadow-indigo-500/10">
              <div className="w-full h-full bg-[#070b14] rounded-[10px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base tracking-wider text-white">
                  VERIPASS
                </h1>
                <span className="text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                  DIGITAL e-PASSPORT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Self-Sovereign Identity &bull; Privacy-Preserving Credential Vault
              </p>
            </div>
          </div>

          {/* Connected Sovereign DID Badge */}
          {currentDid && (
            <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800/90 px-3.5 py-1.5 rounded-full text-xs shadow-inner">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-slate-300 text-[11px] hidden md:inline">
                {currentDid.slice(0, 18)}...{currentDid.slice(-6)}
              </span>
              <span className="font-mono text-slate-300 text-[11px] md:hidden">
                {currentDid.slice(0, 12)}...
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
          )}
        </div>

        {/* Tab Controls Bar (100% English Standard) */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex space-x-1 sm:space-x-2 overflow-x-auto scrollbar-none py-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-orange-500/20 to-emerald-500/20 text-white border border-amber-500/40 shadow-sm shadow-amber-500/10 font-bold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === "wallet" && (
          <Wallet currentDid={currentDid} onDidChanged={handleDidChanged} />
        )}
        {activeTab === "share" && <ShareVerify currentDid={currentDid} />}
        {activeTab === "tools" && <Tools currentDid={currentDid} />}
        {activeTab === "security" && <Security currentDid={currentDid} />}
      </main>

      {/* High-Tech Indian Sovereign Identity Footer */}
      <footer className="border-t border-slate-800/70 bg-slate-950/70 py-6 text-center text-xs text-slate-500 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500/90 inline-block" />
            <span className="text-slate-300 font-mono font-medium">
              VERIPASS &bull; REPUBLIC OF INDIA
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            ICAO Doc 9303 Compliant &bull; Indian Biometric e-Passport &bull; DigiLocker W3C Verifiable Credentials
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
