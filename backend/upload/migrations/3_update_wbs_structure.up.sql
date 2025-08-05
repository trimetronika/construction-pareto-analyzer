-- Remove the old WBS columns that are no longer needed
ALTER TABLE boq_items DROP COLUMN IF EXISTS general_work;
ALTER TABLE boq_items DROP COLUMN IF EXISTS specific_work;

-- Drop old indexes
DROP INDEX IF EXISTS idx_boq_items_general_work;
DROP INDEX IF EXISTS idx_boq_items_specific_work;

-- Ensure item_code is the primary WBS identifier
ALTER TABLE boq_items ALTER COLUMN item_code SET NOT NULL;

-- Add new indexes for optimized WBS queries
CREATE INDEX idx_boq_items_item_code ON boq_items(project_id, item_code);
CREATE INDEX idx_boq_items_item_code_pattern ON boq_items(project_id, item_code text_pattern_ops);
