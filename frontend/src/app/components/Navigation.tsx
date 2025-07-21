'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ClientOnly from './ClientOnly';
import { useJob } from '../contexts/JobContext';
import JobTerminationDialog from './JobTerminationDialog';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pendingTab, setPendingTab] = useState<string>('');
  const { isJobRunning, currentJob, setCurrentJob } = useJob();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleTabChange = (value: string) => {
    const currentTab = pathname === '/' ? 'identify' : pathname.slice(1);
    
    // If trying to switch from identify tab to result-viewer and job is running, show confirmation
    if (currentTab === 'identify' && value === 'result-viewer' && isJobRunning()) {
      setPendingTab(value);
      setShowDialog(true);
      return;
    }
    
    // Otherwise, proceed with navigation
    router.push(value === 'identify' ? '/' : `/${value}`);
  };

  const handleConfirmTermination = async () => {
    console.log('Job termination confirmed - proceeding with navigation');
    
    if (currentJob && (currentJob.status === 'running' || currentJob.status === 'pending')) {
      try {
        console.log(`Terminating job ${currentJob.job_id}...`);
        
        // Call backend to delete/terminate the job
        const response = await fetch(`http://127.0.0.1:8000/api/jobs/${currentJob.job_id}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Job termination response:', result);
          
          // Clear current job from context
          setCurrentJob(null);
          
          // Show success message if job was actually terminated
          if (result.terminated) {
            console.log('Job was successfully terminated');
          }
        } else {
          console.error('Failed to terminate job:', response.status, response.statusText);
          // Still proceed with navigation even if termination failed
        }
      } catch (error) {
        console.error('Error terminating job:', error);
        // Still proceed with navigation even if termination failed
      }
    }
    
    // Navigate to the pending tab
    router.push(pendingTab === 'identify' ? '/' : `/${pendingTab}`);
    setPendingTab('');
  };

  const handleCancelTermination = () => {
    console.log('Job termination cancelled');
    setPendingTab('');
  };

  // Determine current tab based on pathname
  const currentTab = isClient ? (pathname === '/' ? 'identify' : pathname.slice(1)) : 'identify';

  return (
    <div className="mb-6">
      <ClientOnly fallback={
        <Tabs value="identify" onValueChange={() => {}}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="identify">Identify</TabsTrigger>
            <TabsTrigger value="result-viewer">Result Viewer</TabsTrigger>
          </TabsList>
        </Tabs>
      }>
        <Tabs value={currentTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="identify">Identify</TabsTrigger>
            <TabsTrigger value="result-viewer">Result Viewer</TabsTrigger>
          </TabsList>
        </Tabs>
      </ClientOnly>
      
      <JobTerminationDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onConfirm={handleConfirmTermination}
        onCancel={handleCancelTermination}
      />
    </div>
  );
}