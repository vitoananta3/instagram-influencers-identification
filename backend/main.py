from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
import json
import os
import sys
import threading
import time
import uuid
from datetime import datetime
import logging
from pathlib import Path

# Add the implementation directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'implementation', 'bab-4'))

# Import from the existing script (note: using hyphen in filename)
import importlib.util
spec = importlib.util.spec_from_file_location(
    "main_2_engagement", 
    os.path.join(os.path.dirname(__file__), '..', 'implementation', 'bab-4', 'main-2-engagement.py')
)
main_2_engagement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main_2_engagement)

PostProcessor = main_2_engagement.PostProcessor
format_time = main_2_engagement.format_time

app = FastAPI(title="Brand Engagement Analysis API", version="1.0.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "ws://localhost:3000", "ws://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Global job storage
jobs: Dict[str, Dict[str, Any]] = {}
active_websockets: Dict[str, WebSocket] = {}
job_threads: Dict[str, threading.Thread] = {}
job_stop_flags: Dict[str, threading.Event] = {}

class JobRequest(BaseModel):
    brand_values: str
    content_weight: float = 0.7
    posts_file: str = "dataset/post_34000_sampled_clean_info.txt"
    output_filename: str = "brand_match_results.csv"
    use_cache: bool = True
    use_checkpoint: bool = True

class JobResponse(BaseModel):
    job_id: str
    status: str
    message: str

class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: Optional[float] = None
    current_step: Optional[str] = None
    logs: list = []
    error: Optional[str] = None
    result_file: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    current_items: Optional[int] = None
    total_items: Optional[int] = None
    processing_speed: Optional[float] = None
    elapsed_time: Optional[str] = None
    estimated_time_remaining: Optional[str] = None

class LogCapture:
    """Capture logs and send them via WebSocket"""
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.logs = []
        self.original_stdout = sys.stdout
        self.cache_message_count = 0
        self.last_cache_summary_time = time.time()
        self.processed_count = 0
        self.last_progress_report = 0
        self._writing = False  # Initialize recursion flag
        self.start_time = time.time()  # Track processing start time
        
    def _parse_tqdm_progress(self, message):
        """Parse tqdm progress bar output and update job progress"""
        import re
        
        # Debug: Log all messages to see what we're getting
        if "%" in message and "|" in message:
            print(f"[DEBUG] Potential tqdm message: {repr(message)}", file=self.original_stdout)
        
        # Pattern to match tqdm output: "2%|▊                                              | 575/32310 [01:25<1:17:13,  6.85it/s]"
        tqdm_pattern = r'(\d+)%\|[^|]*\|\s*(\d+)/(\d+)\s*\[([^<]+)<([^,]+),\s*([^\]]+)\]'
        match = re.search(tqdm_pattern, message)
        
        if match:
            print(f"[DEBUG] tqdm match found! Groups: {match.groups()}", file=self.original_stdout)
            percentage = int(match.group(1))
            current_items = int(match.group(2))
            total_items = int(match.group(3))
            elapsed_time = match.group(4).strip()
            remaining_time = match.group(5).strip()
            speed_str = match.group(6).strip()
            
            # Extract numeric speed value
            speed_match = re.search(r'([0-9.]+)', speed_str)
            speed = float(speed_match.group(1)) if speed_match else 0.0
            
            # Update job progress in the global jobs dictionary
            if self.job_id in jobs:
                jobs[self.job_id].update({
                    "progress": float(percentage),
                    "current_items": current_items,
                    "total_items": total_items,
                    "processing_speed": speed,
                    "elapsed_time": elapsed_time,
                    "estimated_time_remaining": remaining_time,
                    "current_step": f"Processing posts: {percentage}%|{current_items:,}/{total_items:,} [{elapsed_time}<{remaining_time}, {speed:.1f}it/s]"
                })
                print(f"[DEBUG] Updated job progress: {percentage}% ({current_items}/{total_items})", file=self.original_stdout)
            
            return True
        return False
        
    def _format_console_message(self, message):
        """Format message for clean console output"""
        cleaned = message.strip()
        if not cleaned:
            return ""
        
        # Additional cleaning to prevent escape sequence accumulation
        # Remove any residual JSON-like structures that might have leaked through
        if cleaned.startswith('{"') and '"}' in cleaned:
            try:
                # Try to extract the actual message from JSON-like structure
                import re
                # Look for message field in JSON-like string
                match = re.search(r'"message":\s*"([^"]*)"', cleaned)
                if match:
                    cleaned = match.group(1)
                    # Unescape the extracted message
                    cleaned = cleaned.replace('\\"', '"').replace("\\'", "'").replace('\\\\', '\\')
            except:
                pass
            
        # Extract progress information for better tracking
        if "Processed" in cleaned and "posts" in cleaned:
            # Extract number from "Processed X posts" messages
            import re
            match = re.search(r'Processed (\d+)', cleaned)
            if match:
                self.processed_count = int(match.group(1))
                # Only show progress every 100 posts
                if self.processed_count % 100 == 0 or self.processed_count - self.last_progress_report >= 100:
                    self.last_progress_report = self.processed_count
                    return f"📊 Progress: {self.processed_count} posts processed"
                else:
                    return None  # Skip this message
            return f"📊 {cleaned}"
            
        # Handle cache messages with better rate limiting
        elif any(cache_type in cleaned for cache_type in ["from cache", "Cache hit", "engagement metrics", "embedding"]):
            self.cache_message_count += 1
            # Only show cache summary every 500 hits to reduce noise
            if self.cache_message_count % 500 == 0:
                return f"💾 Cache efficiency: {self.cache_message_count} cache hits"
            return None  # Skip individual cache messages
            
        # Format other message types
        elif cleaned.startswith("[DEBUG]"):
            return f"🔧 {cleaned[7:].strip()}"
        elif "Starting brand matching" in cleaned:
            return f"🚀 {cleaned}"
        elif "Results saved to" in cleaned:
            return f"✅ {cleaned}"
        elif "Loading" in cleaned and "model" in cleaned:
            return f"⚡ {cleaned}"
        elif "Initializing" in cleaned:
            return f"🔄 {cleaned}"
        elif "=" in cleaned and len(cleaned) > 30:
            return f"\n{cleaned}\n"
        else:
            return cleaned
        
    def _clean_message(self, message):
        """Clean and normalize message content to prevent escaping issues"""
        if not message:
            return ""
        
        # Convert to string if not already
        msg = str(message).strip()
        
        # Remove excessive escaping that might have accumulated
        # Handle common escape sequences that get over-escaped
        msg = msg.replace('\\\\\\\\', '\\')  # Reduce quadruple backslashes to single
        msg = msg.replace('\\\\', '\\')      # Reduce double backslashes to single
        msg = msg.replace("\\'", "'")        # Unescape single quotes
        msg = msg.replace('\\"', '"')        # Unescape double quotes
        
        # Remove any JSON-like wrapper if present (sometimes messages get wrapped)
        if msg.startswith('{"') and msg.endswith('"}'):
            try:
                # Try to parse as JSON and extract the actual message
                import json
                parsed = json.loads(msg)
                if isinstance(parsed, dict) and 'message' in parsed:
                    msg = parsed['message']
                elif isinstance(parsed, str):
                    msg = parsed
            except:
                pass  # If parsing fails, keep original
        
        return msg

    def write(self, message):
        # Prevent recursion - if already writing, just pass to original stdout
        if self._writing:
            try:
                self.original_stdout.write(message)
                self.original_stdout.flush()
            except:
                pass  # Ignore errors to prevent further recursion
            return
            
        if not message or not message.strip():
            return
            
        self._writing = True
        try:
            # Clean the message to prevent escaping issues
            cleaned_message = self._clean_message(message)
            
            # Check if this is a tqdm progress update
            is_tqdm_progress = self._parse_tqdm_progress(cleaned_message)
            
            # Create log entry for WebSocket with cleaned message
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "message": cleaned_message  # Use cleaned message
            }
            
            # Store in job logs for WebSocket (thread-safe)
            if self.job_id in jobs:
                try:
                    self.logs.append(log_entry)
                    jobs[self.job_id]["logs"].append(log_entry)
                except:
                    pass  # Ignore errors to prevent recursion
            
            # Write to console - use original stdout directly to avoid recursion
            try:
                # For tqdm progress, show a cleaner format in console
                if is_tqdm_progress:
                    if self.job_id in jobs:
                        job = jobs[self.job_id]
                        current = job.get("current_items", 0)
                        total = job.get("total_items", 0)
                        progress = job.get("progress", 0)
                        speed = job.get("processing_speed", 0)
                        eta = job.get("estimated_time_remaining", "")
                        
                        formatted_message = f"📊 Progress: {progress}% ({current:,}/{total:,}) | Speed: {speed:.1f} items/s | ETA: {eta}"
                        self.original_stdout.write(formatted_message + '\n')
                        self.original_stdout.flush()
                else:
                    formatted_message = self._format_console_message(cleaned_message)
                    if formatted_message is not None:
                        self.original_stdout.write(formatted_message + '\n')
                        self.original_stdout.flush()
            except:
                # Fallback: write raw message to avoid recursion
                try:
                    self.original_stdout.write(cleaned_message)
                    self.original_stdout.flush()
                except:
                    pass  # Final fallback: ignore to prevent infinite recursion
                
        except Exception:
            # Ignore all exceptions to prevent recursion
            pass
        finally:
            self._writing = False
    
    def flush(self):
        try:
            self.original_stdout.flush()
        except:
            pass

