'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Upload, 
  RefreshCw, 
  FileText, 
  Loader2,
  AlertCircle,
  FolderOpen,
  Calendar,
  HardDrive
} from 'lucide-react';

interface FileItem {
  name: string;
  size: number;
  modified: string;
}

interface FileManagerProps {
  onFileUploaded?: () => void;
}

export default function FileManager({ onFileUploaded }: FileManagerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch files list
  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/files');
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      // Silently handle fetch errors - backend connection status is shown elsewhere
    } finally {
      setIsLoading(false);
    }
  };

  // Load files on component mount
  useEffect(() => {
    fetchFiles();
  }, []);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        await fetchFiles(); // Refresh file list
        onFileUploaded?.(); // Notify parent component
        // Reset the input
        event.target.value = '';
      } else {
        const errorData = await response.json();
        setUploadError(errorData.detail || 'Upload failed');
      }
    } catch (error) {
      // Only log errors if they're not network/fetch failures (backend connection status is shown elsewhere)
      if (error instanceof Error && !error.message.includes('Failed to fetch')) {
        console.error('Upload error:', error);
      }
      setUploadError('Upload failed: Network error');
    } finally {
      setIsUploading(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            File Manager
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFiles}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* File Upload */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Upload Data File</h4>
          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer">
              <Button
                variant="outline"
                disabled={isUploading}
                className="gap-2"
                asChild
              >
                <span>
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Choose File
                    </>
                  )}
                </span>
              </Button>
              <input
                type="file"
                className="sr-only"
                accept=".csv,.json,.txt"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>
            {isUploading && (
              <div className="flex items-center">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Supported formats: CSV, JSON, TXT
          </p>
          {uploadError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Upload Error:</strong> {uploadError}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Files List */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Uploaded Files</h4>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 text-muted-foreground mx-auto animate-spin mb-2" />
              <p className="text-muted-foreground text-sm">Loading files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No files uploaded yet</p>
              <p className="text-muted-foreground text-sm">Upload a data file to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {files.map((file, index) => (
                <Card key={index} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                            <div className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              {formatFileSize(file.size)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(file.modified)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                        Ready
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}