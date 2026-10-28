import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repository, writeAuditLog } from "../store.js";
export const toolsRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RULES_PATH = path.resolve(__dirname, "../rules/visa-rules.json");
// ==========================================
// Phase 8: AI-driven Smart Form Filler
// ==========================================
const SYNONYM_MAP = {
    fullName: ["name", "full name", "applicant name", "given name", "holder name", "passenger name", "traveler name"],
    passportNumber: ["passport", "passport no", "passport number", "travel document number", "doc number"],
    nationality: ["nationality", "citizenship", "country of citizenship", "issuing country", "country"],
    dateOfBirth: ["dob", "birth date", "date of birth", "birthday", "born"],
    expiryDate: ["passport expiry", "expiration date", "expiry date", "valid until"],
    accountNumber: ["account", "account number", "bank account", "bank account number"],
    balanceUsd: ["funds", "proof of funds", "bank balance", "account balance", "balance", "financial standing"],
    flightNumber: ["flight", "flight number", "flight no", "outbound flight"],
    departureDate: ["departure", "travel date", "departure date", "start date"],
    returnDate: ["return", "return date", "arrival date", "end date"],
    policyNumber: ["insurance policy", "policy number", "insurance id"],
    coverageAmountUsd: ["coverage", "insurance coverage", "medical coverage"],
    destinationCountry: ["destination", "destination country", "target country"],
};
function normalizeString(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
}
/**
 * Optional Anthropic LLM refinement boundary.
 * Sends ONLY field labels and claim names - NEVER claim values!
 */
async function refineMatchesWithAnthropic(lowConfidenceFields, availableClaimNames) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || lowConfidenceFields.length === 0) {
        return {};
    }
    try {
        const prompt = `You are a data-matching assistant for a privacy-preserving digital identity system.
Match each form field to the most appropriate claim name from the available claims list.
DO NOT fabricate claim names. Return ONLY a JSON object mapping field name to matching claim name.
If no good match exists, map it to null.

Available claims: ${JSON.stringify(availableClaimNames)}
Form fields: ${JSON.stringify(lowConfidenceFields)}

Respond with valid JSON only.`;
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-3-haiku-20240307",
                max_tokens: 300,
                messages: [{ role: "user", content: prompt }],
            }),
        });
        if (response.ok) {
            const data = (await response.json());
            const text = data.content?.[0]?.text || "{}";
            const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(cleaned);
        }
    }
    catch (err) {
        console.warn("Anthropic LLM match refinement failed, fallback to deterministic matcher:", err);
    }
    return {};
}
/**
 * POST /api/tools/form-filler
 */
