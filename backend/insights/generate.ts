import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";

const db = SQLDatabase.named("construction");
// Reserved for future use with LLMs; not used in this deterministic implementation.
const openAIKey = secret("OpenAIKey");

export interface GenerateInsightsRequest {
  projectId: string;
}

export interface AIInsight {
  id: number;
  insightType: string;
  title: string;
  description: string;
  recommendation: string;
  potentialSavings?: number;
  confidenceScore: number;
  createdAt: Date;
}

export interface GenerateInsightsResponse {
  projectId: string;
  insights: AIInsight[];
  totalPotentialSavings: number;
}

// Generates AI-driven insights and recommendations for cost optimization with realistic, bounded savings.
export const generateInsights = api<GenerateInsightsRequest, GenerateInsightsResponse>(
  { expose: true, method: "POST", path: "/insights/generate" },
  async (req) => {
    // Validate project
    const project = await db.queryRow`
      SELECT id, name FROM projects WHERE id = ${req.projectId}
    `;
    if (!project) {
      throw APIError.notFound("Project not found");
    }

    // Fetch current BoQ items (latest processed data)
    const items = await db.queryAll<any>`
      SELECT id, item_code, description, quantity, unit, unit_rate, total_cost, is_pareto_critical, wbs_level
      FROM boq_items 
      WHERE project_id = ${req.projectId}
      ORDER BY total_cost DESC
    `;
    if (items.length === 0) {
      throw APIError.invalidArgument("No BoQ items found for analysis");
    }

    // Compute total project cost based on Level 1 items only to avoid double counting
    const level1Rows = await db.queryAll<{ total_cost: number }>`
      SELECT COALESCE(SUM(total_cost), 0) AS total_cost
      FROM boq_items
      WHERE project_id = ${req.projectId} AND wbs_level = 1
    `;
    const totalProjectCost = level1Rows[0]?.total_cost ?? 0;

    // Refresh insights
    await db.exec`DELETE FROM ai_insights WHERE project_id = ${req.projectId}`;

    // Build insights deterministically with realistic bounds
    const criticalItems = items.filter((it) => it.is_pareto_critical);
    const insights = await generateAnalysisInsights(req.projectId, criticalItems, totalProjectCost);

    // Persist insights
    for (const insight of insights) {
      await db.exec`
        INSERT INTO ai_insights (
          project_id, insight_type, title, description, recommendation, 
          potential_savings, confidence_score
        ) VALUES (
          ${req.projectId}, ${insight.insightType}, ${insight.title}, 
          ${insight.description}, ${insight.recommendation}, 
          ${insight.potentialSavings}, ${insight.confidenceScore}
        )
      `;
    }

    // Return stored insights
    const storedInsights = await db.queryAll<AIInsight>`
      SELECT 
        id, insight_type as "insightType", title, description, recommendation,
        potential_savings as "potentialSavings", confidence_score as "confidenceScore",
        created_at as "createdAt"
      FROM ai_insights 
      WHERE project_id = ${req.projectId}
      ORDER BY potential_savings DESC NULLS LAST
    `;

    const totalPotentialSavings = storedInsights.reduce(
      (sum, i) => sum + (i.potentialSavings || 0),
      0
    );

    return {
      projectId: req.projectId,
      insights: storedInsights,
      totalPotentialSavings,
    };
  }
);

