ALTER TABLE boq_items ADD COLUMN item_number TEXT;
ALTER TABLE boq_items ADD COLUMN general_work TEXT;
ALTER TABLE boq_items ADD COLUMN specific_work TEXT;
ALTER TABLE boq_items ADD COLUMN wbs_level INTEGER DEFAULT 1;
ALTER TABLE boq_items ADD COLUMN parent_item_number TEXT;

CREATE INDEX idx_boq_items_general_work ON boq_items(project_id, general_work);
CREATE INDEX idx_boq_items_specific_work ON boq_items(project_id, specific_work);
CREATE INDEX idx_boq_items_wbs_level ON boq_items(project_id, wbs_level);
CREATE INDEX idx_boq_items_parent ON boq_items(project_id, parent_item_number);
