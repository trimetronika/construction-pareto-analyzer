import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = SQLDatabase.named("construction");

export interface GetWBSDataRequest {
  projectId: string;
  level: number;
  parentItemNumber?: string;
}

export interface WBSItem {
  id: number;
  itemNumber?: string;
  generalWork?: string;
  specificWork?: string;
  description: string;
  totalCost: number;
  cumulativeCost: number;
  cumulativePercentage: number;
  isParetoCritical: boolean;
  itemCount: number;
}

export interface GetWBSDataResponse {
  projectId: string;
  level: number;
  parentItemNumber?: string;
  totalCost: number;
  items: WBSItem[];
}

// Retrieves WBS-level aggregated data for Pareto analysis.
export const getWBSData = api<GetWBSDataRequest, GetWBSDataResponse>(
  { expose: true, method: "GET", path: "/analysis/:projectId/wbs" },
  async (req) => {
    // Verify project exists
    const project = await db.queryRow`
      SELECT id FROM projects WHERE id = ${req.projectId}
    `;
    
    if (!project) {
      throw APIError.notFound("Project not found");
    }
    
    let aggregatedItems: any[] = [];
    
    if (req.level === 1) {
      // Level 1: Aggregate by General Work
      aggregatedItems = await db.queryAll`
        SELECT 
          MIN(id) as id,
          general_work as "generalWork",
          MIN(item_number) as "itemNumber",
          general_work as description,
          SUM(total_cost) as "totalCost",
          COUNT(*) as "itemCount"
        FROM boq_items 
        WHERE project_id = ${req.projectId} AND general_work IS NOT NULL
        GROUP BY general_work
        ORDER BY SUM(total_cost) DESC
      `;
    } else if (req.level === 2) {
      // Level 2: Aggregate by Specific Work under a General Work
      if (!req.parentItemNumber) {
        throw APIError.invalidArgument("Parent item number required for level 2");
      }
      
      aggregatedItems = await db.queryAll`
        SELECT 
          MIN(id) as id,
          specific_work as "specificWork",
          MIN(item_number) as "itemNumber",
          specific_work as description,
          SUM(total_cost) as "totalCost",
          COUNT(*) as "itemCount"
        FROM boq_items 
        WHERE project_id = ${req.projectId} 
          AND specific_work IS NOT NULL
          AND (item_number LIKE ${req.parentItemNumber + '.%'} OR parent_item_number = ${req.parentItemNumber})
        GROUP BY specific_work
        ORDER BY SUM(total_cost) DESC
      `;
    } else {
      // Level 3+: Individual items under a specific parent
      if (!req.parentItemNumber) {
        throw APIError.invalidArgument("Parent item number required for level 3+");
      }
      
      aggregatedItems = await db.queryAll`
        SELECT 
          id,
          item_number as "itemNumber",
          description,
          total_cost as "totalCost",
          1 as "itemCount"
        FROM boq_items 
        WHERE project_id = ${req.projectId} 
          AND parent_item_number = ${req.parentItemNumber}
        ORDER BY total_cost DESC
      `;
    }
    
    if (aggregatedItems.length === 0) {
      return {
        projectId: req.projectId,
        level: req.level,
        parentItemNumber: req.parentItemNumber,
        totalCost: 0,
        items: []
      };
    }
    
    // Calculate cumulative values and Pareto analysis
    const totalCost = aggregatedItems.reduce((sum, item) => sum + item.totalCost, 0);
    let cumulativeCost = 0;
    
    const processedItems = aggregatedItems.map((item, index) => {
      cumulativeCost += item.totalCost;
      const cumulativePercentage = (cumulativeCost / totalCost) * 100;
      const isParetoCritical = cumulativePercentage <= 80;
      
      return {
        id: item.id,
        itemNumber: item.itemNumber,
        generalWork: item.generalWork,
        specificWork: item.specificWork,
        description: item.description,
        totalCost: item.totalCost,
        cumulativeCost,
        cumulativePercentage,
        isParetoCritical,
        itemCount: item.itemCount
      };
    });
    
    return {
      projectId: req.projectId,
      level: req.level,
      parentItemNumber: req.parentItemNumber,
      totalCost,
      items: processedItems
    };
  }
);
