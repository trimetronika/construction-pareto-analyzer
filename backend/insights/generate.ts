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
    
    const items = await db.queryAll`
      SELECT * FROM boq_items 
      WHERE project_id = ${req.projectId}
      ORDER BY total_cost DESC
    `;
    
    if (items.length === 0) {
      throw APIError.invalidArgument("No BoQ items found for analysis");
    }
    
    // Clear existing insights
    await db.exec`DELETE FROM ai_insights WHERE project_id = ${req.projectId}`;
    
    // Analyze top cost items (Pareto critical items)
    const criticalItems = items.filter(item => item.is_pareto_critical);
    const totalProjectCost = items.reduce((sum, item) => sum + item.total_cost, 0);
    
    // Generate insights based on analysis patterns
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
  
  // Insight 1: High-cost item concentration
  if (criticalItems.length > 0) {
    const topItem = criticalItems[0];
    const itemPercentage = (topItem.total_cost / totalProjectCost) * 100;
    
    if (itemPercentage > 15) {
      insights.push({
        insightType: 'cost_concentration',
        title: 'High Cost Concentration Risk',
        description: `Item "${topItem.description}" represents ${itemPercentage.toFixed(1)}% of total project cost. This creates significant cost risk exposure.`,
        recommendation: 'Consider value engineering alternatives, bulk procurement strategies, or alternative material specifications to reduce dependency on high-cost items.',
        potentialSavings: topItem.total_cost * 0.1, // Assume 10% potential savings
        confidenceScore: 0.85
      });
    }
  }
  
  // Insight 2: Material substitution opportunities
  const materialItems = criticalItems.filter(item => 
    item.description.toLowerCase().includes('steel') || 
    item.description.toLowerCase().includes('concrete') ||
    item.description.toLowerCase().includes('cement')
  );
  
  if (materialItems.length > 0) {
    const totalMaterialCost = materialItems.reduce((sum, item) => sum + item.total_cost, 0);
    insights.push({
      insightType: 'material_substitution',
      title: 'Material Substitution Opportunity',
      description: `${materialItems.length} high-cost material items identified. Alternative materials or suppliers could reduce costs.`,
      recommendation: 'Evaluate alternative materials with similar specifications, negotiate with multiple suppliers, or consider prefabricated alternatives.',
      potentialSavings: totalMaterialCost * 0.08, // Assume 8% potential savings
      confidenceScore: 0.75
    });
  }
  
  // Insight 3: Quantity optimization
  const highQuantityItems = criticalItems.filter(item => item.quantity > 1000);
  if (highQuantityItems.length > 0) {
    const totalHighQuantityCost = highQuantityItems.reduce((sum, item) => sum + item.total_cost, 0);
    insights.push({
      insightType: 'quantity_optimization',
      title: 'Bulk Procurement Opportunity',
      description: `${highQuantityItems.length} items with high quantities identified. Bulk procurement could yield significant discounts.`,
      recommendation: 'Negotiate volume discounts, consider just-in-time delivery to reduce storage costs, or explore consortium purchasing with other projects.',
      potentialSavings: totalHighQuantityCost * 0.05, // Assume 5% potential savings
      confidenceScore: 0.70
    });
  }
  
  // Insight 4: Unit rate analysis
  const avgUnitRates = new Map<string, number[]>();
  criticalItems.forEach(item => {
    if (item.unit) {
      if (!avgUnitRates.has(item.unit)) {
        avgUnitRates.set(item.unit, []);
      }
      avgUnitRates.get(item.unit)!.push(item.unit_rate);
    }
  });
  
  for (const [unit, rates] of avgUnitRates) {
    if (rates.length > 1) {
      const maxRate = Math.max(...rates);
      const minRate = Math.min(...rates);
      const variance = ((maxRate - minRate) / minRate) * 100;
      
      if (variance > 20) {
        insights.push({
          insightType: 'rate_variance',
          title: `High Rate Variance for ${unit} Items`,
          description: `Unit rates for ${unit} items vary by ${variance.toFixed(1)}%. This suggests potential for rate standardization.`,
          recommendation: 'Review specifications for similar items, standardize procurement processes, or renegotiate rates with suppliers.',
          potentialSavings: (maxRate - minRate) * rates.length * 100, // Estimated savings
          confidenceScore: 0.65
        });
      }
    }
  }
  
  // Insight 5: Design optimization
  const designItems = criticalItems.filter(item => 
    item.description.toLowerCase().includes('formwork') ||
    item.description.toLowerCase().includes('reinforcement') ||
    item.description.toLowerCase().includes('connection')
  );
  
  if (designItems.length > 0) {
    const totalDesignCost = designItems.reduce((sum, item) => sum + item.total_cost, 0);
    insights.push({
      insightType: 'design_optimization',
      title: 'Design Optimization Potential',
      description: `${designItems.length} design-related items identified in critical cost items. Design modifications could reduce complexity and cost.`,
      recommendation: 'Review structural design for optimization opportunities, consider modular construction methods, or simplify connection details.',
      potentialSavings: totalDesignCost * 0.12, // Assume 12% potential savings
      confidenceScore: 0.80
    });
  }
  
  return insights;
}
