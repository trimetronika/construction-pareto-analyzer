import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface VESuggestionsRequest {
  itemName: string;
  itemDescription: string;
  quantity: number;
  unitRate: number; // base unit rate in currency/unit
  totalCost: number; // base total cost (for validation)
  workCategory: string; // structure | finishing | mep | other
}

export interface OriginalItemSummary {
  itemName: string;
  description: string;
  quantity: number;
  unitRate: number;
  totalCost: number;
}

export interface VEAlternative {
  description: string;
  newUnitRate: number;
  newTotalCost: number;
  estimatedSaving: number;
  savingPercent: number;
  tradeOffs: string;
}

export interface VESuggestionsResponse {
  original: OriginalItemSummary;
  alternatives: VEAlternative[]; // 1-2 items
  notes: string[]; // validation or assumption notes
}

// Gemini API configuration using Encore secrets
const geminiKey = secret("GeminiKey");
const genAI = new GoogleGenerativeAI(geminiKey());

type ModelAlt = {
  description: string;
  savingPercent?: number; // model-proposed percentage (0-100)
  tradeOffs?: string;
};

type ModelPayload = {
  alternatives: ModelAlt[];
};

// Generate realistic Value Engineering (VE) suggestions (Gemini-driven) with bounded, feasible savings.
export const veSuggestions = api<VESuggestionsRequest, VESuggestionsResponse>(
  { expose: true, method: "POST", path: "/insights/ve" },
  async (req) => {
    // Validate input
    if (!req.itemName?.trim() || !req.itemDescription?.trim()) {
      throw APIError.invalidArgument("itemName and itemDescription are required");
    }
    if (req.quantity <= 0 || req.unitRate <= 0 || req.totalCost <= 0 || isNaN(req.quantity) || isNaN(req.unitRate) || isNaN(req.totalCost)) {
      throw APIError.invalidArgument("quantity, unitRate, and totalCost must be positive numbers");
    }

    const notes: string[] = [];
    const name = req.itemName.trim();
    const desc = req.itemDescription.trim();
    const category = (req.workCategory || "other").toLowerCase();

    // Normalize base rates: ensure consistency between unitRate and totalCost
    const derivedUnit = req.totalCost / req.quantity;
    let baseUnitRate = req.unitRate;
    if (Math.abs(baseUnitRate - derivedUnit) / derivedUnit > 0.05) {
      notes.push("Adjusted unit rate to match total cost and quantity for internal calculations.");
      baseUnitRate = derivedUnit;
    }
    const baseTotal = baseUnitRate * req.quantity;

    // Category bounds and suggested range (guides model and clamps results)
    const bounds = categoryBounds(category);
    const [suggestMinPct, suggestMaxPct] = suggestedRangePercent(category);
    const maxAllowedPct = (1 - bounds.minUnitFactor) * 100; // e.g., minUnitFactor 0.75 -> max 25%

    // Build structured prompt for Gemini
    const messages = buildPrompt({
      name,
      desc,
      quantity: req.quantity,
      unitRate: round2(baseUnitRate),
      totalCost: round2(baseTotal),
      category,
      suggestMinPct,
      suggestMaxPct,
      maxAllowedPct,
    });

    // Call Gemini API and parse strict JSON
    let modelAlts: ModelAlt[] = [];
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: messages[1].content }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: "application/json",
        },
      });

      const content = result.response.text();
      const parsed = safeParseJSON(content) as ModelPayload | null;
      if (parsed?.alternatives?.length) {
        modelAlts = parsed.alternatives.slice(0, 2).filter(alt => alt.description && alt.description.trim());
      } else {
        notes.push("Model returned no structured alternatives; using fallback.");
      }
    } catch (e: any) {
      notes.push("Model generation failed; using fallback.");
    }

    // Compute VE alternatives with clamping and floors
    const alts: VEAlternative[] = [];
    for (const m of modelAlts) {
      const descText = (m.description || "").trim();
      if (!descText) continue;

      // Use model-proposed savingPercent if available, else use category mid
      let proposedPct =
        typeof m.savingPercent === "number" && isFinite(m.savingPercent)
          ? Math.max(0, Math.min(100, m.savingPercent)) // Cap at 100%
          : (suggestMinPct + suggestMaxPct) / 2;

      // Clamp to category suggested range, then enforce absolute maxAllowedPct
      const originalPct = proposedPct;
      proposedPct = Math.min(Math.max(proposedPct, suggestMinPct), suggestMaxPct);
      if (proposedPct !== originalPct) {
        notes.push(
          `Adjusted model savingPercent from ${round2(originalPct)}% to ${round2(proposedPct)}% to fit category range.`
        );
      }
      if (proposedPct > maxAllowedPct) {
        notes.push(`Capped savingPercent at ${round2(maxAllowedPct)}% due to category floor.`);
        proposedPct = maxAllowedPct;
      }

      // Convert percent to new unit rate, enforce minUnitFactor
      const proposedUnit = baseUnitRate * (1 - proposedPct / 100);
      const boundedUnit = Math.max(proposedUnit, baseUnitRate * bounds.minUnitFactor);
      let newUnitRate = round2(boundedUnit);
      let newTotalCost = round2(newUnitRate * req.quantity);
      let saving = round2(baseTotal - newTotalCost);

      if (saving < 0) {
        newUnitRate = round2(baseUnitRate);
        newTotalCost = round2(baseTotal);
        saving = 0;
      }

      const savingPercent = baseTotal > 0 ? round2((saving / baseTotal) * 100) : 0;

      alts.push({
        description: descText,
        newUnitRate,
        newTotalCost,
        estimatedSaving: saving,
        savingPercent,
        tradeOffs: (m.tradeOffs || "").trim(),
      });
    }

    // Fallback if modelAlts empty or parsing failed
    if (alts.length === 0) {
      const fallbackRange: [number, number] = [5, 8]; // default percent range for fallback
      const fallbackPct = Math.min((fallbackRange[0] + fallbackRange[1]) / 2, maxAllowedPct);
      const newUnit = Math.max(baseUnitRate * (1 - fallbackPct / 100), baseUnitRate * bounds.minUnitFactor);
      const newTotal = round2(newUnit * req.quantity);
      const saving = Math.max(0, round2(baseTotal - newTotal));
      alts.push({
        description: "Standardize specifications and negotiate framework agreement with suppliers",
        newUnitRate: round2(newUnit),
        newTotalCost: newTotal,
        estimatedSaving: saving,
        savingPercent: baseTotal > 0 ? round2((saving / baseTotal) * 100) : 0,
        tradeOffs: "Requires procurement alignment and volume commitment",
      });
    }

    const response: VESuggestionsResponse = {
      original: {
        itemName: req.itemName,
        description: req.itemDescription,
        quantity: req.quantity,
        unitRate: round2(baseUnitRate),
        totalCost: round2(baseTotal),
      },
      alternatives: alts.slice(0, 2),
      notes,
    };

    return response;
  }
);

