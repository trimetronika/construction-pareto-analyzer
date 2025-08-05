CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE boq_items (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code TEXT,
  description TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  unit TEXT,
  unit_rate DOUBLE PRECISION NOT NULL,
  total_cost DOUBLE PRECISION NOT NULL,
  cumulative_cost DOUBLE PRECISION,
  cumulative_percentage DOUBLE PRECISION,
  is_pareto_critical BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_insights (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  potential_savings DOUBLE PRECISION,
  confidence_score DOUBLE PRECISION,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_boq_items_project_id ON boq_items(project_id);
CREATE INDEX idx_boq_items_total_cost ON boq_items(total_cost DESC);
CREATE INDEX idx_ai_insights_project_id ON ai_insights(project_id);
