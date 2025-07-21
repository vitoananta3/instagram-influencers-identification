#!/usr/bin/env python3

import asyncio
import websockets
import json
import requests
import sys

async def test_http_endpoints():
    """Test basic HTTP endpoints first"""
    print("Testing HTTP endpoints...")
    
    try:
        # Test root endpoint
        response = requests.get("http://127.0.0.1:8000/", timeout=5)
        print(f"✓ Root endpoint: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"✗ Root endpoint failed: {e}")
        return False
    
    try:
        # Test health endpoint
        response = requests.get("http://127.0.0.1:8000/api/health", timeout=5)
        print(f"✓ Health endpoint: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"✗ Health endpoint failed: {e}")
        return False
    
    return True

async def test_websocket():
    """Test WebSocket connections"""
    print("\n" + "="*50)
    print("Testing WebSocket connections...")
    
    # Test 1: Simple WebSocket endpoint
    print("1. Testing simple WebSocket endpoint...")
    try:
        async with websockets.connect("ws://127.0.0.1:8000/api/test") as websocket:
            print("✓ WebSocket connection established")
            
            # Receive messages
            messages_received = 0
            while messages_received < 5:  # Expect up to 5 messages
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=3.0)
                    print(f"  Received: {message}")
                    messages_received += 1
                except asyncio.TimeoutError:
                    print("  No more messages (timeout)")
                    break
            
            print("✓ Simple WebSocket test completed successfully")
            
    except Exception as e:
        print(f"✗ WebSocket test failed: {e}")
        return False
    
    # Test 2: Job logs WebSocket (should fail with job not found, but connection should work)
    print("\n2. Testing job logs WebSocket endpoint...")
    try:
        test_job_id = "test-job-12345"
        async with websockets.connect(f"ws://127.0.0.1:8000/api/jobs/{test_job_id}/logs") as websocket:
            print("✓ Job logs WebSocket connection established")
            
            # Should receive an error about job not found
            try:
                 message = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                 data = json.loads(message)
                 print(f"  Received: {data}")
                 
                 if data.get("type") == "error" and "not found" in data.get("data", {}).get("message", "").lower():
                     print("✓ Expected 'job not found' error received - WebSocket endpoint is working")
                 else:
                     print(f"  Unexpected message: {data}")
                     
            except asyncio.TimeoutError:
                 print("✗ No response received from job logs endpoint within 2 seconds")
                 return False
                
    except Exception as e:
        print(f"✗ Job logs WebSocket test failed: {e}")
        return False
    
    return True

async def main():
    print("WebSocket Connectivity Test")
    print("Make sure the backend server is running on http://127.0.0.1:8000")
    print("Then run this script to test WebSocket connectivity")
    print("-" * 50)
    
    # First test HTTP endpoints
    if not await test_http_endpoints():
        print("\n❌ HTTP endpoints are not working. Please check if the backend server is running.")
        print("Start the server with: python backend/main.py")
        sys.exit(1)
    
    # Then test WebSocket endpoints
    if await test_websocket():
        print("\n✅ All WebSocket tests passed!")
        print("The WebSocket endpoints are working correctly.")
    else:
        print("\n❌ WebSocket tests failed!")
        print("There may be an issue with the WebSocket configuration.")

if __name__ == "__main__":
    asyncio.run(main())