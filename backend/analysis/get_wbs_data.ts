import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = SQLDatabase.named("construction");

export interface GetWBSDataRequest {
  projectId: string;
  level: number;
  parentItemCode?: string;
}

export interface WBSItem {
  id: number;
  itemCode: string;
  description: string;
  totalCost: number;
  cumulativeCost: number;
  cumulativePercentage: number;
  isParetoCritical: boolean;
  itemCount: number;
  quantity?: number;
  unit?: string;
  unitRate?: number;
}

export interface GetWBSDataResponse {
  projectId: string;
  level: number;
  parentItemCode?: string;
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
      // Level 1: Aggregate by first part of item code (e.g., "1", "2", "3")
      aggregatedItems = await db.queryAll`
        SELECT 
          MIN(id) as id,
          SPLIT_PART(item_code, '.', 1) as "itemCode",
          STRING_AGG(DISTINCT description, ' / ' ORDER BY description) as description,
          SUM(total_cost) as "totalCost",
          COUNT(*) as "itemCount",
          SUM(quantity) as quantity,
          STRING_AGG(DISTINCT unit, ', ') as unit,
          AVG(unit_rate) as "unitRate"
        FROM boq_items 
        WHERE project_id = ${req.projectId}
        GROUP BY SPLIT_PART(item_code, '.', 1)
        ORDER BY SUM(total_cost) DESC
      `;
    } else if (req.level === 2) {
      // Level 2: Aggregate by second level under parent (e.g., "1.1", "1.2" under "1")
      if (!req.parentItemCode) {
        throw APIError.invalidArgument("Parent item code required for level 2");
      }
      
      aggregatedItems = await db.queryAll`
        SELECT 
          MIN(id) as id,
          SUBSTRING(item_code FROM '^${req.parentItemCode}\\.\\d+') as "itemCode",
          STRING_AGG(DISTINCT description, ' / ' ORDER BY description) as description,
          SUM(total_cost) as "totalCost",
          COUNT(*) as "itemCount",
          SUM(quantity) as quantity,
          STRING_AGG(DISTINCT unit, ', ') as unit,
          AVG(unit_rate) as "unitRate"
        FROM boq_items 
        WHERE project_id = ${req.projectId} 
          AND item_code LIKE ${req.parentItemCode + '.%'}
          AND wbs_level >= 2
        GROUP BY SUBSTRING(item_code FROM '^${req.parentItemCode}\\.\\d+')
        HAVING SUBSTRING(item_code FROM '^${req.parentItemCode}\\.\\d+') IS NOT NULL
        ORDER BY SUM(total_cost) DESC
      `;
    } else {
      // Level 3+: Aggregate by third level under parent (e.g., "1.1.1", "1.1.2" under "1.1")
      if (!req.parentItemCode) {
        throw APIError.invalidArgument("Parent item code required for level 3+");
      }
      
      aggregatedItems = await db.queryAll`
        SELECT 
          MIN(id) as id,
          SUBSTRING(item_code FROM '^${req.parentItemCode}\\.\\d+') as "itemCode",
          STRING_AGG(DISTINCT description, ' / ' ORDER BY description) as description,
          SUM(total_cost) as "totalCost",
          COUNT(*) as "itemCount",
          SUM(quantity) as quantity,
          STRING_AGG(DISTINCT unit, ', ') as unit,
          AVG(unit_rate) as "unitRate"
        FROM boq_items 
        WHERE project_id = ${req.projectId} 
          AND item_code LIKE ${req.parentItemCode + '.%'}
          AND wbs_level >= 3
        GROUP BY SUBSTRING(item_code FROM '^${req.parentItemCode}\\.\\d+')
        HAVING SUBSTRING(item_code FROM '^${req.parentItemCode}\\.\\d+') IS NOT NULL
        ORDER BY SUM(total_cost) DESC
      `;
    }
    
    // Filter out null item codes and empty results
    aggregatedItems = aggregatedItems.filter(item => item.itemCode && item.totalCost > 0);
    
    if (aggregatedItems.length === 0) {
      return {
        projectId: req.projectId,
        level: req.level,
        parentItemCode: req.parentItemCode,
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
        itemCode: item.itemCode,
        description: item.description,
        totalCost: item.totalCost,
        cumulativeCost,
        cumulativePercentage,
        isParetoCritical,
        itemCount: item.itemCount,
        quantity: item.quantity,
        unit: item.unit,
        unitRate: item.unitRate
      };
    });
    
    return {
      projectId: req.projectId,
      level: req.level,
      parentItemCode: req.parentItemCode,
      totalCost,
      items: processedItems
    };
  }
);