def run_processing_job(job_id: str, request: JobRequest):
    """Run the processing job in a separate thread"""
    log_capture = None
    original_stdout = sys.stdout
    
    try:
        # Create stop flag for this job
        stop_flag = threading.Event()
        job_stop_flags[job_id] = stop_flag
        
        # Update job status
        print(f"[DEBUG] Updating job {job_id} status to 'running'")
        jobs[job_id].update({
            "status": "running",
            "current_step": "Initializing processor",
            "started_at": datetime.now()
        })
        print(f"[DEBUG] Job {job_id} status updated: {jobs[job_id]['status']}")
        
        # Check for stop signal before proceeding
        if stop_flag.is_set():
            print(f"[DEBUG] Job {job_id} was stopped before initialization")
            jobs[job_id].update({
                "status": "cancelled",
                "error": "Job was cancelled before processing started",
                "completed_at": datetime.now()
            })
            return
        
        # Set up log capture with error handling
        log_capture = LogCapture(job_id)
        sys.stdout = log_capture
        
        # Calculate weights
        w1 = request.content_weight
        w2 = 1 - w1
        weights = (w1, w2)
        
        print(f"Starting brand matching process for job {job_id}")
        print(f"Brand values: {request.brand_values}")
        print(f"Weights: content similarity={w1:.2f}, engagement={w2:.2f}")
        print(f"Posts file: {request.posts_file}")
        print(f"Output file: {request.output_filename}")
        print("=" * 50)
        
        # Check for stop signal before model loading
        if stop_flag.is_set():
            print(f"[DEBUG] Job {job_id} was stopped before model loading")
            jobs[job_id].update({
                "status": "cancelled",
                "error": "Job was cancelled during initialization",
                "completed_at": datetime.now()
            })
            return
        
        # Initialize processor with error handling
        print(f"[DEBUG] Updating job {job_id} current_step to 'Loading ALIGN model'")
        jobs[job_id]["current_step"] = "Loading ALIGN model"
        jobs[job_id]["progress"] = 10.0
        
        try:
            processor = PostProcessor(result_dir="inti/model-result/", use_cache=request.use_cache, use_checkpoint=request.use_checkpoint)
            print(f"PostProcessor initialized successfully")
        except Exception as e:
            print(f"[ERROR] Failed to initialize PostProcessor: {e}")
            raise e
        
        # Check for stop signal before processing
        if stop_flag.is_set():
            print(f"[DEBUG] Job {job_id} was stopped before processing")
            jobs[job_id].update({
                "status": "cancelled",
                "error": "Job was cancelled before processing started",
                "completed_at": datetime.now()
            })
            return
        
        # Run processing with error handling
        print(f"[DEBUG] Updating job {job_id} current_step to 'Processing posts'")
        jobs[job_id]["current_step"] = "Processing posts"
        jobs[job_id]["progress"] = 50.0
        
        try:
            # Keep log capture active during processing to capture tqdm output
            # Pass the stop flag to the processor so it can check for cancellation
            results = processor.process_posts(
                request.posts_file, 
                request.brand_values, 
                weights, 
                request.output_filename,
                stop_flag=stop_flag  # Pass stop flag to allow cancellation during processing
            )
            
            # Check if job was cancelled during processing
            if stop_flag.is_set():
                print(f"[DEBUG] Job {job_id} was cancelled during processing")
                jobs[job_id].update({
                    "status": "cancelled",
                    "error": "Job was cancelled during processing",
                    "completed_at": datetime.now()
                })
                return
                
            print(f"Post processing completed successfully")
        except Exception as e:
            # Check if this was due to cancellation
            if stop_flag.is_set():
                print(f"[DEBUG] Job {job_id} was cancelled during processing (exception path)")
                jobs[job_id].update({
                    "status": "cancelled",
                    "error": "Job was cancelled during processing",
                    "completed_at": datetime.now()
                })
                return
            print(f"[ERROR] Failed during post processing: {e}")
            raise e
        
        if results is not None:
            result_file_path = os.path.join("inti/model-result/", request.output_filename)
            print(f"[DEBUG] Updating job {job_id} status to 'completed'")
            jobs[job_id].update({
                "status": "completed",
                "current_step": "Completed",
                "result_file": result_file_path,
                "completed_at": datetime.now(),
                "progress": 100.0
            })
            print(f"[DEBUG] Job {job_id} completed successfully with status: {jobs[job_id]['status']}")
            print(f"Results saved to: {result_file_path}")
        else:
            print(f"[DEBUG] Updating job {job_id} status to 'failed' - no results")
            jobs[job_id].update({
                "status": "failed",
                "error": "Processing returned no results",
                "completed_at": datetime.now()
            })
            print(f"[DEBUG] Job {job_id} failed with status: {jobs[job_id]['status']}")
            
    except Exception as e:
        error_msg = str(e)
        print(f"[DEBUG] Exception in job {job_id}: {error_msg}")
        print(f"[DEBUG] Updating job {job_id} status to 'failed' - exception")
        
        # Ensure job exists before updating
        if job_id in jobs:
            jobs[job_id].update({
                "status": "failed",
                "error": error_msg,
                "completed_at": datetime.now()
            })
            print(f"[DEBUG] Job {job_id} failed with status: {jobs[job_id]['status']}")
        else:
            print(f"[DEBUG] Job {job_id} not found in jobs dictionary during error handling")
    finally:
        # Always restore stdout safely, regardless of what happened
        try:
            sys.stdout = original_stdout
        except:
            sys.stdout = sys.__stdout__  # Ultimate fallback
        
        # Clean up thread tracking
        if job_id in job_threads:
            del job_threads[job_id]
        if job_id in job_stop_flags:
            del job_stop_flags[job_id]
        
        # Final status check
        if job_id in jobs:
            print(f"[DEBUG] Job {job_id} processing thread finished. Final status: {jobs[job_id].get('status', 'unknown')}")
        else:
            print(f"[DEBUG] Job {job_id} processing thread finished. Job not found in dictionary.")
        
        # Clean up log capture
        if log_capture is not None:
            try:
                log_capture.flush()
            except:
                pass

