import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";

const db = SQLDatabase.named("construction");
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

// Generates AI-driven insights and recommendations for cost optimization.
export const generateInsights = api<GenerateInsightsRequest, GenerateInsightsResponse>(
  { expose: true, method: "POST", path: "/insights/generate" },
  async (req) => {
    // Get project and BoQ data
    const project = await db.queryRow`
      SELECT * FROM projects WHERE id = ${req.projectId}
    `;
    
    if (!project) {
      throw APIError.notFound("Project not found");
    }
    
    // Get the most recent BoQ items (latest processed data)
    const items = await db.queryAll`
      SELECT * FROM boq_items 
      WHERE project_id = ${req.projectId}
      ORDER BY total_cost DESC
    `;
    
    if (items.length === 0) {
      throw APIError.invalidArgument("No BoQ items found for analysis");
    }
    
    // Clear existing insights to generate fresh ones based on current data
    await db.exec`DELETE FROM ai_insights WHERE project_id = ${req.projectId}`;
    
    // Analyze top cost items (Pareto critical items) from current data
    const criticalItems = items.filter(item => item.is_pareto_critical);
    const totalProjectCost = items.reduce((sum, item) => sum + item.total_cost, 0);
    
    // Generate insights based on current analysis patterns
    const insights = await generateAnalysisInsights(req.projectId, criticalItems, totalProjectCost);
    
    // Store insights in database
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
    
    // Get stored insights with IDs
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
      (sum, insight) => sum + (insight.potentialSavings || 0), 0
    );
    
    return {
      projectId: req.projectId,
      insights: storedInsights,
      totalPotentialSavings
    };
  }
);

