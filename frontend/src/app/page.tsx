'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import JobForm from './components/JobForm';
import JobStatus from './components/JobStatus';
import ConnectionStatus from './components/ConnectionStatus';
import { useBackendConnection } from './hooks/useBackendConnection';
import { useJobManager } from './hooks/useJobManager';
import { Separator } from '@/components/ui/separator';

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

export default function Home() {
  const [logs, setLogs] = useState<string[]>([]);
  const backendConnected = useBackendConnection();
  const { currentJob, updateJob, updateJobState, resetJob, wsRef, pollingIntervalRef } = useJobManager();

  // Clean up WebSocket and polling on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const startStatusPolling = useCallback((jobId: string) => {
    console.log(`[Polling] Starting status polling for job: ${jobId}`);
    
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        console.log(`[Polling] Fetching status for job: ${jobId}`);
        const response = await fetch(`http://127.0.0.1:8000/api/jobs/${jobId}`);
        
        if (response.ok) {
          const jobData = await response.json();
          console.log(`[Polling] Job status update:`, jobData);
          
          updateJobState(prev => {
            if (prev && prev.job_id === jobId) {
              const updated = { ...prev, ...jobData };
              console.log(`[Polling] Updating job state from:`, prev, `to:`, updated);
              return updated;
            }
            return prev;
          });

          // Add status update to logs (less frequently to avoid spam)
          const statusMessage = `[STATUS] ${jobData.status}${jobData.progress ? ` (${Math.round(jobData.progress)}%)` : ''}${jobData.current_step ? ` - ${jobData.current_step}` : ''}`;
          setLogs(prev => {
            // Only add if it's different from the last status message
            const lastLog = prev[prev.length - 1];
            if (!lastLog || !lastLog.startsWith('[STATUS]') || lastLog !== statusMessage) {
              return [...prev, statusMessage];
            }
            return prev;
          });

          // Stop polling if job is completed or failed
          if (jobData.status === 'completed' || jobData.status === 'failed') {
            console.log(`[Polling] Job ${jobId} finished with status: ${jobData.status}. Stopping polling.`);
            startTransition(() => {
              setLogs(prev => [...prev, `[INFO] Job ${jobId} ${jobData.status}. Monitoring stopped.`]);
            });
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        } else {
          // console.error(`[Polling] Failed to fetch job status: ${response.status}`);
          startTransition(() => {
            setLogs(prev => [...prev, `[ERROR] Failed to fetch job status: ${response.status}`]);
          });
        }
      } catch (error) {
        // console.error(`[Polling] Error fetching job status:`, error);
        startTransition(() => {
          setLogs(prev => [...prev, `[ERROR] Status polling error: ${error}`]);
        });
      }
    }, 10000); // Poll every 10 seconds (reduced from 3 seconds since WebSocket provides real-time updates)

    console.log(`[Polling] Status polling started for job: ${jobId}`);
  }, [updateJobState, setLogs, pollingIntervalRef]);

  // WebSocket connection function - handles real-time communication with the backend
  const connectWebSocket = useCallback(async (jobId: string, retryCount = 0) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    console.log(`[WebSocket] Attempting connection for job: ${jobId} (attempt ${retryCount + 1})`);

    // First, check if job is ready for WebSocket connections
    try {
      console.log(`[WebSocket] Checking if job ${jobId} is ready...`);
      const readyResponse = await fetch(`http://127.0.0.1:8000/api/jobs/${jobId}/ready`);

      if (!readyResponse.ok) {
        throw new Error(`Job readiness check failed: ${readyResponse.status}`);
      }

      const readyData = await readyResponse.json();
      console.log(`[WebSocket] Job readiness check result:`, readyData);

      if (!readyData.ready) {
        if (retryCount < 10) { // Increased retry limit for readiness check
          const retryDelay = Math.min(1000 * Math.pow(1.5, retryCount), 5000); // Exponential backoff, max 5s
          console.log(`[WebSocket] Job not ready, retrying in ${retryDelay}ms... (attempt ${retryCount + 2})`);
          startTransition(() => {
            setLogs(prev => [...prev, `[INFO] Waiting for job to be ready... (attempt ${retryCount + 2}/10)`]);
          });
          setTimeout(() => {
            connectWebSocket(jobId, retryCount + 1);
          }, retryDelay);
          return;
        } else {
          startTransition(() => {
            setLogs(prev => [...prev, `[ERROR] Job not ready after 10 attempts`]);
          });
          return;
        }
      }

      console.log(`[WebSocket] Job ${jobId} is ready, proceeding with WebSocket connection`);
      startTransition(() => {
        setLogs(prev => [...prev, `[INFO] Job is ready, establishing WebSocket connection...`]);
      });

    } catch (error) {
      // Silently handle fetch errors - backend connection status is shown elsewhere
      if (retryCount < 5) {
        const retryDelay = Math.min(2000 * Math.pow(2, retryCount), 10000);
        console.log(`[WebSocket] Retrying readiness check in ${retryDelay}ms... (attempt ${retryCount + 2})`);
        startTransition(() => {
          setLogs(prev => [...prev, `[WARNING] Failed to check job readiness, retrying in ${retryDelay / 1000}s...`]);
        });
        setTimeout(() => {
          connectWebSocket(jobId, retryCount + 1);
        }, retryDelay);
        return;
      } else {
        startTransition(() => {
          setLogs(prev => [...prev, `[ERROR] Failed to verify job readiness after 5 attempts`]);
        });
        return;
      }
    }

    // Now establish WebSocket connection
    const wsUrl = `ws://127.0.0.1:8000/api/jobs/${jobId}/logs`;
    console.log(`[WebSocket] Connecting to: ${wsUrl}`);
    console.log(`[WebSocket] Browser WebSocket support:`, typeof WebSocket !== 'undefined');
    console.log(`[WebSocket] Current time:`, new Date().toISOString());

    try {
      const ws = new WebSocket(wsUrl);
      console.log(`[WebSocket] WebSocket object created, readyState:`, ws.readyState);
      console.log(`[WebSocket] WebSocket URL:`, ws.url);
      console.log(`[WebSocket] WebSocket protocol:`, ws.protocol);

      // Add a timeout to detect if connection never opens
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          // console.error('[WebSocket] Connection timeout - still in CONNECTING state after 10 seconds');
          startTransition(() => {
            setLogs(prev => [...prev, `[WARNING] WebSocket connection timeout`]);
          });
          ws.close();
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[WebSocket] Connection opened successfully for job:', jobId);
        console.log('[WebSocket] Final readyState:', ws.readyState);
        startTransition(() => {
          setLogs(prev => [...prev, `[INFO] Connected to real-time logs`]);
        });

        // Send ping to test connection
        ws.send('ping');
      };

      ws.onmessage = (event) => {
        console.log('[WebSocket] Raw message received:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Parsed message:', data);

          if (data.type === 'log' && data.data) {
            console.log('[WebSocket] Adding log entry:', data.data);
            // Format the log message for better display
            const timestamp = new Date(data.data.timestamp).toLocaleTimeString();
            const message = data.data.message;
            
            // Clean up the message and add appropriate formatting
            let formattedMessage = message;
            
            // Skip redundant or noisy messages
            if (message.includes('from cache') || message.includes('Cache hit')) {
              return; // Skip cache messages as they're handled by the backend rate limiting
            }
            
            // Format different types of messages
            if (message.includes('Progress:') && message.includes('posts processed')) {
              formattedMessage = `📊 ${message}`;
            } else if (message.includes('Starting brand matching')) {
              formattedMessage = `🚀 ${message}`;
            } else if (message.includes('Results saved')) {
              formattedMessage = `✅ ${message}`;
            } else if (message.includes('Loading') && message.includes('model')) {
              formattedMessage = `⚡ ${message}`;
            } else if (message.includes('Initializing')) {
              formattedMessage = `🔄 ${message}`;
            } else if (message.startsWith('[DEBUG]')) {
              formattedMessage = `🔧 ${message.substring(7).trim()}`;
            }
            
            const logMessage = `[${timestamp}] ${formattedMessage}`;
            startTransition(() => {
              setLogs(prev => [...prev, logMessage]);
            });
          } else if (data.type === 'status' && data.data) {
            console.log('[WebSocket] Status update received:', data.data);
            
            // Update job state
            updateJobState(prev => {
              if (prev && prev.job_id === jobId) {
                const updated = { 
                  ...prev, 
                  status: data.data.status,
                  progress: data.data.progress || prev.progress,
                  current_step: data.data.current_step || prev.current_step,
                  result_file: data.data.result_file || prev.result_file,
                  error_message: data.data.error_message || prev.error_message,
                  estimated_time_remaining: data.data.estimated_time_remaining || prev.estimated_time_remaining,
                  current_items: data.data.current_items || prev.current_items,
                  total_items: data.data.total_items || prev.total_items,
                  processing_speed: data.data.processing_speed || prev.processing_speed,
                  elapsed_time: data.data.elapsed_time || prev.elapsed_time
                };
                console.log(`[WebSocket] Updating job state from:`, prev, `to:`, updated);
                return updated;
              }
              return prev;
            });
            
            // Add status update to logs separately to avoid nested state updates
            const statusMessage = `[WS-STATUS] ${data.data.status}${data.data.progress ? ` (${Math.round(data.data.progress)}%)` : ''}${data.data.current_step ? ` - ${data.data.current_step}` : ''}`;
            startTransition(() => {
              setLogs(prevLogs => {
                const lastLog = prevLogs[prevLogs.length - 1];
                if (!lastLog || !lastLog.startsWith('[WS-STATUS]') || lastLog !== statusMessage) {
                  return [...prevLogs, statusMessage];
                }
                return prevLogs;
              });
            });
          } else if (data.type === 'error') {
            // console.error('[WebSocket] Error message:', data.message || data.data?.message);
            startTransition(() => {
              setLogs(prev => [...prev, `[ERROR] ${data.message || data.data?.message || 'Unknown error'}`]);
            });
          } else if (data.type === 'ping') {
            // Respond to ping to keep connection alive
            console.log('[WebSocket] Ping received from server');
            ws.send('pong');
          } else if (data.type === 'pong') {
            // Server responded to our ping
            console.log('[WebSocket] Pong received from server');
          } else if (data.type === 'info') {
            console.log('[WebSocket] Info message:', data.data?.message);
            startTransition(() => {
              setLogs(prev => [...prev, `[INFO] ${data.data?.message || 'Info message'}`]);
            });
          } else {
            console.log('[WebSocket] Unknown message type:', data.type);
          }
        } catch (error) {
          // console.error('[WebSocket] Error parsing message:', error);
          console.log('[WebSocket] Raw message was:', event.data);
          startTransition(() => {
            setLogs(prev => [...prev, `[ERROR] Failed to parse WebSocket message: ${error}`]);
          });
        }
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });

        if (event.code === 1000) {
          // Normal closure
          startTransition(() => {
            setLogs(prev => [...prev, `[INFO] WebSocket connection closed normally`]);
          });
        } else {
          // Abnormal closure
          console.warn('[WebSocket] Closed unexpectedly, code:', event.code, 'reason:', event.reason);
          startTransition(() => {
            setLogs(prev => [...prev, `[WARNING] WebSocket connection lost (code: ${event.code})`]);
          });

          // Retry connection if it's not a normal closure and we haven't exceeded retry limit
          if (retryCount < 3) {
            // Check current job state and decide whether to retry
            const shouldRetry = currentJob && (currentJob.status === 'running' || currentJob.status === 'pending');
            
            if (shouldRetry) {
              const retryDelay = Math.min(2000 * Math.pow(2, retryCount), 8000); // Exponential backoff, max 8s
              console.log(`[WebSocket] Retrying in ${retryDelay}ms... (attempt ${retryCount + 2})`);
              startTransition(() => {
                setLogs(prev => [...prev, `[INFO] Retrying connection in ${retryDelay / 1000}s (attempt ${retryCount + 2}/3)`]);
              });
              setTimeout(() => {
                connectWebSocket(jobId, retryCount + 1);
              }, retryDelay);
            }
          } else {
            startTransition(() => {
              setLogs(prev => [...prev, `[ERROR] Failed to establish WebSocket connection after 3 attempts`]);
            });
            // Start status polling as fallback
            const shouldFallback = currentJob && (currentJob.status === 'running' || currentJob.status === 'pending');
            
            if (shouldFallback) {
              startTransition(() => {
                setLogs(prev => [...prev, `[INFO] Falling back to status polling...`]);
              });
              startStatusPolling(jobId);
            }
          }
        }
      };

      ws.onerror = (error) => {
        // console.error('[WebSocket] Connection error occurred');
        // console.error('[WebSocket] Error event:', error);
        // console.error('[WebSocket] WebSocket details:', {
        //   readyState: ws.readyState,
        //   readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState],
        //   url: ws.url,
        //   protocol: ws.protocol
        // });
        // console.error('[WebSocket] Error type:', error.type);
        // console.error('[WebSocket] Error target:', error.target);
        startTransition(() => {
          setLogs(prev => [...prev, `[ERROR] WebSocket connection failed (readyState: ${ws.readyState})`]);
        });
      };

      wsRef.current = ws;

    } catch (wsCreationError) {
      // console.error('[WebSocket] Failed to create WebSocket object:', wsCreationError);
      const errorMessage = wsCreationError instanceof Error ? wsCreationError.message : 'Unknown error';
      startTransition(() => {
        setLogs(prev => [...prev, `[ERROR] Failed to create WebSocket: ${errorMessage}`]);
      });

      // Retry if we haven't exceeded retry limit
      if (retryCount < 3) {
        const retryDelay = Math.min(2000 * Math.pow(2, retryCount), 8000);
        console.log(`[WebSocket] Retrying WebSocket creation in ${retryDelay}ms... (attempt ${retryCount + 2})`);
        setTimeout(() => {
          connectWebSocket(jobId, retryCount + 1);
        }, retryDelay);
      } else {
        startTransition(() => {
          setLogs(prev => [...prev, `[ERROR] Failed to create WebSocket after ${retryCount + 1} attempts`]);
        });
      }
    }
  }, [updateJobState, setLogs, startStatusPolling, currentJob]);

  const handleJobCreated = useCallback((job: Job) => {
    console.log('Job created:', job);
    
    // Use startTransition to ensure state updates are handled as non-urgent
    startTransition(() => {
      // Use the job manager to update state safely (it already handles deferring)
      updateJob(job);
      setLogs([`[INFO] Job ${job.job_id} created successfully`]);

      // Start status polling immediately as primary method
      console.log(`[Polling] Starting immediate status polling for job: ${job.job_id}`);
      setLogs(prev => [...prev, `[INFO] Starting status monitoring...`]);
      startStatusPolling(job.job_id);

      // Connect to WebSocket for real-time logs (as secondary method)
      connectWebSocket(job.job_id);
    });

    // Test: immediately check if the job readiness endpoint works
    const testJobReadiness = async () => {
      try {
        console.log(`[TEST] Testing job readiness endpoint immediately for job: ${job.job_id}`);
        const testResponse = await fetch(`http://127.0.0.1:8000/api/jobs/${job.job_id}/ready`);
        console.log(`[TEST] Immediate readiness check status: ${testResponse.status}`);

        if (testResponse.ok) {
          const testData = await testResponse.json();
          console.log(`[TEST] Immediate readiness check result:`, testData);
          startTransition(() => {
            setLogs(prev => [...prev, `[INFO] Immediate readiness check: ready=${testData.ready}, status=${testData.status}`]);
          });
        } else {
          // console.error(`[TEST] Immediate readiness check failed: ${testResponse.status}`);
          startTransition(() => {
            setLogs(prev => [...prev, `[ERROR] Immediate readiness check failed: ${testResponse.status}`]);
          });
        }
      } catch (error) {
        // Silently handle fetch errors - backend connection status is shown elsewhere
        startTransition(() => {
          setLogs(prev => [...prev, `[ERROR] Immediate readiness check error: ${error}`]);
        });
      }
    };
    
    // Run the async test without blocking
    testJobReadiness();
  }, [updateJob, startStatusPolling, connectWebSocket]);



  const handleReset = () => {
    resetJob();
    setLogs([]);
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <ConnectionStatus />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Enhanced JobStatus Demo */}
          {/* <JobStatusDemo /> */}

          {/* Job Form */}
          {!currentJob && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  Identify Influencers
                </CardTitle>
                <CardDescription>
                  Configure and launch a new influencers identification job
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent>
                <JobForm
                  onJobCreated={handleJobCreated}
                  disabled={!backendConnected}
                />
              </CardContent>
            </Card>
          )}

          {/* Job Status */}
          {currentJob && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                  Job Status
                </CardTitle>
                <CardDescription>
                  Monitor your analysis progress in real-time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <JobStatus
                  job={currentJob}
                  onReset={handleReset}
                />
              </CardContent>
            </Card>
          )}

          {/* File Manager */}
          {/* <Card>
            <CardHeader>
              <CardTitle>File Manager</CardTitle>
              <CardDescription>
                Upload and manage your dataset files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileManager onFileUploaded={() => {
                // Optional: refresh or update something when file is uploaded
                console.log('File uploaded successfully');
              }} />
            </CardContent>
          </Card> */}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Log Viewer */}
          {/* <Card>
            <CardHeader className='flex-row justify-between'>
              <div>
                <CardTitle>Real-time Logs</CardTitle>
                <CardDescription>
                  Live updates from your analysis process
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                <Badge variant="outline" className="gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Live
                </Badge>
              </div>
            </CardHeader>
            <Separator />
            <CardContent>
              <LogViewer logs={logs} />
            </CardContent>
          </Card> */}

          {/* Results Viewer */}
          {/* {currentJob && (
            <Card>
              <CardHeader>
                <CardTitle>Analysis Results</CardTitle>
                <CardDescription>
                  Download and view your completed analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResultsViewer job={currentJob} />
              </CardContent>
            </Card>
          )} */}
        </div>
      </div>
    </div>
  );
}