@app.post("/api/jobs", response_model=JobResponse)
async def create_job(request: JobRequest):
    """Create a new processing job"""
    job_id = str(uuid.uuid4())
    print(f"[DEBUG] Creating job with ID: {job_id}")
    
    # Validate inputs
    if not request.brand_values.strip():
        raise HTTPException(status_code=400, detail="Brand values cannot be empty")
    
    if not 0 <= request.content_weight <= 1:
        raise HTTPException(status_code=400, detail="Content weight must be between 0 and 1")
    
    # Check if posts file exists
    if not os.path.exists(request.posts_file):
        raise HTTPException(status_code=400, detail=f"Posts file not found: {request.posts_file}")
    
    # Initialize job
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0.0,
        "current_step": "Queued",
        "logs": [],
        "error": None,
        "result_file": None,
        "started_at": None,
        "completed_at": None,
        "request": request.dict()
    }
    
    print(f"[DEBUG] Job {job_id} initialized in jobs dictionary")
    print(f"[DEBUG] Current jobs in memory after creation: {list(jobs.keys())}")
    print(f"[DEBUG] Job {job_id} details: status={jobs[job_id].get('status')}, request_file={jobs[job_id].get('request', {}).get('posts_file')}")
    
    # Start processing in background thread
    thread = threading.Thread(target=run_processing_job, args=(job_id, request))
    thread.daemon = True
    thread.start()
    
    # Store thread reference for potential termination
    job_threads[job_id] = thread
    
    print(f"[DEBUG] Background thread started for job {job_id}")
    print(f"[DEBUG] Thread is alive: {thread.is_alive()}")
    
    # Small delay to ensure job is fully committed and thread starts
    await asyncio.sleep(0.2)
    
    print(f"[DEBUG] After delay - Thread is alive: {thread.is_alive()}")
    print(f"[DEBUG] Job status after thread start: {jobs[job_id].get('status', 'unknown')}")
    
    return JobResponse(
        job_id=job_id,
        status="pending",
        message="Job created and queued for processing"
    )

