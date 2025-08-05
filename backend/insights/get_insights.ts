import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = SQLDatabase.named("construction");

export interface GetInsightsRequest {
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

export interface GetInsightsResponse {
  projectId: string;
  insights: AIInsight[];
  totalPotentialSavings: number;
}

// Retrieves AI insights for a project.
export const getInsights = api<GetInsightsRequest, GetInsightsResponse>(
  { expose: true, method: "GET", path: "/insights/:projectId" },
  async (req) => {
    // Verify project exists
    const project = await db.queryRow`
      SELECT id FROM projects WHERE id = ${req.projectId}
    `;
    
    if (!project) {
      throw APIError.notFound("Project not found");
    }
    
    // Get insights
    const insights = await db.queryAll<AIInsight>`
      SELECT 
        id, insight_type as "insightType", title, description, recommendation,
        potential_savings as "potentialSavings", confidence_score as "confidenceScore",
        created_at as "createdAt"
      FROM ai_insights 
      WHERE project_id = ${req.projectId}
      ORDER BY potential_savings DESC NULLS LAST
    `;
    
    const totalPotentialSavings = insights.reduce(
      (sum, insight) => sum + (insight.potentialSavings || 0), 0
    );
    
    return {
      projectId: req.projectId,
      insights,
      totalPotentialSavings
    };
  }
);
