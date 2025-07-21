'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, AlertCircle } from 'lucide-react';

interface JobFormProps {
  onJobCreated: (job: any) => void;
  disabled: boolean;
}

export default function JobForm({ onJobCreated, disabled }: JobFormProps) {
  const [formData, setFormData] = useState({
    brand_values: '',
    content_weight: 0.93,
    posts_file: '',
    output_filename: '',
    use_cache: true,
    use_checkpoint: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableFiles, setAvailableFiles] = useState<Array<{name: string, path: string, size: number, modified: string}>>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);

  // Fetch available files from the backend API
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setIsLoadingFiles(true);
        const response = await fetch('http://127.0.0.1:8000/api/files');
        if (response.ok) {
          const data = await response.json();
          setAvailableFiles(data.files || []);
        } else {
          // No fallback - if backend is down, show no files
          setAvailableFiles([]);
        }
      } catch (error) {
        // Silently handle fetch errors - backend connection status is shown elsewhere
        // No fallback - if backend is down, show no files
        setAvailableFiles([]);
      } finally {
        setIsLoadingFiles(false);
      }
    };

    fetchFiles();
  }, []);

  // Form validation function
  const isFormValid = () => {
    return (
      formData.brand_values.trim() !== '' &&
      formData.posts_file.trim() !== '' &&
      formData.output_filename.trim() !== '' &&
      formData.content_weight >= 0 &&
      formData.content_weight <= 1
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (disabled) {
      setError('Backend is not connected. Please check if the FastAPI server is running.');
      return;
    }

    if (!isFormValid()) {
      setError('Please fill in all required fields and ensure content weight is between 0 and 1.');
      return;
    }

    console.log('JobForm: Starting job submission with data:', formData);
    setIsSubmitting(true);
    setError(null);

    try {
      console.log('JobForm: Sending POST request to create job...');
      const response = await fetch('http://127.0.0.1:8000/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      console.log('JobForm: Job creation response status:', response.status);
      console.log('JobForm: Job creation response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('JobForm: Job creation failed:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const job = await response.json();
      console.log('JobForm: Job created successfully:', job);
      
      onJobCreated(job);
    } catch (error) {
      // Only log errors if they're not network/fetch failures (backend connection status is shown elsewhere)
      if (error instanceof Error && !error.message.includes('Failed to fetch')) {
        console.error('JobForm: Error creating job:', error);
      }
      setError(error instanceof Error ? error.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    
    let processedValue: any = value;
    
    if (name === 'content_weight') {
      // Ensure content_weight is always a number
      processedValue = parseFloat(value) || 0;
    } else if (type === 'number') {
      processedValue = parseFloat(value) || 0;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 mt-4">
      {/* Brand Values */}
      <div className="space-y-2">
        <Label htmlFor="brand_values">Brand Values *</Label>
        <Textarea
          id="brand_values"
          name="brand_values"
          value={formData.brand_values}
          onChange={(e) => setFormData(prev => ({ ...prev, brand_values: e.target.value }))}
          rows={3}
          placeholder="makeup skincare cosmetics glow haircare routine lipstick foundation eyeshadow moisturizer serum lashes blush manicure"
          required
        />
        <p className="text-sm text-muted-foreground">
          Describe the brand values you want to identify
        </p>
      </div>

      {/* Content Weight */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="content_weight">Content Weight *</Label>
        </div>
        <div className="space-y-2">
          {/* Direct input field for precise values */}
          <Input
            type="number"
            id="content_weight_input"
            name="content_weight"
            min="0"
            max="1"
            step="0.01"
            value={formData.content_weight}
            onChange={handleInputChange}
            placeholder="0.93"
            className="w-full"
          />
          {/* Slider without colors */}
          <input
            type="range"
            id="content_weight"
            name="content_weight"
            min="0"
            max="1"
            step="0.01"
            value={formData.content_weight}
            onChange={handleInputChange}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer slider-no-color"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.00 (To search viral posts)</span>
            <span>1.00 (To search relevant posts)</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Controls the balance between content similarity and engagement metrics. Use precise values like <span className='font-bold text-black'>0.93</span> for fine-tuning.
        </p>
      </div>

      {/* Posts File */}
      <div className="space-y-2">
        <Label htmlFor="posts_file">Posts Data File *</Label>
        <div className="space-y-2">
          <Select
            id="posts_file"
            name="posts_file"
            value={formData.posts_file}
            onChange={(e) => {
              setFormData(prev => ({ ...prev, posts_file: e.target.value }));
            }}
            required
            disabled={isLoadingFiles || availableFiles.length === 0}
          >
            <option value="">
              {isLoadingFiles 
                ? 'Loading files...' 
                : availableFiles.length > 0 
                  ? 'Select a file...' 
                  : 'No files available'
              }
            </option>
            {!isLoadingFiles && availableFiles.map((file) => (
              <option key={file.path} value={file.path}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </option>
            ))}
          </Select>
          {isLoadingFiles && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Fetching available files from backend...
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {isLoadingFiles 
            ? 'Loading available files from backend...' 
            : availableFiles.length > 0
              ? `Found ${availableFiles.length} file(s). Select from available files.`
              : 'No files available - backend may be disconnected. Please start the backend server.'
          }
        </p>
      </div>

      {/* Output Filename */}
      <div className="space-y-2">
        <Label htmlFor="output_filename">Output CSV Filename *</Label>
        <Input
          id="output_filename"
          name="output_filename"
          value={formData.output_filename}
          onChange={handleInputChange}
          placeholder="brand_match_results.csv"
          required
        />
      </div>

      {/* Use Cache */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="use_cache"
          name="use_cache"
          checked={formData.use_cache}
          onChange={(e) => setFormData(prev => ({ ...prev, use_cache: e.target.checked }))}
          className="h-4 w-4 text-primary focus:ring-primary border-input rounded"
        />
        <Label htmlFor="use_cache" className="text-sm font-normal">
          Use cached model results <span className='font-bold text-black'>(faster processing)</span>
        </Label>
      </div>

      {/* Use Checkpoint */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="use_checkpoint"
          name="use_checkpoint"
          checked={formData.use_checkpoint}
          onChange={(e) => setFormData(prev => ({ ...prev, use_checkpoint: e.target.checked }))}
          className="h-4 w-4 text-primary focus:ring-primary border-input rounded"
        />
        <Label htmlFor="use_checkpoint" className="text-sm font-normal">
          Enable checkpoint saving <span className='font-bold text-black'>(resume interrupted jobs)</span>
        </Label>
      </div>

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isSubmitting || disabled || !isFormValid()}
        className="w-full"
        size="lg"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting Identification...
          </>
        ) : (
          'Start Identification'
        )}
      </Button>

      {/* Backend Disconnected Warning */}
      {/* {disabled && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Backend Disconnected - Please make sure the FastAPI backend is running on http://127.0.0.1:8000
          </AlertDescription>
        </Alert>
      )} */}
    </form>
  );
}