@app.get("/api/jobs/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get the status of a specific job"""
    print(f"[DEBUG] Status request for job_id: {job_id}")
    print(f"[DEBUG] Available jobs: {list(jobs.keys())}")
    
    if job_id not in jobs:
        print(f"[DEBUG] Job {job_id} not found")
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    print(f"[DEBUG] Returning job status for {job_id}: status={job.get('status')}, progress={job.get('progress')}")
    return JobStatus(**job)

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "jobs_count": len(jobs),
        "active_jobs": list(jobs.keys())
    }

@app.get("/api/jobs/{job_id}/ready")
async def check_job_ready(job_id: str):
    """Check if a job is ready for WebSocket connections"""
    print(f"[DEBUG] Job readiness check for job_id: {job_id}")
    print(f"[DEBUG] Current jobs in memory: {list(jobs.keys())}")
    
    if job_id not in jobs:
        print(f"[DEBUG] Job {job_id} not found in jobs dictionary")
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    print(f"[DEBUG] Job {job_id} found: status={job.get('status')}, logs_count={len(job.get('logs', []))}")
    
    # Job is ready if it exists and has been properly initialized
    is_ready = (
        job_id in jobs and 
        "status" in job and 
        "logs" in job and
        isinstance(job["logs"], list)
    )
    
    print(f"[DEBUG] Job {job_id} readiness: {is_ready}")
    
    return {
        "job_id": job_id,
        "ready": is_ready,
        "status": job.get("status", "unknown")
    }

