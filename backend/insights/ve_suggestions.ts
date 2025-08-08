import { api, APIError } from "encore.dev/api";

export interface VESuggestionsRequest {
  itemName: string;
  itemDescription: string;
  quantity: number;
  unitRate: number;   // base unit rate in currency/unit
  totalCost: number;  // base total cost (for validation)
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

// Generate realistic Value Engineering (VE) suggestions for a given item with bounded, feasible savings.
export const veSuggestions = api<VESuggestionsRequest, VESuggestionsResponse>(
  { expose: true, method: "POST", path: "/insights/ve" },
  async (req) => {
    // Validate input
    if (!req.itemName?.trim() || !req.itemDescription?.trim()) {
      throw APIError.invalidArgument("itemName and itemDescription are required");
    }
    if (!(req.quantity > 0) || !(req.unitRate > 0) || !(req.totalCost > 0)) {
      throw APIError.invalidArgument("quantity, unitRate, and totalCost must be positive numbers");
    }

    const notes: string[] = [];
    const desc = req.itemDescription.trim();
    const name = req.itemName.trim();

    // Normalize base rates: ensure consistency between unitRate and totalCost
    const derivedUnit = req.totalCost / req.quantity;
    let baseUnitRate = req.unitRate;
    // If provided unitRate deviates > 5% from derived, prefer derived (often spreadsheet totals are authoritative)
    if (Math.abs(baseUnitRate - derivedUnit) / derivedUnit > 0.05) {
      notes.push(
        "Adjusted unit rate to match total cost and quantity for internal calculations."
      );
      baseUnitRate = derivedUnit;
    }
    const baseTotal = baseUnitRate * req.quantity;

    // Determine category and keyword context
    const cat = (req.workCategory || "other").toLowerCase();
    const dLow = `${name} ${desc}`.toLowerCase();

    // Build candidate alternatives based on keywords and category
    const candidates = pickAlternatives(cat, dLow);

    // Apply realistic bounds per category to compute new rates/costs
    const bounds = categoryBounds(cat, dLow);
    const alts: VEAlternative[] = [];
    for (const c of candidates.slice(0, 2)) {
      // Choose a conservative reduction within range
      const midPct = (c.reductionMin + c.reductionMax) / 2;
      const proposedUnit = baseUnitRate * (1 - midPct);

      // Enforce category floor (avoid unrealistic deep cuts)
      const boundedUnit = Math.max(proposedUnit, baseUnitRate * bounds.minUnitFactor);
      let newUnitRate = round2(boundedUnit);

      // Recompute totals
      let newTotalCost = round2(newUnitRate * req.quantity);

      // Sanity: new total cannot exceed base total (if it does due to floors, keep but saving 0)
      let saving = round2(baseTotal - newTotalCost);
      if (saving < 0) {
        newTotalCost = baseTotal;
        newUnitRate = round2(baseUnitRate);
        saving = 0;
      }
      // Never exceed original total
      saving = Math.min(saving, baseTotal);
      const savingPercent = baseTotal > 0 ? round2((saving / baseTotal) * 100) : 0;

      alts.push({
        description: c.description,
        newUnitRate,
        newTotalCost,
        estimatedSaving: saving,
        savingPercent,
        tradeOffs: c.tradeoffs,
      });
    }

    // Ensure at least one alternative exists (fallback generic)
    if (alts.length === 0) {
      const generic = {
        description: "Standardize specifications and negotiate framework agreement with suppliers",
        reductionMin: 0.04,
        reductionMax: 0.08,
        tradeoffs:
          "Requires procurement alignment and volume commitment; minimal functional risk if specs remain compliant.",
      };
      const pct = (generic.reductionMin + generic.reductionMax) / 2;
      const newUnit = Math.max(baseUnitRate * (1 - pct), baseUnitRate * 0.9);
      const newTotal = round2(newUnit * req.quantity);
      const saving = Math.max(0, round2(baseTotal - newTotal));
      alts.push({
        description: generic.description,
        newUnitRate: round2(newUnit),
        newTotalCost: newTotal,
        estimatedSaving: saving,
        savingPercent: baseTotal > 0 ? round2((saving / baseTotal) * 100) : 0,
        tradeOffs: generic.tradeoffs,
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
      alternatives: alts,
      notes,
    };

    return response;
  }
);

type CandidateAlt = {
  description: string;
  reductionMin: number; // fraction, e.g., 0.1 = 10%
  reductionMax: number;
  tradeoffs: string;
};

function pickAlternatives(category: string, text: string): CandidateAlt[] {
  const alts: CandidateAlt[] = [];
  const has = (k: string) => text.includes(k);

  if (category === "finishing") {
    if (has("tile") || has("floor")) {
      alts.push(
        {
          description: "Use smaller-size ceramic/homogeneous tile or local brand equivalent",
          reductionMin: 0.12,
          reductionMax: 0.2,
          tradeoffs: "More grout lines and slightly less premium look; performance acceptable for most areas.",
        },
        {
          description: "Switch to vinyl plank/roll flooring where suitable",
          reductionMin: 0.2,
          reductionMax: 0.3,
          tradeoffs: "Lower abrasion resistance and heat tolerance; avoid heavy-traffic or wet areas.",
        }
      );
    } else if (has("paint")) {
      alts.push(
        {
          description: "Use high-coverage economy paint line with approved primer",
          reductionMin: 0.1,
          reductionMax: 0.18,
          tradeoffs: "May require periodic repainting; initial appearance comparable with proper primer.",
        },
        {
          description: "Optimize paint system (reduce coats with higher-solids paint)",
          reductionMin: 0.08,
          reductionMax: 0.15,
          tradeoffs: "Requires surface prep control; ensure thickness meets spec.",
        }
      );
    } else {
      alts.push(
        {
          description: "Standardize finishes across rooms/areas to leverage bulk procurement",
          reductionMin: 0.08,
          reductionMax: 0.15,
          tradeoffs: "Reduced variety; minor impact on aesthetics.",
        }
      );
    }
  } else if (category === "structure") {
    if (has("concrete") || has("beton")) {
      alts.push(
        {
          description: "Use blended cement (PPC/PSC) with SCM substitution (20–30%)",
          reductionMin: 0.03,
          reductionMax: 0.08,
          tradeoffs: "Slightly longer setting time; verify design exposure class and early strength needs.",
        }
      );
    }
    if (has("slab") || has("floor") || has("pavement")) {
      alts.push(
        {
          description: "Use welded wire mesh (WWM) for slab reinforcement instead of individual bars",
          reductionMin: 0.05,
          reductionMax: 0.12,
          tradeoffs: "Less flexible for localized detailing; ensure lap lengths and panel layout suit geometry.",
        }
      );
    }
    if (has("formwork") || has("bekisting")) {
      alts.push(
        {
          description: "Adopt reusable system formwork with optimized cycle time",
          reductionMin: 0.06,
          reductionMax: 0.1,
          tradeoffs: "Requires planning and standardization of dimensions; potential learning curve on site.",
        }
      );
    }
    if (alts.length === 0) {
      alts.push(
        {
          description: "Optimize reinforcement detailing and splice locations (design-to-build refinement)",
          reductionMin: 0.04,
          reductionMax: 0.08,
          tradeoffs: "Needs design coordination; no functional compromise if code-compliant.",
        }
      );
    }
  } else if (category === "mep") {
    if (has("pipe") || has("piping")) {
      alts.push(
        {
          description: "Use PPR/uPVC pipes for non-pressurized or cold-water lines instead of copper/GI",
          reductionMin: 0.15,
          reductionMax: 0.25,
          tradeoffs: "Temperature/pressure limitations; confirm with duty conditions and standards.",
        }
      );
    }
    if (has("cable") || has("feeder") || has("power")) {
      alts.push(
        {
          description: "Use aluminum conductors for large feeders in lieu of copper (where code-permitted)",
          reductionMin: 0.1,
          reductionMax: 0.2,
          tradeoffs: "Larger cross-section and terminations; ensure lugs/hardware compatibility and voltage drop checks.",
        }
      );
    }
    if (has("duct") || has("hvac") || has("fan")) {
      alts.push(
        {
          description: "Optimize duct sizing and layout; standardize gauges and fittings",
          reductionMin: 0.08,
          reductionMax: 0.15,
          tradeoffs: "Requires re-checking pressure losses; coordinate with architectural constraints.",
        }
      );
    }
    if (alts.length === 0) {
      alts.push(
        {
          description: "Standardize MEP materials and consolidate vendors for volume discounts",
          reductionMin: 0.08,
          reductionMax: 0.15,
          tradeoffs: "Limited brand options; ensure compliance certificates are obtained.",
        }
      );
    }
  } else {
    // Generic category
    alts.push(
      {
        description: "Supplier consolidation and specification standardization",
        reductionMin: 0.06,
        reductionMax: 0.12,
        tradeoffs: "Reduced variety; ensure functional equivalence.",
      }
    );
  }

  return alts;
}

function categoryBounds(category: string, text: string): { minUnitFactor: number } {
  // Defines the minimum allowable unit rate factor to prevent unrealistic deep cuts
  // e.g., minUnitFactor = 0.85 means newUnitRate >= 85% of baseUnitRate
  switch (category) {
    case "structure":
      return { minUnitFactor: 0.88 }; // 12% max cut
    case "finishing":
      // More flexibility on finishes
      return { minUnitFactor: 0.7 }; // up to 30% cut
    case "mep":
      return { minUnitFactor: 0.75 }; // up to 25% cut
    default:
      return { minUnitFactor: 0.8 }; // default 20% cut
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
