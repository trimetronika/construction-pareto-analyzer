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
        WITH level1_items AS (
          SELECT 
            MIN(id) as id,
            CASE 
              WHEN item_code ~ '^[0-9]+$' THEN item_code
              WHEN item_code ~ '^[0-9]+\.' THEN SPLIT_PART(item_code, '.', 1)
              ELSE item_code
            END as item_code,
            STRING_AGG(DISTINCT description, ' / ' ORDER BY description) as description,
            SUM(total_cost) as total_cost,
            COUNT(*) as item_count,
            SUM(quantity) as quantity,
            STRING_AGG(DISTINCT unit, ', ') as unit,
            AVG(unit_rate) as unit_rate
          FROM boq_items 
          WHERE project_id = ${req.projectId}
            AND item_code IS NOT NULL 
            AND item_code != ''
          GROUP BY CASE 
            WHEN item_code ~ '^[0-9]+$' THEN item_code
            WHEN item_code ~ '^[0-9]+\.' THEN SPLIT_PART(item_code, '.', 1)
            ELSE item_code
          END
        )
        SELECT 
          id,
          item_code as "itemCode",
          description,
          total_cost as "totalCost",
          item_count as "itemCount",
          quantity,
          unit,
          unit_rate as "unitRate"
        FROM level1_items
        WHERE item_code IS NOT NULL AND item_code != ''
        ORDER BY total_cost DESC
      `;
    } else if (req.level === 2) {
      // Level 2: Get items that start with parent code followed by a dot and another number
      if (!req.parentItemCode) {
        throw APIError.invalidArgument("Parent item code required for level 2");
      }
      
      aggregatedItems = await db.queryAll`
        WITH level2_items AS (
          SELECT 
            MIN(id) as id,
            item_code,
            STRING_AGG(DISTINCT description, ' / ' ORDER BY description) as description,
            SUM(total_cost) as total_cost,
            COUNT(*) as item_count,
            SUM(quantity) as quantity,
            STRING_AGG(DISTINCT unit, ', ') as unit,
            AVG(unit_rate) as unit_rate
          FROM boq_items 
          WHERE project_id = ${req.projectId} 
            AND item_code LIKE ${req.parentItemCode + '.%'}
            AND LENGTH(item_code) - LENGTH(REPLACE(item_code, '.', '')) = 1
            AND item_code != ${req.parentItemCode}
          GROUP BY item_code
        )
        SELECT 
          id,
          item_code as "itemCode",
          description,
          total_cost as "totalCost",
          item_count as "itemCount",
          quantity,
          unit,
          unit_rate as "unitRate"
        FROM level2_items
        WHERE item_code IS NOT NULL AND item_code != ''
        ORDER BY total_cost DESC
      `;
    } else {
      // Level 3: Get items that start with parent code followed by a dot and another number
      if (!req.parentItemCode) {
        throw APIError.invalidArgument("Parent item code required for level 3+");
      }
      
      aggregatedItems = await db.queryAll`
        WITH level3_items AS (
          SELECT 
            MIN(id) as id,
            item_code,
            STRING_AGG(DISTINCT description, ' / ' ORDER BY description) as description,
            SUM(total_cost) as total_cost,
            COUNT(*) as item_count,
            SUM(quantity) as quantity,
            STRING_AGG(DISTINCT unit, ', ') as unit,
            AVG(unit_rate) as unit_rate
          FROM boq_items 
          WHERE project_id = ${req.projectId} 
            AND item_code LIKE ${req.parentItemCode + '.%'}
            AND LENGTH(item_code) - LENGTH(REPLACE(item_code, '.', '')) = 2
            AND item_code != ${req.parentItemCode}
          GROUP BY item_code
        )
        SELECT 
          id,
          item_code as "itemCode",
          description,
          total_cost as "totalCost",
          item_count as "itemCount",
          quantity,
          unit,
          unit_rate as "unitRate"
        FROM level3_items
        WHERE item_code IS NOT NULL AND item_code != ''
        ORDER BY total_cost DESC
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
