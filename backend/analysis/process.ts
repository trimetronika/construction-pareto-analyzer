import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Bucket } from "encore.dev/storage/objects";
import * as XLSX from 'xlsx';

const db = SQLDatabase.named("construction");
const filesBucket = new Bucket("project-files");

export interface ProcessRequest {
  projectId: string;
}

export interface BoQItem {
  id: number;
  itemCode?: string;
  itemNumber?: string;
  generalWork?: string;
  specificWork?: string;
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

export interface ProcessResponse {
  projectId: string;
  totalItems: number;
  totalProjectCost: number;
  paretoCriticalItems: number;
  items: BoQItem[];
}

// Processes uploaded spreadsheet and performs Pareto analysis.
export const processSpreadsheet = api<ProcessRequest, ProcessResponse>(
  { expose: true, method: "POST", path: "/analysis/process" },
  async (req) => {
    // Get project details
    const project = await db.queryRow`
      SELECT * FROM projects WHERE id = ${req.projectId}
    `;
    
    if (!project) {
      throw APIError.notFound("Project not found");
    }
    
    // Download file from storage
    const fileBuffer = await filesBucket.download(project.file_path);
    
    // Parse spreadsheet
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) {
      throw APIError.invalidArgument("Spreadsheet contains no data");
    }
    
    // Clear existing BoQ items for this project
    await db.exec`DELETE FROM boq_items WHERE project_id = ${req.projectId}`;
    
    // Process and insert BoQ items
    const items: any[] = [];
    for (const row of data) {
      const rowData = row as any;
      
      // Try to identify columns (flexible mapping)
      const description = rowData.Description || rowData.description || rowData.Item || rowData.item || '';
      const quantity = parseFloat(rowData.Quantity || rowData.quantity || rowData.Qty || rowData.qty || '0');
      const unitRate = parseFloat(rowData['Unit Rate'] || rowData.unitRate || rowData.Rate || rowData.rate || '0');
      const totalCost = parseFloat(rowData['Total Cost'] || rowData.totalCost || rowData.Total || rowData.total || '0') || (quantity * unitRate);
      
      // WBS-related columns
      const itemNumber = rowData['Item Number'] || rowData.itemNumber || rowData['Item No'] || rowData.itemNo || '';
      const generalWork = rowData['General Work'] || rowData.generalWork || rowData['General'] || rowData.general || '';
      const specificWork = rowData['Specific Work'] || rowData.specificWork || rowData['Specific'] || rowData.specific || '';
      
      if (description && totalCost > 0) {
        // Determine WBS level from item number
        const wbsLevel = determineWBSLevel(itemNumber);
        const parentItemNumber = getParentItemNumber(itemNumber);
        
        items.push({
          itemCode: rowData['Item Code'] || rowData.itemCode || rowData.Code || rowData.code || null,
          itemNumber: itemNumber || null,
          generalWork: generalWork || null,
          specificWork: specificWork || null,
          description,
          quantity,
          unit: rowData.Unit || rowData.unit || null,
          unitRate,
          totalCost,
          wbsLevel,
          parentItemNumber
        });
      }
    }
    
    if (items.length === 0) {
      throw APIError.invalidArgument("No valid BoQ items found in spreadsheet");
    }
    
    // Sort by total cost (descending)
    items.sort((a, b) => b.totalCost - a.totalCost);
    
    // Calculate cumulative values and Pareto analysis
    const totalProjectCost = items.reduce((sum, item) => sum + item.totalCost, 0);
    let cumulativeCost = 0;
    let paretoCriticalItems = 0;
    
    for (let i = 0; i < items.length; i++) {
      cumulativeCost += items[i].totalCost;
      const cumulativePercentage = (cumulativeCost / totalProjectCost) * 100;
      const isParetoCritical = cumulativePercentage <= 80;
      
      if (isParetoCritical) {
        paretoCriticalItems++;
      }
      
      // Insert into database
      await db.exec`
        INSERT INTO boq_items (
          project_id, item_code, item_number, general_work, specific_work, description, 
          quantity, unit, unit_rate, total_cost, cumulative_cost, cumulative_percentage, 
          is_pareto_critical, wbs_level, parent_item_number
        ) VALUES (
          ${req.projectId}, ${items[i].itemCode}, ${items[i].itemNumber}, 
          ${items[i].generalWork}, ${items[i].specificWork}, ${items[i].description}, 
          ${items[i].quantity}, ${items[i].unit}, ${items[i].unitRate},
          ${items[i].totalCost}, ${cumulativeCost}, ${cumulativePercentage}, 
          ${isParetoCritical}, ${items[i].wbsLevel}, ${items[i].parentItemNumber}
        )
      `;
      
      items[i].cumulativeCost = cumulativeCost;
      items[i].cumulativePercentage = cumulativePercentage;
      items[i].isParetoCritical = isParetoCritical;
    }
    
    // Update project status
    await db.exec`
      UPDATE projects SET status = 'processed' WHERE id = ${req.projectId}
    `;
    
    // Get processed items from database with IDs
    const processedItems = await db.queryAll<BoQItem>`
      SELECT 
        id, item_code as "itemCode", item_number as "itemNumber", 
        general_work as "generalWork", specific_work as "specificWork",
        description, quantity, unit, unit_rate as "unitRate",
        total_cost as "totalCost", cumulative_cost as "cumulativeCost", 
        cumulative_percentage as "cumulativePercentage", is_pareto_critical as "isParetoCritical",
        wbs_level as "wbsLevel", parent_item_number as "parentItemNumber"
      FROM boq_items 
      WHERE project_id = ${req.projectId}
      ORDER BY total_cost DESC
    `;
    
    return {
      projectId: req.projectId,
      totalItems: items.length,
      totalProjectCost,
      paretoCriticalItems,
      items: processedItems
    };
  }
);

function determineWBSLevel(itemNumber: string): number {
  if (!itemNumber) return 1;
  
  // Count the number of dots to determine level
  // e.g., "1" = level 1, "1.1" = level 2, "1.1.1" = level 3
  const parts = itemNumber.split('.');
  return parts.length;
}

function getParentItemNumber(itemNumber: string): string | null {
  if (!itemNumber) return null;
  
  const parts = itemNumber.split('.');
  if (parts.length <= 1) return null;
  
  // Return parent item number (remove last part)
  return parts.slice(0, -1).join('.');
}