// Helper functions for realistic savings and insight generation
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function generateAnalysisInsights(projectId: string, criticalItems: any[], totalProjectCost: number) {
  const insights: Omit<AIInsight, "id" | "createdAt">[] = [];

  if (totalProjectCost <= 0) {
    return insights;
  }

  // Cost concentration
  if (criticalItems.length > 0) {
    const topItem = criticalItems[0];
    const itemPct = topItem.total_cost / totalProjectCost;
    if (itemPct > 0.15) {
      // Typical achievable saving: 5-12% of the item cost, capped conservatively
      const baseSaving = topItem.total_cost * 0.1;
      const saving = round2(clamp(baseSaving, 0, topItem.total_cost * 0.12));
      insights.push({
        insightType: "cost_concentration",
        title: `High Cost Concentration Risk - ${topItem.item_code}`,
        description: `Item "${topItem.description}" (${topItem.item_code}) accounts for ${(itemPct * 100).toFixed(1)}% of total project cost.`,
        recommendation:
          "Consider value engineering, alternate specifications, or supplier consolidation to reduce reliance on this high-cost item.",
        potentialSavings: saving,
        confidenceScore: 0.85,
      });
    }
  }

  // Material substitution opportunities
  const materialItems = criticalItems.filter((it) => {
    const d = (it.description || "").toLowerCase();
    return (
      d.includes("steel") ||
      d.includes("concrete") ||
      d.includes("cement") ||
      d.includes("material") ||
      d.includes("beton")
    );
  });
  if (materialItems.length > 0) {
    const materialCost = materialItems.reduce((s, it) => s + (it.total_cost || 0), 0);
    // Typical 6–12% achievable via substitutions and supplier competition
    const saving = round2(clamp(materialCost * 0.09, 0, materialCost * 0.12));
    const codes = materialItems.slice(0, 6).map((it) => it.item_code).join(", ");
    insights.push({
      insightType: "material_substitution",
      title: "Material Substitution Opportunity",
      description: `${materialItems.length} high-cost material items identified (${codes}).`,
      recommendation:
        "Evaluate alternative materials and multiple suppliers. Validate compliance with standards and performance requirements.",
      potentialSavings: saving,
      confidenceScore: 0.75,
    });
  }

  // Quantity optimization for very high quantities
  const highQty = criticalItems.filter((it) => (it.quantity || 0) > 100);
  if (highQty.length > 0) {
    const subCost = highQty.reduce((s, it) => s + (it.total_cost || 0), 0);
    // Realistic volume discount 3–7% depending on item
    const saving = round2(clamp(subCost * 0.05, 0, subCost * 0.07));
    insights.push({
      insightType: "quantity_optimization",
      title: "Bulk Procurement Opportunity",
      description: `${highQty.length} items with high quantities suitable for volume discounts.`,
      recommendation:
        "Aggregate orders, negotiate framework agreements, and align deliveries for just-in-time to reduce storage costs.",
      potentialSavings: saving,
      confidenceScore: 0.7,
    });
  }

  // Unit rate variance analysis by unit
  const groups = new Map<string, { rates: number[]; items: any[] }>();
  for (const it of criticalItems) {
    if (it.unit && it.unit_rate > 0) {
      if (!groups.has(it.unit)) groups.set(it.unit, { rates: [], items: [] });
      const g = groups.get(it.unit)!;
      g.rates.push(it.unit_rate);
      g.items.push(it);
    }
  }
  for (const [unit, g] of groups) {
    if (g.rates.length > 1) {
      const maxRate = Math.max(...g.rates);
      const minRate = Math.min(...g.rates);
      if (minRate <= 0) continue;
      const variancePct = (maxRate - minRate) / minRate; // e.g. 0.25 = 25%
      if (variancePct > 0.2) {
        const affectedCost = g.items.reduce((s, it) => s + (it.total_cost || 0), 0);
        // Assume we can recover 40% of the variance through standardization, capped at 12% of affected cost
        const recoverable = variancePct * 0.4;
        const saving = round2(clamp(affectedCost * recoverable, 0, affectedCost * 0.12));
        if (saving > 0) {
          const affectedCodes = g.items.slice(0, 6).map((it) => it.item_code).join(", ");
          insights.push({
            insightType: "rate_variance",
            title: `High Rate Variance for ${unit} Items`,
            description: `Rates vary ${(variancePct * 100).toFixed(1)}%. Items: ${affectedCodes}.`,
            recommendation:
              "Standardize specifications and consolidate suppliers to align pricing across similar items.",
            potentialSavings: saving,
            confidenceScore: 0.65,
          });
        }
      }
    }
  }

  // Design optimization on design-heavy items
  const designItems = criticalItems.filter((it) => {
    const d = (it.description || "").toLowerCase();
    return (
      d.includes("formwork") ||
      d.includes("reinforcement") ||
      d.includes("connection") ||
      d.includes("struktur") ||
      d.includes("bekisting")
    );
  });
  if (designItems.length > 0) {
    const subCost = designItems.reduce((s, it) => s + (it.total_cost || 0), 0);
    // Conservative 6–10% via detailing simplification and constructability improvements
    const saving = round2(clamp(subCost * 0.1, 0, subCost * 0.1));
    insights.push({
      insightType: "design_optimization",
      title: "Design Optimization Potential",
      description: `${designItems.length} design-related critical items indicate optimization opportunities.`,
      recommendation:
        "Simplify details, modularize elements, and refine reinforcement layout to reduce waste and labor time.",
      potentialSavings: saving,
      confidenceScore: 0.8,
    });
  }

  // WBS level concentration
  const byLevel = new Map<number, any[]>();
  for (const it of criticalItems) {
    const lvl = it.wbs_level || 1;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(it);
  }
  for (const [level, arr] of byLevel) {
    const cost = arr.reduce((s, it) => s + (it.total_cost || 0), 0);
    const pct = cost / totalProjectCost;
    if (pct > 0.3 && arr.length >= 3) {
      // Realistic focused optimization 4–7% of that level cost
      const saving = round2(clamp(cost * 0.06, 0, cost * 0.07));
      insights.push({
        insightType: "wbs_concentration",
        title: `WBS Level ${level} Cost Concentration`,
        description: `Level ${level} contains ${arr.length} critical items totaling ${(pct * 100).toFixed(1)}% of project cost.`,
        recommendation: `Prioritize Level ${level} for VE workshops, supplier consolidation, and method reviews.`,
        potentialSavings: saving,
        confidenceScore: 0.72,
      });
    }
  }

  return insights;
}