@app.get("/api/jobs")
async def list_jobs():
    """List all jobs"""
    return {"jobs": list(jobs.values())}

@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its data, terminating it if running"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    job_status = job.get("status", "unknown")
    
    print(f"[DEBUG] Deleting job {job_id} with status: {job_status}")
    
    # If job is running, signal it to stop
    if job_status in ["running", "pending"]:
        print(f"[DEBUG] Job {job_id} is {job_status}, signaling stop")
        
        # Set stop flag to signal the processing thread to stop
        if job_id in job_stop_flags:
            job_stop_flags[job_id].set()
            print(f"[DEBUG] Stop flag set for job {job_id}")
        
        # Update job status to cancelled
        jobs[job_id].update({
            "status": "cancelled",
            "error": "Job was cancelled by user",
            "completed_at": datetime.now()
        })
        
        # Wait a short time for graceful shutdown
        if job_id in job_threads:
            thread = job_threads[job_id]
            if thread.is_alive():
                print(f"[DEBUG] Waiting for thread {job_id} to finish...")
                # Give the thread a moment to check the stop flag and exit gracefully
                thread.join(timeout=2.0)  # Wait up to 2 seconds
                if thread.is_alive():
                    print(f"[WARNING] Thread {job_id} did not stop gracefully within timeout")
                else:
                    print(f"[DEBUG] Thread {job_id} stopped gracefully")
    
    # Remove from active websockets if connected
    if job_id in active_websockets:
        try:
            # Close WebSocket connection
            websocket = active_websockets[job_id]
            await websocket.close()
            print(f"[DEBUG] Closed WebSocket for job {job_id}")
        except Exception as e:
            print(f"[DEBUG] Error closing WebSocket for job {job_id}: {e}")
        del active_websockets[job_id]
    
    # Clean up thread tracking
    if job_id in job_threads:
        del job_threads[job_id]
        print(f"[DEBUG] Removed thread reference for job {job_id}")
    
    if job_id in job_stop_flags:
        del job_stop_flags[job_id]
        print(f"[DEBUG] Removed stop flag for job {job_id}")
    
    # Delete job from memory
    del jobs[job_id]
    print(f"[DEBUG] Job {job_id} deleted successfully")
    
    return {
        "message": "Job deleted successfully",
        "was_running": job_status in ["running", "pending"],
        "terminated": job_status in ["running", "pending"]
    }

