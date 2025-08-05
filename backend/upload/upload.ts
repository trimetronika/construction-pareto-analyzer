import { api } from "encore.dev/api";
import { Bucket } from "encore.dev/storage/objects";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const filesBucket = new Bucket("project-files");
const db = new SQLDatabase("construction", { migrations: "./migrations" });

export interface UploadRequest {
  fileName: string;
  fileData: string; // base64 encoded file data
  projectName: string;
}

export interface UploadResponse {
  projectId: string;
  fileName: string;
  uploadedAt: Date;
}

// Uploads a spreadsheet file for construction project analysis.
export const uploadFile = api<UploadRequest, UploadResponse>(
  { expose: true, method: "POST", path: "/upload" },
  async (req) => {
    // Decode base64 file data
    const fileBuffer = Buffer.from(req.fileData, 'base64');
    
    // Generate unique project ID
    const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Upload file to object storage
    const fileName = `${projectId}/${req.fileName}`;
    await filesBucket.upload(fileName, fileBuffer, {
      contentType: req.fileName.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'
    });
    
    // Store project metadata in database
    await db.exec`
      INSERT INTO projects (id, name, file_name, file_path, uploaded_at, status)
      VALUES (${projectId}, ${req.projectName}, ${req.fileName}, ${fileName}, NOW(), 'uploaded')
    `;
    
    return {
      projectId,
      fileName: req.fileName,
      uploadedAt: new Date()
    };
  }
);
