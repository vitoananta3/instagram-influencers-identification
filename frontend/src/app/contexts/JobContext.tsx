'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

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

interface JobContextType {
  currentJob: Job | null;
  setCurrentJob: (job: Job | null | ((prev: Job | null) => Job | null)) => void;
  isJobRunning: () => boolean;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export function JobProvider({ children }: { children: ReactNode }) {
  const [currentJob, setCurrentJob] = useState<Job | null>(null);

  const isJobRunning = () => {
    return currentJob?.status === 'running' || currentJob?.status === 'pending';
  };

  return (
    <JobContext.Provider value={{ currentJob, setCurrentJob, isJobRunning }}>
      {children}
    </JobContext.Provider>
  );
}

export function useJob() {
  const context = useContext(JobContext);
  if (context === undefined) {
    throw new Error('useJob must be used within a JobProvider');
  }
  return context;
}