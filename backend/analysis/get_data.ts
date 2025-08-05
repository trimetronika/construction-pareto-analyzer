import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = SQLDatabase.named("construction");

export interface GetAnalysisRequest {
  projectId: string;
}

export interface Project {
  id: string;
  name: string;
  fileName: string;
  uploadedAt: Date;
  status: string;
}

export interface BoQItem {
  id: number;
  itemCode: string;
  itemNumber?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitRate: number;
  totalCost: number;
  cumulativeCost?: number;
  cumulativePercentage?: number;
  isParetoCritical: boolean;
  wbsLevel: number;
  parentItemNumber?: string;
}

export interface GetAnalysisResponse {
  project: Project;
  totalItems: number;
  totalProjectCost: number;
  paretoCriticalItems: number;
  items: BoQItem[];
}

// Retrieves processed analysis data for a project.
export const getAnalysisData = api<GetAnalysisRequest, GetAnalysisResponse>(
  { expose: true, method: "GET", path: "/analysis/:projectId" },
  async (req) => {
    // Get project details
    const project = await db.queryRow`
      SELECT 
        id, name, file_name as "fileName", uploaded_at as "uploadedAt", status
      FROM projects 
      WHERE id = ${req.projectId}
    `;
    
    if (!project) {
      throw APIError.notFound("Project not found");
    }
    
    // Get BoQ items - only return items if project is processed
    let items: BoQItem[] = [];
    let totalProjectCost = 0;
    let paretoCriticalItems = 0;
    
    if (project.status === 'processed') {
      // Get all items for the overall Pareto chart
      items = await db.queryAll<BoQItem>`
        SELECT 
          id, item_code as "itemCode", item_number as "itemNumber",
          description, quantity, unit, unit_rate as "unitRate",
          total_cost as "totalCost", cumulative_cost as "cumulativeCost", 
          cumulative_percentage as "cumulativePercentage", is_pareto_critical as "isParetoCritical",
          wbs_level as "wbsLevel", parent_item_number as "parentItemNumber"
        FROM boq_items 
        WHERE project_id = ${req.projectId}
        ORDER BY total_cost DESC
      `;
      
      // Calculate total project cost from Level 1 items only (to avoid double counting)
      const level1Items = await db.queryAll`
        SELECT SUM(total_cost) as total_cost
        FROM boq_items 
        WHERE project_id = ${req.projectId} AND wbs_level = 1
      `;
      
      totalProjectCost = level1Items[0]?.total_cost || 0;
      paretoCriticalItems = items.filter(item => item.isParetoCritical).length;
    }
    
    return {
      project,
      totalItems: items.length,
      totalProjectCost,
      paretoCriticalItems,
      items
    };
  }
);
