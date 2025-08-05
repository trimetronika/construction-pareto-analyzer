import { api } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = SQLDatabase.named("construction");

export interface Project {
  id: string;
  name: string;
  fileName: string;
  uploadedAt: Date;
  status: string;
}

export interface ListProjectsResponse {
  projects: Project[];
}

// Retrieves all projects.
export const listProjects = api<void, ListProjectsResponse>(
  { expose: true, method: "GET", path: "/projects" },
  async () => {
    const projects = await db.queryAll<Project>`
      SELECT 
        id, name, file_name as "fileName", uploaded_at as "uploadedAt", status
      FROM projects 
      ORDER BY uploaded_at DESC
    `;
    
    return { projects };
  }
);
