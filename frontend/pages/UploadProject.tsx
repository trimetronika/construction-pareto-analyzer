import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import backend from '~backend/client';

export default function UploadProject() {
  const { t } = useLanguage();
  const [projectName, setProjectName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
      if (fileExtension === 'csv' || fileExtension === 'xlsx') {
        setFile(selectedFile);
      } else {
        toast({
          title: t('common.error'),
          description: t('upload.invalid_file_type'),
          variant: "destructive"
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      toast({
        title: t('common.error'),
        description: t('upload.project_name_required'),
        variant: "destructive"
      });
      return;
    }

    if (!file) {
      toast({
        title: t('common.error'),
        description: t('upload.file_required'),
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert file to base64
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1]; // Remove data:... prefix
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload file
      const uploadResponse = await backend.upload.uploadFile({
        fileName: file.name,
        fileData,
        projectName: projectName.trim()
      });

      toast({
        title: t('common.success'),
        description: t('upload.success')
      });

      // Navigate to project analysis page
      navigate(`/project/${uploadResponse.projectId}`);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: t('common.error'),
        description: t('upload.error'),
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('upload.title')}</h1>
        <p className="text-gray-600 mt-2">
          {t('upload.description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>{t('upload.project_details')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="projectName">{t('upload.project_name')}</Label>
              <Input
                id="projectName"
                type="text"
                placeholder={t('upload.project_name_placeholder')}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">{t('upload.spreadsheet_file')}</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                <input
                  id="file"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading}
                />
                <label htmlFor="file" className="cursor-pointer">
                  <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <div className="text-lg font-medium text-gray-900 mb-2">
                    {file ? file.name : t('upload.choose_file')}
                  </div>
                  <div className="text-sm text-gray-500">
                    {t('upload.file_requirements')}
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Item Code-based WBS Spreadsheet Format:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Required columns:</strong> Item Code, Description, Quantity, Unit, Unit Rate, Total Cost</li>
                    <li><strong>Item Code format:</strong> Determines WBS hierarchy automatically</li>
                    <li className="ml-4">• Level 1: "1", "2", "3"</li>
                    <li className="ml-4">• Level 2: "1.1", "2.3", "3.4"</li>
                    <li className="ml-4">• Level 3: "1.1.1", "2.3.2", etc.</li>
                    <li>First row should contain column headers</li>
                    <li>Ensure all cost values are numeric</li>
                    <li>Item Code must be unique for each row</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('upload.uploading')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('upload.upload_button')}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