async function generateAnalysisInsights(projectId: string, criticalItems: any[], totalProjectCost: number) {
  const insights: Omit<AIInsight, 'id' | 'createdAt'>[] = [];
  
  // Get current timestamp for fresh analysis
  const analysisTimestamp = new Date().toISOString();
  
  // Insight 1: High-cost item concentration (based on current critical items)
  if (criticalItems.length > 0) {
    const topItem = criticalItems[0];
    const itemPercentage = (topItem.total_cost / totalProjectCost) * 100;
    
    if (itemPercentage > 15) {
      insights.push({
        insightType: 'cost_concentration',
        title: `High Cost Concentration Risk - ${topItem.item_code}`,
        description: `Item "${topItem.description}" (${topItem.item_code}) represents ${itemPercentage.toFixed(1)}% of total project cost (${topItem.total_cost.toLocaleString()}). This creates significant cost risk exposure.`,
        recommendation: 'Consider value engineering alternatives, bulk procurement strategies, or alternative material specifications to reduce dependency on this high-cost item.',
        potentialSavings: topItem.total_cost * 0.1, // Assume 10% potential savings
        confidenceScore: 0.85
      });
    }
  }
  
  // Insight 2: Material substitution opportunities (based on current critical items)
  const materialItems = criticalItems.filter(item => 
    item.description.toLowerCase().includes('steel') || 
    item.description.toLowerCase().includes('concrete') ||
    item.description.toLowerCase().includes('cement') ||
    item.description.toLowerCase().includes('material') ||
    item.description.toLowerCase().includes('beton')
  );
  
  if (materialItems.length > 0) {
    const totalMaterialCost = materialItems.reduce((sum, item) => sum + item.total_cost, 0);
    const materialCodes = materialItems.map(item => item.item_code).join(', ');
    
    insights.push({
      insightType: 'material_substitution',
      title: 'Material Substitution Opportunity',
      description: `${materialItems.length} high-cost material items identified (${materialCodes}) with total cost of ${totalMaterialCost.toLocaleString()}. Alternative materials or suppliers could reduce costs.`,
      recommendation: 'Evaluate alternative materials with similar specifications, negotiate with multiple suppliers, or consider prefabricated alternatives for these material items.',
      potentialSavings: totalMaterialCost * 0.08, // Assume 8% potential savings
      confidenceScore: 0.75
    });
  }
  
  // Insight 3: Quantity optimization (based on current high-quantity critical items)
  const highQuantityItems = criticalItems.filter(item => item.quantity > 100);
  if (highQuantityItems.length > 0) {
    const totalHighQuantityCost = highQuantityItems.reduce((sum, item) => sum + item.total_cost, 0);
    const avgQuantity = highQuantityItems.reduce((sum, item) => sum + item.quantity, 0) / highQuantityItems.length;
    
    insights.push({
      insightType: 'quantity_optimization',
      title: 'Bulk Procurement Opportunity',
      description: `${highQuantityItems.length} items with high quantities identified (avg: ${avgQuantity.toFixed(0)} units). Total cost: ${totalHighQuantityCost.toLocaleString()}. Bulk procurement could yield significant discounts.`,
      recommendation: 'Negotiate volume discounts, consider just-in-time delivery to reduce storage costs, or explore consortium purchasing with other projects for these high-quantity items.',
      potentialSavings: totalHighQuantityCost * 0.05, // Assume 5% potential savings
      confidenceScore: 0.70
    });
  }
  
  // Insight 4: Unit rate analysis (based on current critical items)
  const avgUnitRates = new Map<string, { rates: number[], items: any[] }>();
  criticalItems.forEach(item => {
    if (item.unit && item.unit_rate > 0) {
      if (!avgUnitRates.has(item.unit)) {
        avgUnitRates.set(item.unit, { rates: [], items: [] });
      }
      avgUnitRates.get(item.unit)!.rates.push(item.unit_rate);
      avgUnitRates.get(item.unit)!.items.push(item);
    }
  });
  
  for (const [unit, data] of avgUnitRates) {
    if (data.rates.length > 1) {
      const maxRate = Math.max(...data.rates);
      const minRate = Math.min(...data.rates);
      const variance = ((maxRate - minRate) / minRate) * 100;
      
      if (variance > 20) {
        const affectedItems = data.items.map(item => item.item_code).join(', ');
        insights.push({
          insightType: 'rate_variance',
          title: `High Rate Variance for ${unit} Items`,
          description: `Unit rates for ${unit} items vary by ${variance.toFixed(1)}% (${minRate.toLocaleString()} - ${maxRate.toLocaleString()}). Affected items: ${affectedItems}.`,
          recommendation: 'Review specifications for similar items, standardize procurement processes, or renegotiate rates with suppliers to achieve consistent pricing.',
          potentialSavings: (maxRate - minRate) * data.rates.length * 50, // Estimated savings
          confidenceScore: 0.65
        });
      }
    }
  }
  
  // Insight 5: Design optimization (based on current design-related critical items)
  const designItems = criticalItems.filter(item => 
    item.description.toLowerCase().includes('formwork') ||
    item.description.toLowerCase().includes('reinforcement') ||
    item.description.toLowerCase().includes('connection') ||
    item.description.toLowerCase().includes('struktur') ||
    item.description.toLowerCase().includes('bekisting')
  );
  
  if (designItems.length > 0) {
    const totalDesignCost = designItems.reduce((sum, item) => sum + item.total_cost, 0);
    const designCodes = designItems.map(item => item.item_code).join(', ');
    
    insights.push({
      insightType: 'design_optimization',
      title: 'Design Optimization Potential',
      description: `${designItems.length} design-related items identified in critical cost items (${designCodes}) with total cost of ${totalDesignCost.toLocaleString()}. Design modifications could reduce complexity and cost.`,
      recommendation: 'Review structural design for optimization opportunities, consider modular construction methods, or simplify connection details for these design elements.',
      potentialSavings: totalDesignCost * 0.12, // Assume 12% potential savings
      confidenceScore: 0.80
    });
  }
  
  // Insight 6: WBS Level concentration analysis
  const wbsLevelGroups = new Map<number, any[]>();
  criticalItems.forEach(item => {
    if (!wbsLevelGroups.has(item.wbs_level)) {
      wbsLevelGroups.set(item.wbs_level, []);
    }
    wbsLevelGroups.get(item.wbs_level)!.push(item);
  });
  
  for (const [level, levelItems] of wbsLevelGroups) {
    if (levelItems.length > 0) {
      const levelCost = levelItems.reduce((sum, item) => sum + item.total_cost, 0);
      const levelPercentage = (levelCost / totalProjectCost) * 100;
      
      if (levelPercentage > 30 && levelItems.length >= 3) {
        insights.push({
          insightType: 'wbs_concentration',
          title: `WBS Level ${level} Cost Concentration`,
          description: `WBS Level ${level} contains ${levelItems.length} critical items representing ${levelPercentage.toFixed(1)}% of total project cost (${levelCost.toLocaleString()}). High concentration at this level indicates potential optimization opportunities.`,
          recommendation: `Focus optimization efforts on WBS Level ${level} items. Consider breaking down complex items, alternative execution methods, or supplier consolidation for this work package.`,
          potentialSavings: levelCost * 0.07, // Assume 7% potential savings
          confidenceScore: 0.72
        });
      }
    }
  }
  
  return insights;
}
