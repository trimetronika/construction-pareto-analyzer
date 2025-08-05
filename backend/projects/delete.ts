import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Bucket } from "encore.dev/storage/objects";

const db = SQLDatabase.named("construction");
const filesBucket = new Bucket("project-files");

export interface DeleteProjectRequest {
  projectId: string;
}

export interface DeleteProjectResponse {
  success: boolean;
  message: string;
}

// Deletes a project and all associated data.
export const deleteProject = api<DeleteProjectRequest, DeleteProjectResponse>(
  { expose: true, method: "DELETE", path: "/projects/:projectId" },
  async (req) => {
    // Get project details first
    const project = await db.queryRow`
      SELECT * FROM projects WHERE id = ${req.projectId}
    `;
    
    if (!project) {
      throw APIError.notFound("Project not found");
    }
    
    try {
      // Delete file from object storage
      try {
        await filesBucket.remove(project.file_path);
      } catch (error) {
        // File might not exist, continue with database cleanup
        console.warn(`Failed to delete file ${project.file_path}:`, error);
      }
      
      // Delete project from database (cascading deletes will handle related records)
      await db.exec`DELETE FROM projects WHERE id = ${req.projectId}`;
      
      return {
        success: true,
        message: "Project deleted successfully"
      };
    } catch (error) {
      console.error("Error deleting project:", error);
      throw APIError.internal("Failed to delete project");
    }
  }
);
