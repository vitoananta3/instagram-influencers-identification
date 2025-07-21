'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Download, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  AlertCircle,
  Info,
  BarChart3
} from 'lucide-react';

interface Job {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
  current_step?: string;
  result_file?: string;
  estimated_time_remaining?: string;
  current_items?: number;
  total_items?: number;
  processing_speed?: number;
  elapsed_time?: string;
}

interface ResultsViewerProps {
  job: Job;
}

export default function ResultsViewer({ job }: ResultsViewerProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (job.status !== 'completed' || !job.result_file) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/jobs/${job.job_id}/download`);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.result_file || 'results.csv';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      // Only log errors if they're not network/fetch failures (backend connection status is shown elsewhere)
      if (error instanceof Error && !error.message.includes('Failed to fetch')) {
        console.error('Download error:', error);
      }
      setDownloadError(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const getResultsPreview = () => {
    switch (job.status) {
      case 'pending':
        return (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">Waiting to Start</h3>
            <p className="text-muted-foreground">
              Job created. Results will appear here once processing starts.
            </p>
          </div>
        );
      
      case 'running':
        return (
          <div className="text-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 mx-auto text-blue-500 animate-spin mb-4" />
            <div>
              <h3 className="font-medium text-lg mb-2">Processing in Progress</h3>
              <div className="space-y-3 max-w-sm mx-auto">
                <Progress value={job.progress} className="h-2" />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{job.progress}% complete</span>
                  {job.estimated_time_remaining && (
                    <span>{job.estimated_time_remaining} remaining</span>
                  )}
                </div>
              </div>
              {job.current_step && (
                <Badge variant="outline" className="mt-3">
                  {job.current_step}
                </Badge>
              )}
            </div>
          </div>
        );
      
      case 'failed':
        return (
          <div className="text-center py-12">
            <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="font-medium text-lg mb-2 text-red-600">Processing Failed</h3>
            <p className="text-muted-foreground">
              Check the logs for more details about what went wrong.
            </p>
          </div>
        );
      
      case 'completed':
        return (
          <div className="text-center py-12 space-y-6">
            <div>
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <h3 className="font-medium text-lg mb-2 text-green-600">
                Analysis Complete!
              </h3>
              <p className="text-muted-foreground">
                Your content analysis has been processed successfully.
              </p>
            </div>
            
            {job.result_file && (
              <Card className="max-w-sm mx-auto">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <FileText className="h-5 w-5 text-green-600" />
                    <span className="font-medium">{job.result_file}</span>
                  </div>
                  <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download Results
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {downloadError && (
              <Alert variant="destructive" className="max-w-sm mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Download Error:</strong> {downloadError}
                </AlertDescription>
              </Alert>
            )}
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Results Preview */}
      <Card className="min-h-[400px]">
        <CardContent className="p-0">
          <div className="flex items-center justify-center h-full">
            {getResultsPreview()}
          </div>
        </CardContent>
      </Card>

      {/* Information Cards */}
      <div className="grid grid-cols-1 gap-3">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Results will be available as a CSV file when processing completes
          </AlertDescription>
        </Alert>
        
        <Alert>
          <BarChart3 className="h-4 w-4" />
          <AlertDescription>
            The CSV contains engagement scores and content analysis results
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}