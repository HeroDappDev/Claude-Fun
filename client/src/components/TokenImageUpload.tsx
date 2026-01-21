import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ImagePlus, X, AlertCircle } from 'lucide-react';

interface TokenImageUploadProps {
  onImageChange: (file: File | null, previewUrl: string | null) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function TokenImageUpload({ onImageChange, disabled }: TokenImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateImage = useCallback((file: File): Promise<{ valid: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        resolve({ valid: false, error: 'Please upload a JPEG, PNG, GIF, or WebP image' });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        resolve({ valid: false, error: `File too large. Maximum size is 5MB (yours: ${(file.size / 1024 / 1024).toFixed(1)}MB)` });
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        
        const aspectRatio = img.width / img.height;
        const tolerance = 0.01;
        
        if (Math.abs(aspectRatio - 1) > tolerance) {
          resolve({ 
            valid: false, 
            error: `Image must be square (1:1 aspect ratio). Your image is ${img.width}x${img.height}` 
          });
          return;
        }
        
        resolve({ valid: true });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ valid: false, error: 'Failed to load image' });
      };
      
      img.src = objectUrl;
    });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    
    const validation = await validateImage(file);
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid image');
      onImageChange(null, null);
      return;
    }
    
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    onImageChange(file, objectUrl);
  }, [validateImage, onImageChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemove = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setError(null);
    onImageChange(null, null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [previewUrl, onImageChange]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
        data-testid="input-token-image"
      />
      
      {previewUrl ? (
        <div className="relative w-24 h-24">
          <img
            src={previewUrl}
            alt="Token preview"
            className="w-24 h-24 object-cover border border-border"
            data-testid="img-token-preview"
          />
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="absolute -top-2 -right-2"
            onClick={handleRemove}
            disabled={disabled}
            data-testid="button-remove-image"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            w-24 h-24 border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer
            transition-colors hover-elevate
            ${isDragging ? 'border-primary bg-primary/10' : 'border-border'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          data-testid="dropzone-token-image"
        >
          <ImagePlus className="w-6 h-6 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground text-center">
            1:1 ratio<br />max 5MB
          </span>
        </div>
      )}
      
      {error && (
        <div className="flex items-start gap-1.5 text-destructive text-xs">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