@app.get("/api/jobs/{job_id}/download")
async def download_results(job_id: str):
    """Download the results file for a completed job"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job["status"] != "completed" or not job["result_file"]:
        raise HTTPException(status_code=400, detail="Job not completed or no results available")
    
    result_file = job["result_file"]
    if not os.path.exists(result_file):
        raise HTTPException(status_code=404, detail="Result file not found")
    
    return FileResponse(
        path=result_file,
        filename=os.path.basename(result_file),
        media_type="text/csv"
    )

@app.get("/api/jobs/{job_id}/results")
async def get_job_results(job_id: str, page: int = 1, limit: int = 10):
    """Get parsed CSV results for a completed job with pagination"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job["status"] != "completed" or not job["result_file"]:
        raise HTTPException(status_code=400, detail="Job not completed or no results available")
    
    result_file = job["result_file"]
    if not os.path.exists(result_file):
        raise HTTPException(status_code=404, detail="Result file not found")
    
    try:
        import pandas as pd
        
        # Read CSV file
        df = pd.read_csv(result_file)
        
        # Calculate pagination
        total_rows = len(df)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        
        # Get paginated data
        paginated_df = df.iloc[start_idx:end_idx]
        
        # Convert to list of dictionaries
        results = paginated_df.to_dict('records')
        
        return {
            "results": results,
            "pagination": {
                "current_page": page,
                "total_pages": (total_rows + limit - 1) // limit,
                "total_items": total_rows,
                "items_per_page": limit,
                "has_next": end_idx < total_rows,
                "has_previous": page > 1
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading CSV file: {str(e)}")

@app.get("/api/jobs/completed")
async def get_completed_jobs():
    """Get list of all completed jobs"""
    completed_jobs = []
    for job_id, job_data in jobs.items():
        if job_data["status"] == "completed" and job_data.get("result_file"):
            completed_jobs.append({
                "job_id": job_id,
                "created_at": job_data.get("created_at"),
                "completed_at": job_data.get("completed_at"),
                "result_file": os.path.basename(job_data["result_file"]) if job_data.get("result_file") else None,
                "brand_values": job_data.get("brand_values", ""),
                "content_weight": job_data.get("content_weight", 0.5)
            })
    
    # Sort by completion time (most recent first)
    completed_jobs.sort(key=lambda x: x.get("completed_at", ""), reverse=True)
    return {"jobs": completed_jobs}

@app.get("/api/result-files")
async def get_result_files():
    """Get list of all CSV files from the model-result directory"""
    result_dir = "inti/model-result/"
    
    if not os.path.exists(result_dir):
        raise HTTPException(status_code=404, detail="Result directory not found")
    
    try:
        csv_files = []
        for filename in os.listdir(result_dir):
            if filename.endswith('.csv'):
                file_path = os.path.join(result_dir, filename)
                file_stat = os.stat(file_path)
                
                csv_files.append({
                    "filename": filename,
                    "file_path": file_path,
                    "size": file_stat.st_size,
                    "modified_time": file_stat.st_mtime,
                    "created_time": file_stat.st_ctime
                })
        
        # Sort by modification time (most recent first)
        csv_files.sort(key=lambda x: x["modified_time"], reverse=True)
        
        return {"files": csv_files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading result directory: {str(e)}")

@app.get("/api/result-files/{filename}/results")
async def get_file_results(filename: str, page: int = 1, limit: int = 10):
    """Get parsed CSV results for a specific file with pagination"""
    result_dir = "inti/model-result/"
    file_path = os.path.join(result_dir, filename)
    
    # Security check - ensure filename doesn't contain path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    if not filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Result file not found")
    
    try:
        import pandas as pd
        
        # Read CSV file
        df = pd.read_csv(file_path)
        
        # Sort by final_direct_score in descending order (highest first)
        if 'final_direct_score' in df.columns:
            df = df.sort_values('final_direct_score', ascending=False)
        
        # Calculate pagination
        total_rows = len(df)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        
        # Get paginated data
        paginated_df = df.iloc[start_idx:end_idx]
        
        # Convert to list of dictionaries
        results = paginated_df.to_dict('records')
        
        return {
            "results": results,
            "pagination": {
                "current_page": page,
                "total_pages": (total_rows + limit - 1) // limit,
                "total_items": total_rows,
                "items_per_page": limit,
                "has_next": end_idx < total_rows,
                "has_previous": page > 1
            },
            "file_info": {
                "filename": filename,
                "total_rows": total_rows
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading CSV file: {str(e)}")

@app.websocket("/api/jobs/{job_id}/logs")
async def websocket_logs(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time log streaming"""
    print(f"[WebSocket] New connection attempt for job: {job_id}")
    print(f"[WebSocket] Current jobs in memory: {list(jobs.keys())}")
    print(f"[WebSocket] WebSocket client info: {websocket.client}")
    print(f"[WebSocket] WebSocket headers: {dict(websocket.headers)}")
    
    try:
        print(f"[WebSocket] Attempting to accept connection for job: {job_id}")
        await websocket.accept()
        print(f"[WebSocket] Connection accepted successfully for job: {job_id}")
    except Exception as e:
        print(f"[WebSocket] Failed to accept connection for job {job_id}: {e}")
        print(f"[WebSocket] Exception type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return
    
    # Check if job exists immediately
    if job_id not in jobs:
        error_msg = f"Job {job_id} not found"
        print(f"[WebSocket] {error_msg}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "data": {"message": error_msg}
            }, ensure_ascii=False))
        except:
            pass
        await websocket.close()
        return
    
    # Wait for job to be properly initialized (with shorter timeout for existing jobs)
    max_wait_time = 10  # 10 seconds for job initialization
    wait_interval = 0.5  # seconds
    waited_time = 0
    
    print(f"[WebSocket] Job {job_id} exists, waiting for it to be properly initialized...")
    while waited_time < max_wait_time:
        job = jobs[job_id]
        # Check if job is properly initialized
        if ("status" in job and "logs" in job and isinstance(job["logs"], list)):
            print(f"[WebSocket] Job {job_id} is ready after {waited_time:.1f} seconds")
            break
        
        await asyncio.sleep(wait_interval)
        waited_time += wait_interval
    
    # Final check - if job was deleted or still not ready
    if job_id not in jobs:
        error_msg = f"Job {job_id} was deleted during initialization"
        print(f"[WebSocket] {error_msg}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "data": {"message": error_msg}
            }, ensure_ascii=False))
        except:
            pass
        await websocket.close()
        return
    
    # Double-check job readiness
    job = jobs[job_id]
    if not ("status" in job and "logs" in job and isinstance(job["logs"], list)):
        error_msg = f"Job {job_id} exists but is not properly initialized"
        print(f"[WebSocket] {error_msg}")
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "data": {"message": error_msg}
            }, ensure_ascii=False))
        except:
            pass
        await websocket.close()
        return
    
    print(f"[WebSocket] Job {job_id} found and ready, registering WebSocket connection")
    # Register websocket
    active_websockets[job_id] = websocket
    
    try:
        # Send connection confirmation
        await websocket.send_text(json.dumps({
            "type": "info",
            "data": {"message": f"Connected to job {job_id} logs"}
        }, ensure_ascii=False))
        
        # Send existing logs
        for log_entry in jobs[job_id]["logs"]:
            try:
                # Ensure we're sending clean JSON without double-encoding
                websocket_message = {
                    "type": "log",
                    "data": {
                        "timestamp": log_entry.get("timestamp", ""),
                        "message": log_entry.get("message", "")
                    }
                }
                await websocket.send_text(json.dumps(websocket_message, ensure_ascii=False))
            except Exception as e:
                print(f"[WebSocket] Error sending log entry: {e}")
                continue
        
        # Send current status
        await websocket.send_text(json.dumps({
            "type": "status",
            "data": {
                "status": jobs[job_id]["status"],
                "current_step": jobs[job_id].get("current_step"),
                "progress": jobs[job_id].get("progress"),
                "current_items": jobs[job_id].get("current_items"),
                "total_items": jobs[job_id].get("total_items"),
                "processing_speed": jobs[job_id].get("processing_speed"),
                "elapsed_time": jobs[job_id].get("elapsed_time"),
                "estimated_time_remaining": jobs[job_id].get("estimated_time_remaining")
            }
        }, ensure_ascii=False))
        
        # Keep connection alive and poll for new logs
        last_log_count = len(jobs[job_id]["logs"])
        last_status = jobs[job_id]["status"]
        ping_counter = 0
        
        while True:
            try:
                # Check if job still exists
                if job_id not in jobs:
                    print(f"[WebSocket] Job {job_id} was deleted, closing connection")
                    break
                
                # Check for new logs (only send new ones)
                current_logs = jobs[job_id]["logs"]
                if len(current_logs) > last_log_count:
                    # Send new logs
                    for log_entry in current_logs[last_log_count:]:
                        try:
                            # Ensure we're sending clean JSON without double-encoding
                            websocket_message = {
                                "type": "log",
                                "data": {
                                    "timestamp": log_entry.get("timestamp", ""),
                                    "message": log_entry.get("message", "")
                                }
                            }
                            await websocket.send_text(json.dumps(websocket_message, ensure_ascii=False))
                        except Exception as e:
                            print(f"[WebSocket] Error sending new log entry: {e}")
                            continue
                    last_log_count = len(current_logs)
                
                # Check for status updates (only send when changed)
                current_status = jobs[job_id]["status"]
                current_progress = jobs[job_id].get("progress")
                current_step = jobs[job_id].get("current_step")
                
                if (current_status != last_status or 
                    current_progress != jobs[job_id].get("last_sent_progress") or
                    current_step != jobs[job_id].get("last_sent_step")):
                    
                    await websocket.send_text(json.dumps({
                        "type": "status",
                        "data": {
                            "status": current_status,
                            "current_step": current_step,
                            "progress": current_progress,
                            "current_items": jobs[job_id].get("current_items"),
                            "total_items": jobs[job_id].get("total_items"),
                            "processing_speed": jobs[job_id].get("processing_speed"),
                            "elapsed_time": jobs[job_id].get("elapsed_time"),
                            "estimated_time_remaining": jobs[job_id].get("estimated_time_remaining")
                        }
                    }, ensure_ascii=False))
                    
                    last_status = current_status
                    jobs[job_id]["last_sent_progress"] = current_progress
                    jobs[job_id]["last_sent_step"] = current_step
                
                # Send periodic ping to keep connection alive
                ping_counter += 1
                if ping_counter % 12 == 0:  # Every 60 seconds (5s * 12)
                    await websocket.send_text(json.dumps({
                        "type": "ping",
                        "data": {"timestamp": datetime.now().isoformat()}
                    }, ensure_ascii=False))
                
                # Wait for any message (ping/pong) with timeout
                try:
                    message = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
                    if message == "pong":
                        print(f"[WebSocket] Received pong from client for job {job_id}")
                except asyncio.TimeoutError:
                    # Continue polling - this is normal
                    pass
                except Exception as e:
                    print(f"[WebSocket] Error receiving message for job {job_id}: {e}")
                    break
                    
                # If job is completed or failed, send final status and break
                if current_status in ["completed", "failed"]:
                    await websocket.send_text(json.dumps({
                        "type": "info",
                        "data": {"message": f"Job {job_id} {current_status}"}
                    }, ensure_ascii=False))
                    print(f"[WebSocket] Job {job_id} finished with status: {current_status}")
                    # Wait a bit before closing to ensure message is received
                    await asyncio.sleep(2)
                    break
                    
            except Exception as e:
                print(f"[WebSocket] Error in main loop for job {job_id}: {e}")
                break
                
    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected for job {job_id}")
    except Exception as e:
        print(f"[WebSocket] Unexpected error for job {job_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "data": {"message": f"WebSocket error: {str(e)}"}
            }, ensure_ascii=False))
        except:
            print(f"[WebSocket] Failed to send error message for job {job_id}")
    finally:
        # Cleanup
        print(f"[WebSocket] Cleaning up connection for job {job_id}")
        if job_id in active_websockets:
            del active_websockets[job_id]
        try:
            await websocket.close()
        except:
            pass

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a posts file"""
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Only .txt files are allowed")
    
    # Save uploaded file
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    return {
        "filename": file.filename,
        "path": file_path,
        "size": len(content)
    }

@app.get("/api/files")
async def list_files():
    """List available posts files"""
    files = []
    
    # Check dataset directory
    dataset_dir = "dataset"
    if os.path.exists(dataset_dir):
        for file in os.listdir(dataset_dir):
            if file.endswith('.txt'):
                file_path = os.path.join(dataset_dir, file)
                stat = os.stat(file_path)
                files.append({
                    "name": file,
                    "path": file_path,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
    
    # Check uploads directory
    uploads_dir = "uploads"
    if os.path.exists(uploads_dir):
        for file in os.listdir(uploads_dir):
            if file.endswith('.txt'):
                file_path = os.path.join(uploads_dir, file)
                stat = os.stat(file_path)
                files.append({
                    "name": file,
                    "path": file_path,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
    
    return {"files": files}

@app.websocket("/api/test")
async def websocket_test(websocket: WebSocket):
    """Simple WebSocket test endpoint"""
    print("[WebSocket Test] New test connection attempt")
    try:
        await websocket.accept()
        print("[WebSocket Test] Connection accepted")
        await websocket.send_text("WebSocket connection successful!")
        
        # Keep connection alive for a short test
        for i in range(3):
            await asyncio.sleep(1)
            await websocket.send_text(f"Test message {i+1}")
        
        await websocket.send_text("Test complete")
        await websocket.close()
        print("[WebSocket Test] Test completed successfully")
    except Exception as e:
        print(f"[WebSocket Test] Error: {e}")
        import traceback
        traceback.print_exc()

@app.get("/")
async def root():
    """Health check endpoint with jobs list"""
    # Get current jobs summary
    jobs_summary = []
    for job_id, job_data in jobs.items():
        jobs_summary.append({
            "job_id": job_id,
            "status": job_data.get("status", "unknown"),
            "current_step": job_data.get("current_step"),
            "progress": job_data.get("progress"),
            "started_at": job_data.get("started_at").isoformat() if job_data.get("started_at") else None,
            "completed_at": job_data.get("completed_at").isoformat() if job_data.get("completed_at") else None
        })
    
    return {
        "message": "Brand Engagement Analysis API",
        "version": "1.0.0",
        "status": "running",
        "jobs": {
            "total": len(jobs),
            "active": len([j for j in jobs.values() if j.get("status") == "running"]),
            "completed": len([j for j in jobs.values() if j.get("status") == "completed"]),
            "failed": len([j for j in jobs.values() if j.get("status") == "failed"]),
            "list": jobs_summary
        },
        "endpoints": {
            "jobs": "/api/jobs",
            "create_job": "/api/jobs (POST)",
            "job_status": "/api/jobs/{job_id}",
            "job_logs": "/api/jobs/{job_id}/logs (WebSocket)",
            "download_results": "/api/jobs/{job_id}/download",
            "job_results": "/api/jobs/{job_id}/results",
            "completed_jobs": "/api/jobs/completed",
            "result_files": "/api/result-files",
            "result_file_data": "/api/result-files/{filename}/results",
            "upload_file": "/api/upload",
            "list_files": "/api/files",
            "health": "/api/health",
            "docs": "/docs"
        }
    }

if __name__ == "__main__":
    import uvicorn
    print("Starting Brand Engagement Analysis API...")
    print("Server will be available at: http://127.0.0.1:8000")
    print("API documentation at: http://127.0.0.1:8000/docs")
    print("WebSocket endpoint: ws://127.0.0.1:8000/api/jobs/{job_id}/logs")
    print("Press Ctrl+C to stop the server")
    print("-" * 50)
    uvicorn.run(
        app, 
        host="127.0.0.1", 
        port=8000,
        ws_ping_interval=20,
        ws_ping_timeout=20,
        ws_max_size=16777216,
        log_level="info"
    )