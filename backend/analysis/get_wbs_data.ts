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
    
    let items: any[] = [];
    
    if (req.level === 1) {
      // Level 1: Get only items with WBS level 1 (no dots in item code)
      items = await db.queryAll`
        SELECT 
          id, item_code as "itemCode", description, total_cost as "totalCost",
          1 as "itemCount", quantity, unit, unit_rate as "unitRate"
        FROM boq_items 
        WHERE project_id = ${req.projectId} 
          AND wbs_level = 1
          AND item_code IS NOT NULL 
          AND item_code != ''
        ORDER BY total_cost DESC
      `;
    } else if (req.level === 2) {
      // Level 2: Get items that are direct children of the parent (one level deeper)
      if (!req.parentItemCode) {
        throw APIError.invalidArgument("Parent item code required for level 2");
      }
      
      items = await db.queryAll`
        SELECT 
          id, item_code as "itemCode", description, total_cost as "totalCost",
          1 as "itemCount", quantity, unit, unit_rate as "unitRate"
        FROM boq_items 
        WHERE project_id = ${req.projectId} 
          AND wbs_level = 2
          AND item_code LIKE ${req.parentItemCode + '.%'}
          AND LENGTH(item_code) - LENGTH(REPLACE(item_code, '.', '')) = 1
          AND item_code != ${req.parentItemCode}
        ORDER BY total_cost DESC
      `;
    } else if (req.level === 3) {
      // Level 3: Get items that are direct children of the parent (one level deeper)
      if (!req.parentItemCode) {
        throw APIError.invalidArgument("Parent item code required for level 3");
      }
      
      items = await db.queryAll`
        SELECT 
          id, item_code as "itemCode", description, total_cost as "totalCost",
          1 as "itemCount", quantity, unit, unit_rate as "unitRate"
        FROM boq_items 
        WHERE project_id = ${req.projectId} 
          AND wbs_level = 3
          AND item_code LIKE ${req.parentItemCode + '.%'}
          AND LENGTH(item_code) - LENGTH(REPLACE(item_code, '.', '')) = 2
          AND item_code != ${req.parentItemCode}
        ORDER BY total_cost DESC
      `;
    }
    
    // Filter out null item codes and empty results
    items = items.filter(item => item.itemCode && item.totalCost > 0);
    
    if (items.length === 0) {
      return {
        projectId: req.projectId,
        level: req.level,
        parentItemCode: req.parentItemCode,
        totalCost: 0,
        items: []
      };
    }
    
    // Calculate cumulative values and Pareto analysis for this specific level
    const totalCost = items.reduce((sum, item) => sum + item.totalCost, 0);
    let cumulativeCost = 0;
    
    const processedItems = items.map((item, index) => {
      cumulativeCost += item.totalCost;
      const cumulativePercentage = (cumulativeCost / totalCost) * 100;
      const isParetoCritical = cumulativePercentage <= 95;
      
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
