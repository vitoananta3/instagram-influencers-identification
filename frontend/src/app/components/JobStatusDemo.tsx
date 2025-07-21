'use client';

import { useState, useEffect } from 'react';
import JobStatus from './JobStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

export default function JobStatusDemo() {
  const [demoJob, setDemoJob] = useState<Job>({
    job_id: 'demo-job-123',
    status: 'running',
    progress: 2.0,
    current_step: 'Processing social media posts',
    estimated_time_remaining: '1:56:41',
    current_items: 639,
    total_items: 32945,
    processing_speed: 4.61,
    elapsed_time: '02:14'
  });

  const [isRunning, setIsRunning] = useState(false);

  // Simulate progress updates
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setDemoJob(prev => {
        if (prev.status !== 'running') return prev;

        const newProgress = Math.min(prev.progress + Math.random() * 2, 100);
        const newCurrentItems = Math.floor((newProgress / 100) * (prev.total_items || 32945));
        const newSpeed = 4.61 + (Math.random() - 0.5) * 2; // Vary speed slightly
        
        // Calculate new elapsed time (simplified)
        const elapsedMinutes = Math.floor(newProgress * 2); // Rough calculation
        const elapsedSeconds = Math.floor((newProgress * 120) % 60);
        const newElapsedTime = `${Math.floor(elapsedMinutes / 60).toString().padStart(2, '0')}:${(elapsedMinutes % 60).toString().padStart(2, '0')}`;
        
        // Calculate remaining time (simplified)
        const remainingMinutes = Math.floor((100 - newProgress) * 2);
        const remainingHours = Math.floor(remainingMinutes / 60);
        const remainingMins = remainingMinutes % 60;
        const newRemainingTime = `${remainingHours}:${remainingMins.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;

        const updated = {
          ...prev,
          progress: newProgress,
          current_items: newCurrentItems,
          processing_speed: Math.max(0.1, newSpeed),
          elapsed_time: newElapsedTime,
          estimated_time_remaining: newProgress >= 99 ? '00:01' : newRemainingTime,
          status: newProgress >= 100 ? 'completed' as const : 'running' as const,
          result_file: newProgress >= 100 ? 'analysis_results_2024.csv' : undefined
        };

        if (newProgress >= 100) {
          setIsRunning(false);
        }

        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const startDemo = () => {
    setDemoJob({
      job_id: 'demo-job-' + Math.random().toString(36).substr(2, 9),
      status: 'running',
      progress: 2.0,
      current_step: 'Processing social media posts',
      estimated_time_remaining: '1:56:41',
      current_items: 639,
      total_items: 32945,
      processing_speed: 4.61,
      elapsed_time: '02:14'
    });
    setIsRunning(true);
  };

  const resetDemo = () => {
    setIsRunning(false);
    setDemoJob({
      job_id: 'demo-job-123',
      status: 'pending',
      progress: 0,
      current_step: 'Waiting to start',
      estimated_time_remaining: undefined,
      current_items: 0,
      total_items: 32945,
      processing_speed: undefined,
      elapsed_time: undefined
    });
  };

  const completeDemo = () => {
    setIsRunning(false);
    setDemoJob(prev => ({
      ...prev,
      status: 'completed',
      progress: 100,
      current_step: 'Analysis complete',
      result_file: 'analysis_results_2024.csv',
      current_items: prev.total_items,
      estimated_time_remaining: undefined
    }));
  };

  const failDemo = () => {
    setIsRunning(false);
    setDemoJob(prev => ({
      ...prev,
      status: 'failed',
      message: 'Processing failed due to network timeout',
      estimated_time_remaining: undefined
    }));
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Enhanced JobStatus Component Demo</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={startDemo} disabled={isRunning} size="sm">
            Start Demo
          </Button>
          <Button onClick={resetDemo} variant="outline" size="sm">
            Reset
          </Button>
          <Button onClick={completeDemo} variant="outline" size="sm">
            Complete
          </Button>
          <Button onClick={failDemo} variant="outline" size="sm">
            Fail
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <JobStatus job={demoJob} onReset={resetDemo} />
      </CardContent>
    </Card>
  );
}