// ---------- Helpers ----------

function buildPrompt(input: {
  name: string;
  desc: string;
  quantity: number;
  unitRate: number;
  totalCost: number;
  category: string;
  suggestMinPct: number;
  suggestMaxPct: number;
  maxAllowedPct: number;
}) {
  const { name, desc, quantity, unitRate, totalCost, category, suggestMinPct, suggestMaxPct, maxAllowedPct } = input;

  return [
    {
      role: "system" as const,
      content:
        "You are a construction cost optimization assistant. Given a specific construction item, propose value engineering (VE) alternatives that maintain functionality but reduce cost. Be specific to the item context. Avoid generic suggestions unless they directly apply.",
    },
    {
      role: "user" as const,
      content: [
        "Original Item:",
        `- Name: ${name}`,
        `- Description: ${desc}`,
        `- Quantity: ${quantity}`,
        `- Unit Rate: ${unitRate}`,
        `- Total Cost: ${totalCost}`,
        `- Category: ${category}`,
        "",
        "Task:",
        `Generate 1–2 value engineering alternatives that are specific to the item. For each, provide:`,
        `- description (specific to the original item)`,
        `- savingPercent (number, ${suggestMinPct}–${suggestMaxPct}, never exceed ${maxAllowedPct}%)`,
        `- tradeOffs (risks/considerations)`,
        "",
        "Output strictly in JSON matching this schema (no extra text):",
        `{"alternatives":[{"description":"...","savingPercent":12.5,"tradeOffs":"..."}]}`,
        "",
        "Constraints:",
        "- Do not change scope/function unless explicitly reasonable.",
        "- Prefer material substitution, design refinement, specification standardization, or method change.",
        "- Avoid vague items like 'supplier consolidation' unless clearly applicable to this exact item.",
      ].join("\n"),
    },
  ];
}

function safeParseJSON(s: string): any | null {
  try {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    const jsonString = start !== -1 && end !== -1 ? s.slice(start, end + 1).trim() : s.trim();
    return jsonString ? JSON.parse(jsonString) : null;
  } catch {
    return null;
  }
}

function categoryBounds(category: string): { minUnitFactor: number } {
  switch (category) {
    case "structure":
      return { minUnitFactor: 0.88 }; // up to 12% cut
    case "finishing":
      return { minUnitFactor: 0.7 }; // up to 30% cut
    case "mep":
      return { minUnitFactor: 0.75 }; // up to 25% cut
    default:
      return { minUnitFactor: 0.8 }; // up to 20% cut
  }
}

function suggestedRangePercent(category: string): [number, number] {
  switch (category) {
    case "structure":
      return [4, 10];
    case "finishing":
      return [10, 25];
    case "mep":
      return [8, 20];
    default:
      return [5, 18];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}