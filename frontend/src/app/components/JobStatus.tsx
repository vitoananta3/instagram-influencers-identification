'use client';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  Clock, 
  Loader2, 
  XCircle, 
  Download,
  RotateCcw,
  FileText,
  Home
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

interface JobStatusProps {
  job: Job;
  onReset: () => void;
}

export default function JobStatus({ job, onReset }: JobStatusProps) {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusVariant = () => {
    switch (job.status) {
      case 'pending':
        return 'secondary' as const;
      case 'running':
        return 'default' as const;
      case 'completed':
        return 'default' as const;
      case 'failed':
        return 'destructive' as const;
      default:
        return 'secondary' as const;
    }
  };

  const getStatusColor = () => {
    switch (job.status) {
      case 'pending':
        return 'text-yellow-600';
      case 'running':
        return 'text-blue-600';
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const handleDownload = async () => {
    if (!job.result_file) return;
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/jobs/${job.job_id}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        // Extract filename from result_file path
        const filename = job.result_file.split('/').pop() || 'results.txt';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Download failed:', response.status, response.statusText);
      }
    } catch (error) {
      // Only log errors if they're not network/fetch failures (backend connection status is shown elsewhere)
      if (error instanceof Error && !error.message.includes('Failed to fetch')) {
        console.error('Download failed:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Job Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-semibold">Job {job.job_id}</h3>
            {/* <Badge variant={getStatusVariant()} className="mt-1">
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </Badge> */}
          </div>
        </div>
        <Badge variant={getStatusVariant()} className="mt-1">
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </Badge>
        {/* <Button
          onClick={onReset}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Start New Job
        </Button> */}
      </div>

      {/* Progress Section */}
      {(job.status === 'running' || job.status === 'completed') && (
        <div className="space-y-4">
          {/* Progress Bar and Percentage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Progress</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{job.progress.toFixed(1)}%</span>
                {job.current_items && job.total_items && (
                  <span className="text-xs text-muted-foreground">
                    ({job.current_items.toLocaleString()}/{job.total_items.toLocaleString()})
                  </span>
                )}
              </div>
            </div>
            <Progress value={job.progress} className="h-3" />
          </div>

          {/* Dynamic Progress Info */}
          {job.status === 'running' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {/* Processing Speed */}
              {job.processing_speed && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>{job.processing_speed.toFixed(2)} items/sec</span>
                </div>
              )}

              {/* Elapsed Time */}
              {job.elapsed_time && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Elapsed: {job.elapsed_time}</span>
                </div>
              )}

              {/* Estimated Time Remaining */}
              {job.estimated_time_remaining && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>ETA: {job.estimated_time_remaining}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Current Step */}
      {job.current_step && (
        <Alert>
          {/* {job.status === 'completed' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )} */}
          <AlertDescription>
            <span className="font-medium">Current Step:</span> {job.current_step}
          </AlertDescription>
        </Alert>
      )}

      {/* Status Message */}
      {job.message && (
        <Alert variant={job.status === 'failed' ? 'destructive' : 'default'}>
          <AlertDescription>{job.message}</AlertDescription>
        </Alert>
      )}

      {/* Results Section */}
      {job.status === 'completed' && job.result_file && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-600">Analysis Complete!</span>
          </div>
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              Your analysis has been completed successfully. The results are ready for download.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleDownload}
              className=""
              size="lg"
            >
              <Download className="h-4 w-4" />
              Download Results ({job.result_file})
            </Button>
            <Button 
              onClick={onReset}
              variant="outline"
              className="gap-2"
              size="lg"
            >
              <Home className="h-4 w-4" />
              Back to Home
            </Button>
          </div>
        </div>
      )}

      {/* Failed State */}
      {job.status === 'failed' && (
        <div className="space-y-3">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              The analysis job has failed. Please check the logs for more details and try again.
            </AlertDescription>
          </Alert>
          <Button 
            onClick={onReset}
            variant="outline"
            className="w-full gap-2"
            size="lg"
          >
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      )}
    </div>
  );
}