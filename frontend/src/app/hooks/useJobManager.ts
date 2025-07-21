'use client';

import { useCallback, useRef } from 'react';
import { useJob } from '../contexts/JobContext';

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
  error_message?: string;
}

export function useJobManager() {
  const { currentJob, setCurrentJob } = useJob();
  const wsRef = useRef<WebSocket | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateJob = useCallback((job: Job | null) => {
    // Use React's batching mechanism to ensure state updates happen safely
    // This will be batched with other state updates in the same event loop
    setCurrentJob(job);
  }, [setCurrentJob]);

  const updateJobState = useCallback((updater: (prev: Job | null) => Job | null) => {
    // Use React's functional state update pattern to ensure we have the latest state
    setCurrentJob(updater);
  }, [setCurrentJob]);

  const resetJob = useCallback(() => {
    // Clean up resources first
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    // Then update state
    updateJob(null);
  }, [updateJob]);

  return {
    currentJob,
    updateJob,
    updateJobState,
    resetJob,
    wsRef,
    pollingIntervalRef
  };
}