'use client';

import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
  FileText,
  Info,
  AlertTriangle,
  AlertCircle,
  Bug
} from 'lucide-react';

interface LogViewerProps {
  logs: string[];
}

export default function LogViewer({ logs }: LogViewerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const formatLogLine = (log: string) => {
    // Handle new formatted messages with emojis
    if (log.includes('📊 Progress:') || log.includes('🚀 Starting') || log.includes('✅ Completed') || 
        log.includes('⚡ Cache') || log.includes('🔍 Processing') || log.includes('💾 Saving') ||
        log.includes('📈 Status:') || log.includes('❌ Error:')) {
      return { timestamp: '', level: 'INFO', message: log };
    }
    
    // Extract timestamp, level, and message from traditional format
    const match = log.match(/\[(.*?)\]\s*(\w+):\s*(.*)/);
    if (match) {
      const [, timestamp, level, message] = match;
      return { timestamp, level, message };
    }
    return { timestamp: '', level: 'INFO', message: log };
  };

  const getLevelIcon = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      case 'WARNING':
      case 'WARN':
        return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
      case 'INFO':
        return <Info className="h-3 w-3 text-blue-500" />;
      case 'DEBUG':
        return <Bug className="h-3 w-3 text-gray-500" />;
      default:
        return <Info className="h-3 w-3 text-gray-500" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'text-red-400';
      case 'WARNING':
      case 'WARN':
        return 'text-yellow-400';
      case 'INFO':
        return 'text-blue-400';
      case 'DEBUG':
        return 'text-gray-400';
      default:
        return 'text-gray-300';
    }
  };

  const getLogStats = () => {
    const stats = logs.reduce((acc, log) => {
      const { level } = formatLogLine(log);
      const upperLevel = level.toUpperCase();
      acc[upperLevel] = (acc[upperLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return stats;
  };

  const logStats = getLogStats();

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* <Badge variant="secondary">
            {logs.length} lines
          </Badge> */}
        </div>
      </div>

      {/* Log Statistics */}
      {logs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(logStats).map(([level, count]) => (
            <Badge 
              key={level} 
              variant="outline" 
              className="gap-1"
            >
              {getLevelIcon(level)}
              {level}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Log Container */}
      <Card className="p-0 overflow-hidden">
        <div
          ref={logContainerRef}
          className="bg-slate-950 text-slate-100 p-4 font-mono text-sm h-96 overflow-y-auto"
          style={{ minHeight: '555px' }}
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-slate-400">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Waiting for logs...</p>
                <p className="text-xs mt-1 opacity-75">
                  Start a job to see real-time processing logs here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => {
                const { timestamp, level, message } = formatLogLine(log);
                const isEmojiMessage = message.includes('📊') || message.includes('🚀') || 
                                     message.includes('✅') || message.includes('⚡') || 
                                     message.includes('🔍') || message.includes('💾') ||
                                     message.includes('📈') || message.includes('❌');
                
                return (
                  <div key={index} className="flex text-xs leading-relaxed hover:bg-slate-900/50 px-2 py-1 rounded">
                    {timestamp && (
                      <span className="text-slate-500 mr-3 flex-shrink-0 w-20">
                        {timestamp.split(' ')[1] || timestamp}
                      </span>
                    )}
                    {!isEmojiMessage && (
                      <div className="flex mt-1 mr-3 flex-shrink-0">
                        {getLevelIcon(level)}
                      </div>
                    )}
                    {!isEmojiMessage && (
                      <span className={`mr-3 flex-shrink-0 font-medium ${getLevelColor(level)} w-12`}>
                        {level}
                      </span>
                    )}
                    <span className={`break-words flex-1 ${isEmojiMessage ? 'text-slate-100 font-medium' : 'text-slate-200'}`}>
                      {message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Instructions */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p className="flex items-center gap-2">
          <span>💡</span>
          Logs update in real-time via WebSocket connection
        </p>
        <p className="flex items-center gap-2">
          <span>📜</span>
          Scroll is automatically maintained at the bottom for new logs
        </p>
      </div>
    </div>
  );
}