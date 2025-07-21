'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Wifi, WifiOff } from 'lucide-react';
import { useBackendConnection } from '../hooks/useBackendConnection';
import ClientOnly from './ClientOnly';

export default function ConnectionStatus() {
  const backendConnected = useBackendConnection();

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <ClientOnly fallback={
          <Alert className="border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-gray-400" />
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <WifiOff className="h-3 w-3" />
                  Checking...
                </Badge>
                <span className="text-sm font-medium">
                  Backend Status
                </span>
              </div>
            </div>
          </Alert>
        }>
          <Alert className={backendConnected ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <div className="flex items-center gap-3">
              {backendConnected ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <div className="flex items-center gap-2">
                <Badge variant={backendConnected ? "default" : "destructive"} className={`gap-1 ${!backendConnected ? 'text-white' : ''}`}>
                  {backendConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 text-white" />}
                  {backendConnected ? 'Connected' : 'Disconnected'}
                </Badge>
                <span className="text-sm font-medium">
                  Backend Status
                </span>
              </div>
            </div>
            {!backendConnected && (
              <AlertDescription className="mt-2 text-red-700">
                Make sure the Backend server is running on http://127.0.0.1:8000
              </AlertDescription>
            )}
          </Alert>
        </ClientOnly>
      </CardContent>
    </Card>
  );
}