toolsRouter.post("/form-filler", async (req, res) => {
    const { did, fields, consent } = req.body || {};
    // Hard Rule: Explicit consent required
    if (!consent) {
        res.status(400).json({
            error: "Explicit user consent is mandatory before reading claims for form filling.",
        });
        return;
    }
    if (!did || !Array.isArray(fields)) {
        res.status(400).json({ error: "did and fields (array) are required" });
        return;
    }
    const wallet = repository.getWallet(did);
    const activeCredentials = wallet.filter((w) => !w.credential.revoked);
    // Aggregate all available claims
    const availableClaims = {};
    for (const cred of activeCredentials) {
        Object.assign(availableClaims, cred.claims);
    }
    const claimNames = Object.keys(availableClaims);
    const suggestions = [];
    const unassignedFields = [];
    for (const field of fields) {
        const normLabel = normalizeString(field.label || field.name);
        const normName = normalizeString(field.name);
        let matchedClaim = null;
        let confidence = "none";
        let reason = "No confident claim match identified";
        // Direct exact claim name match
        if (field.name in availableClaims) {
            matchedClaim = field.name;
            confidence = "high";
            reason = "Direct claim key match in credentials";
        }
        // Synonym matching
        if (!matchedClaim) {
            for (const [claimKey, synonyms] of Object.entries(SYNONYM_MAP)) {
                if (!availableClaims[claimKey])
                    continue;
                for (const syn of synonyms) {
                    if (normLabel === syn || normName === syn) {
                        matchedClaim = claimKey;
                        confidence = "high";
                        reason = `High-confidence match via synonym '${syn}'`;
                        break;
                    }
                    else if (normLabel.includes(syn) || syn.includes(normLabel)) {
                        matchedClaim = claimKey;
                        confidence = "medium";
                        reason = `Normalized token overlap with synonym '${syn}'`;
                    }
                }
                if (confidence === "high")
                    break;
            }
        }
        if (matchedClaim && availableClaims[matchedClaim] !== undefined) {
            suggestions.push({
                fieldName: field.name,
                claimName: matchedClaim,
                suggestedValue: availableClaims[matchedClaim],
                confidence,
                reason,
            });
        }
        else {
            unassignedFields.push(field);
        }
    }
    // Optional LLM refinement for low-confidence / unmatched fields (NO claim values sent!)
    if (unassignedFields.length > 0 && process.env.ANTHROPIC_API_KEY) {
        const llmMatches = await refineMatchesWithAnthropic(unassignedFields, claimNames);
        for (const field of unassignedFields) {
            const match = llmMatches[field.name];
            if (match && availableClaims[match] !== undefined) {
                suggestions.push({
                    fieldName: field.name,
                    claimName: match,
                    suggestedValue: availableClaims[match],
                    confidence: "medium",
                    reason: "Identified via privacy-preserving AI semantic match",
                });
            }
            else {
                suggestions.push({
                    fieldName: field.name,
                    confidence: "none",
                    reason: "No corresponding verified credential claim found",
                });
            }
        }
    }
    else {
        for (const field of unassignedFields) {
            suggestions.push({
                fieldName: field.name,
                confidence: "none",
                reason: "No corresponding verified credential claim found",
            });
        }
    }
    writeAuditLog({
        action: "FORM_FILLER_SUGGESTION",
        decision: "ALLOW",
        reason: `Generated ${suggestions.length} suggestions with user consent (never auto-submitted)`,
        details: { did, fieldsCount: fields.length },
    });
    res.json({
        suggestions,
        consentGiven: true,
        disclaimer: "These are suggestions only and have NOT been submitted. Review and approve each field individually.",
    });
});
function loadVisaRules() {
    try {
        const raw = fs.readFileSync(RULES_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return {
            default: {
                name: "Standard International Travel Profile",
                countries: ["*"],
                minPassportValidityMonths: 6,
                recommendedValidityMonths: 6,
                requiredCredentialTypes: ["PassportCredential", "BankStatementCredential"],
                insuranceMinCoverageUsd: 25000,
                requiresRepatriation: false,
                minFundsPerDayUsd: 50,
                source: "General international guidance. Prototype demo rules only.",
            },
        };
    }
}
/**
 * POST /api/tools/visa-simulator
 */
toolsRouter.post("/visa-simulator", (req, res) => {
    const { did, destination, travelDate, tripDurationDays } = req.body || {};
    if (!did || !destination || !travelDate || typeof tripDurationDays !== "number") {
        res.status(400).json({ error: "did, destination, travelDate, and tripDurationDays are required" });
        return;
    }
    const wallet = repository.getWallet(did);
    const activeCredentials = wallet.filter((w) => !w.credential.revoked);
    const rules = loadVisaRules();
    const destUpper = destination.toUpperCase().trim();
    // Find profile
    let profile = rules.default;
    for (const key of Object.keys(rules)) {
        if (rules[key].countries.map((c) => c.toUpperCase()).includes(destUpper)) {
            profile = rules[key];
            break;
        }
    }
    let score = 0;
    const issues = [];
    const checklist = [];
    const travelDateTime = new Date(travelDate).getTime();
    const returnDateTime = travelDateTime + tripDurationDays * 24 * 60 * 60 * 1000;
    // 1. Passport Credential Check (25 pts)
    const passportCred = activeCredentials.find((c) => c.credential.type.includes("PassportCredential"));
    if (passportCred) {
        score += 25;
        checklist.push({
            item: "Valid Passport Credential",
            satisfied: true,
            note: `Issued for ${passportCred.claims.fullName || "Holder"} (${passportCred.claims.nationality || "N/A"})`,
        });
        // Passport Expiry Check (25 pts)
        const expiryStr = passportCred.claims.expiryDate;
        if (expiryStr) {
            const expiryTime = new Date(expiryStr).getTime();
            const monthsUntilExpiry = (expiryTime - returnDateTime) / (1000 * 60 * 60 * 24 * 30.44);
            if (monthsUntilExpiry >= profile.minPassportValidityMonths) {
                score += 25;
                checklist.push({
                    item: `Passport Validity (${profile.minPassportValidityMonths}+ Months Remaining)`,
                    satisfied: true,
                    note: `Passport valid until ${expiryStr} (${Math.floor(monthsUntilExpiry)} months beyond travel)`,
                });
            }
            else if (monthsUntilExpiry > 0) {
                score += 10;
                issues.push({
                    severity: "blocker",
                    message: `Passport expires on ${expiryStr}. ${profile.name} requires at least ${profile.minPassportValidityMonths} months validity past departure.`,
                });
                checklist.push({
                    item: `Passport Validity (${profile.minPassportValidityMonths}+ Months Remaining)`,
                    satisfied: false,
                    note: `Only ${Math.floor(monthsUntilExpiry)} months remaining past travel date. Renewal required.`,
                });
            }
            else {
                issues.push({
                    severity: "blocker",
                    message: `Passport is already expired or expires before return date (${expiryStr}).`,
                });
                checklist.push({
                    item: "Passport Validity",
                    satisfied: false,
                    note: `Expired on ${expiryStr}.`,
                });
            }
        }
        else {
            issues.push({ severity: "warning", message: "Passport credential missing expiryDate claim." });
        }
    }
    else {
        issues.push({
            severity: "blocker",
            message: "No active Passport Credential found in your wallet. Cannot verify international travel eligibility.",
        });
        checklist.push({
            item: "Valid Passport Credential",
            satisfied: false,
            note: "Missing in wallet. Issue or import a Passport credential.",
        });
    }
    // 2. Proof of Funds Check (25 pts)
    const bankCred = activeCredentials.find((c) => c.credential.type.includes("BankStatementCredential"));
    const requiredFunds = Math.max(500, tripDurationDays * profile.minFundsPerDayUsd);
    if (bankCred) {
        const balance = Number(bankCred.claims.balanceUsd || 0);
        if (balance >= requiredFunds) {
            score += 25;
            checklist.push({
                item: `Sufficient Proof of Funds (Est. $${requiredFunds})`,
                satisfied: true,
                note: `Verified balance: $${balance.toLocaleString()} USD (meets $${profile.minFundsPerDayUsd}/day threshold)`,
            });
        }
        else {
            score += 10;
            issues.push({
                severity: "warning",
                message: `Verified funds ($${balance.toLocaleString()}) are below estimated minimum of $${requiredFunds.toLocaleString()} for a ${tripDurationDays}-day stay.`,
            });
            checklist.push({
                item: `Sufficient Proof of Funds (Est. $${requiredFunds})`,
                satisfied: false,
                note: `Current balance: $${balance.toLocaleString()} USD`,
            });
        }
    }
    else {
        issues.push({
            severity: "warning",
            message: "No Bank Statement Credential found to demonstrate proof of sufficient funds.",
        });
        checklist.push({
            item: "Proof of Financial Solvency",
            satisfied: false,
            note: "Bank Statement Credential recommended for consular review.",
        });
    }
    // 3. Travel Insurance & Supporting Documents (25 pts)
    const insuranceCred = activeCredentials.find((c) => c.credential.type.includes("InsuranceCredential"));
    const itineraryCred = activeCredentials.find((c) => c.credential.type.includes("ItineraryCredential"));
    if (insuranceCred) {
        const coverage = Number(insuranceCred.claims.coverageAmountUsd || 0);
        const repatriation = Boolean(insuranceCred.claims.repatriationIncluded);
        if (coverage >= profile.insuranceMinCoverageUsd && (!profile.requiresRepatriation || repatriation)) {
            score += 15;
            checklist.push({
                item: `Travel Medical Insurance (Min $${profile.insuranceMinCoverageUsd.toLocaleString()})`,
                satisfied: true,
                note: `Coverage: $${coverage.toLocaleString()} USD with medical repatriation included`,
            });
        }
        else {
            score += 5;
            issues.push({
                severity: "warning",
                message: `Insurance coverage ($${coverage.toLocaleString()}) may be lower than destination minimum ($${profile.insuranceMinCoverageUsd.toLocaleString()}).`,
            });
            checklist.push({
                item: "Travel Medical Insurance",
                satisfied: false,
                note: `Current coverage $${coverage.toLocaleString()} USD`,
            });
        }
    }
    else if (profile.requiredCredentialTypes.includes("InsuranceCredential")) {
        issues.push({
            severity: "warning",
            message: `${profile.name} strongly mandates comprehensive travel health and repatriation insurance.`,
        });
        checklist.push({
            item: "Mandatory Schengen/Travel Insurance",
            satisfied: false,
            note: "No insurance credential found.",
        });
    }
    else {
        checklist.push({
            item: "Travel Health Insurance",
            satisfied: false,
            note: "Optional but recommended for international journeys.",
        });
    }
    if (itineraryCred) {
        score += 10;
        checklist.push({
            item: "Confirmed Travel Itinerary",
            satisfied: true,
            note: `Flight ${itineraryCred.claims.flightNumber || "Confirmed"} with accommodation proof`,
        });
    }
    else {
        checklist.push({
            item: "Confirmed Travel Itinerary",
            satisfied: false,
            note: "Round-trip ticket and accommodation proof may be requested by border control.",
        });
    }
    // Timeline generation
    const daysUntilTravel = Math.max(0, Math.floor((travelDateTime - Date.now()) / (1000 * 60 * 60 * 24)));
    const timeline = [
        {
            stage: "Application Submission",
            targetDate: new Date(travelDateTime - 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            description: "Submit visa dossier and biometric appointment (recommended 30-45 days before flight).",
        },
        {
            stage: "Document Verification",
            targetDate: new Date(travelDateTime - 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            description: "Consular review of passport, proof of funds, and itinerary credentials.",
        },
        {
            stage: "Departure & Border Entry",
            targetDate: travelDate,
            description: `Present selective disclosure presentation at border control for ${profile.name}.`,
        },
    ];
    res.json({
        destination: destUpper,
        profileName: profile.name,
        readinessScore: Math.min(100, score),
        daysUntilTravel,
        checklist,
        issues,
        timeline,
        ruleSource: profile.source,
        disclaimer: "DISCLAIMER: This simulator is a prototype educational planning tool. Visa rules change frequently. Always consult the official embassy or consulate website of the destination state.",
    });
});
