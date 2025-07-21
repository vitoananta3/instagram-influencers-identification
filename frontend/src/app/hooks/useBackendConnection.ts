'use client';

import { useState, useEffect } from 'react';

export function useBackendConnection() {
  const [backendConnected, setBackendConnected] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Mark that we're on the client side
    setIsClient(true);
    
    // Only start checking connection after client-side hydration
    checkBackendConnection();
    const interval = setInterval(checkBackendConnection, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const checkBackendConnection = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setBackendConnected(true);
      } else {
        setBackendConnected(false);
      }
    } catch (error) {
      setBackendConnected(false);
    }
  };

  // Return false during SSR and initial hydration to prevent mismatch
  return isClient ? backendConnected : false;
}