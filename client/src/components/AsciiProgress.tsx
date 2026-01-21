interface AsciiProgressProps {
  progress: number;
  width?: number;
  showPercentage?: boolean;
  label?: string;
}

export function AsciiProgress({ 
  progress, 
  width = 20, 
  showPercentage = true,
  label 
}: AsciiProgressProps) {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  
  const bar = '='.repeat(filled) + ' '.repeat(empty);
  const percentage = Math.min(100, Math.max(0, progress)).toFixed(0);
  
  return (
    <div className="font-mono text-xs">
      {label && <div className="text-muted-foreground mb-1">{label}</div>}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">[</span>
        <span className={progress >= 85 ? 'text-accent' : 'text-primary'}>
          {bar}
        </span>
        <span className="text-muted-foreground">]</span>
        {showPercentage && (
          <span className={progress >= 85 ? 'text-accent' : 'text-primary'}>
            {percentage}%
          </span>
        )}
      </div>
    </div>
  );
}

interface SolProgressProps {
  current: number;
  target: number;
  width?: number;
}

export function SolProgress({ current, target, width = 20 }: SolProgressProps) {
  const progress = (current / target) * 100;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  
  const bar = '='.repeat(Math.min(filled, width)) + ' '.repeat(Math.max(0, empty));
  
  return (
    <div className="font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">[</span>
        <span className={progress >= 100 ? 'text-accent' : 'text-primary'}>
          {bar}
        </span>
        <span className="text-muted-foreground">]</span>
        <span className={progress >= 100 ? 'text-accent' : 'text-secondary'}>
          {current.toFixed(1)}/{target} SOL
        </span>
      </div>
    </div>
  );
}
