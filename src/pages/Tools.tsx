import { useState, useEffect, useRef } from "react";
import { Button, Card, Input, Badge, AlertBanner } from "../components/ui";
import { api } from "../api";
import { Compass, Sparkles, Check, AlertCircle, Calendar, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

interface ToolsProps {
  currentDid: string | null;
}

export function Tools({ currentDid }: ToolsProps) {
  // Tab state: "visa" | "form"
  const [activeTab, setActiveTab] = useState<"visa" | "form">("visa");

  // Visa Simulator state
  const [destination, setDestination] = useState<string>("FRANCE");
  const [travelDate, setTravelDate] = useState<string>("2026-11-01");
  const [tripDuration, setTripDuration] = useState<number>(14);
  const [visaResult, setVisaResult] = useState<any | null>(null);
  const [visaLoading, setVisaLoading] = useState<boolean>(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form Filler state
  const [formConsent, setFormConsent] = useState<boolean>(false);
  const [fillerLoading, setFillerLoading] = useState<boolean>(false);
  const [fillerSuggestions, setFillerSuggestions] = useState<any[]>([]);
  const [fillerError, setFillerError] = useState<string | null>(null);

  // Form Field inputs state
  const [formFields, setFormFields] = useState<Record<string, string>>({
    fullName: "",
    passportNumber: "",
    nationality: "",
    dateOfBirth: "",
    expiryDate: "",
    accountNumber: "",
    flightNumber: "",
  });

  const FORM_FIELD_DEFINITIONS = [
    { name: "fullName", label: "Full Applicant Name" },
    { name: "passportNumber", label: "Passport Document Number" },
    { name: "nationality", label: "Country of Citizenship" },
    { name: "dateOfBirth", label: "Date of Birth (YYYY-MM-DD)" },
    { name: "expiryDate", label: "Passport Expiration Date" },
    { name: "accountNumber", label: "Bank Account Identifier" },
    { name: "flightNumber", label: "Inbound Flight Number" },
  ];

  // Debounced Visa Simulator recalculation (400ms)
  useEffect(() => {
    if (!currentDid) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        setVisaLoading(true);
        const res = await api.runVisaSimulator(
          currentDid,
          destination,
          travelDate,
          Number(tripDuration)
        );
        setVisaResult(res);
      } catch (err: any) {
        console.error("Visa simulation error", err);
      } finally {
        setVisaLoading(false);
      }
    }, 400);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [currentDid, destination, travelDate, tripDuration]);

  // Form Filler trigger
  const handleAutoFill = async () => {
    if (!currentDid) return;
    if (!formConsent) {
      setFillerError("Explicit user consent is mandatory before reading claims for form filling.");
      return;
    }

    try {
      setFillerLoading(true);
      setFillerError(null);
      const res = await api.runSmartFormFiller(currentDid, FORM_FIELD_DEFINITIONS, true);
      setFillerSuggestions(res.suggestions || []);
    } catch (err: any) {
      setFillerError(err.message);
    } finally {
      setFillerLoading(false);
    }
  };

  // Accept suggestion one by one
  const handleAcceptSuggestion = (fieldName: string, value: any) => {
    setFormFields((prev) => ({
      ...prev,
      [fieldName]: String(value),
    }));
    // Remove suggestion after accepting
    setFillerSuggestions((prev) => prev.filter((s) => s.fieldName !== fieldName));
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
      {/* Tab Selector */}
      <div className="flex bg-slate-900/70 p-1 rounded-2xl border border-slate-800/80 w-fit">
        <button
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "visa"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          onClick={() => setActiveTab("visa")}
        >
          <Compass className="w-4 h-4" />
          Consular Visa Intelligence
        </button>
        <button
          className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "form"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
          onClick={() => setActiveTab("form")}
        >
          <Sparkles className="w-4 h-4" />
          AI Sovereign Form Filler
        </button>
      </div>

      {/* ============================================================== */}
      {/* 1. REAL-TIME VISA SIMULATOR TAB */}
      {/* ============================================================== */}
      {activeTab === "visa" && (
        <div className="space-y-6">
          <Card
            title="Travel Parameters"
            subtitle="Updates readiness calculation within 400ms of any parameter change."
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Destination Country:
                </label>
                <select
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  <option value="FRANCE">France (Schengen EU)</option>
                  <option value="GERMANY">Germany (Schengen EU)</option>
                  <option value="SPAIN">Spain (Schengen EU)</option>
                  <option value="ITALY">Italy (Schengen EU)</option>
                  <option value="JAPAN">Japan (Standard International)</option>
                  <option value="UNITED KINGDOM">United Kingdom (International)</option>
                </select>
              </div>

              <Input
                label="Departure Date:"
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
              />

              <Input
                label="Duration of Stay (Days):"
                type="number"
                min={1}
                max={180}
                value={tripDuration}
                onChange={(e) => setTripDuration(Math.max(1, Number(e.target.value)))}
              />
            </div>
          </Card>

          {/* Results Display */}
          {visaResult && (
            <div className="space-y-6">
              {/* Readiness Score Progress Bar */}
              <Card
                title={`Visa Readiness Score: ${visaResult.readinessScore}%`}
                subtitle={`Evaluated under profile: ${visaResult.profileName}`}
                badge={
                  visaLoading ? (
                    <Badge variant="neutral">Recalculating...</Badge>
                  ) : visaResult.readinessScore >= 80 ? (
                    <Badge variant="success">High Readiness</Badge>
                  ) : visaResult.readinessScore >= 50 ? (
                    <Badge variant="warning">Moderate Readiness</Badge>
                  ) : (
                    <Badge variant="danger">Action Required</Badge>
                  )
                }
              >
                <div className="w-full bg-slate-950 rounded-full h-4 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      visaResult.readinessScore >= 80
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : visaResult.readinessScore >= 50
                        ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                        : "bg-gradient-to-r from-rose-600 to-rose-400"
                    }`}
                    style={{ width: `${visaResult.readinessScore}%` }}
                  />
                </div>
              </Card>

              {/* Issues & Blockers */}
              {visaResult.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-200">Identified Gaps:</h4>
                  <div className="space-y-2">
                    {visaResult.issues.map((issue: any, idx: number) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                          issue.severity === "blocker"
                            ? "bg-rose-950/40 border-rose-800/80 text-rose-200"
                            : "bg-amber-950/40 border-amber-800/80 text-amber-200"
                        }`}
                      >
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="text-xs">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Document Checklist */}
              <Card title="Document Verification Checklist">
                <div className="divide-y divide-slate-800/60">
                  {visaResult.checklist.map((c: any, idx: number) => (
                    <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2.5">
                        {c.satisfied ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span
                            className={`font-semibold ${
                              c.satisfied ? "text-slate-200" : "text-slate-400"
                            }`}
                          >
                            {c.item}
                          </span>
                          <p className="text-slate-400 text-[11px] mt-0.5">{c.note}</p>
                        </div>
                      </div>
                      <Badge variant={c.satisfied ? "success" : "neutral"}>
                        {c.satisfied ? "Satisfied" : "Missing / Action"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Timeline */}
              <Card title="Recommended Application Timeline">
                <div className="space-y-3">
                  {visaResult.timeline.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-3 text-xs"
                    >
                      <Calendar className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{item.stage}</span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            ({item.targetDate})
                          </span>
                        </div>
                        <p className="text-slate-400 text-[11px] mt-1">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Source & Prominent Disclaimer */}
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-xs space-y-1">
                <div className="text-slate-400">
                  <strong>Source Note:</strong> {visaResult.ruleSource}
                </div>
                <div className="text-amber-400 font-medium pt-1">
                  {visaResult.disclaimer}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. AI-DRIVEN SMART FORM FILLER TAB */}
      {/* ============================================================== */}
      {activeTab === "form" && (
        <div className="space-y-6">
          <Card
            title="Consular Visa Application Form"
            subtitle="Demonstration form. Values are suggested from your verifiable credentials and must be accepted individually."
          >
            {fillerError && (
              <AlertBanner type="danger" title="Consent / Matching Error" message={fillerError} />
            )}

            {/* Mandatory User Consent Checkbox */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
                  checked={formConsent}
                  onChange={(e) => setFormConsent(e.target.checked)}
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-200 block">
                    Explicit Holder Consent for AI Form Filling (Required)
                  </span>
                  <span className="text-slate-400 leading-relaxed block mt-0.5">
                    I explicitly authorize VeriPass to inspect my stored credentials to suggest values.
                    Suggestions are never automatically submitted and require individual approval.
                  </span>
                </div>
              </label>

              <Button
                variant="primary"
                onClick={handleAutoFill}
                disabled={!formConsent}
                loading={fillerLoading}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Auto-Suggest Field Values
              </Button>
            </div>

            {/* Suggested Values Pending Review */}
            {fillerSuggestions.length > 0 && (
              <div className="p-4 bg-slate-950/80 border border-emerald-800/40 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Pending AI Suggestions (Review & Accept Individually):</span>
                </div>

                <div className="space-y-2">
                  {fillerSuggestions.map((s) => (
                    <div
                      key={s.fieldName}
                      className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{s.fieldName}:</span>
                          <span className="font-mono text-emerald-400 font-bold">
                            {String(s.suggestedValue ?? "None")}
                          </span>
                          <Badge
                            variant={
                              s.confidence === "high"
                                ? "success"
                                : s.confidence === "medium"
                                ? "warning"
                                : "neutral"
                            }
                          >
                            {s.confidence} confidence
                          </Badge>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {s.reason}
                        </span>
                      </div>

                      {s.suggestedValue !== undefined && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAcceptSuggestion(s.fieldName, s.suggestedValue)}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Accept Value
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Form Fields Display */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {FORM_FIELD_DEFINITIONS.map((def) => (
                <Input
                  key={def.name}
                  label={def.label}
                  value={formFields[def.name] || ""}
                  onChange={(e) =>
                    setFormFields({ ...formFields, [def.name]: e.target.value })
                  }
                  placeholder={`Enter ${def.label}...`}
                />
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Notice: Form filler never auto-submits any application.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => alert("Demo application completed! Verified credentials preserved sovereignty.")}
              >
                Submit Demo Application
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
