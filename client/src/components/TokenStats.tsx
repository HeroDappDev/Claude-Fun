import { ActiveLaunch } from '@shared/schema';
import { shortenAddress, formatNumber } from '@/lib/solana';
import { Badge } from '@/components/ui/badge';

interface TokenStatsProps {
  launch: ActiveLaunch;
}

export function TokenStats({ launch }: TokenStatsProps) {
  return (
    <div className="border border-border">
      <div className="p-4 border-b border-border bg-card">
        <div className="text-primary font-bold text-sm terminal-glow">
          [TOKEN INFO]
        </div>
      </div>
      
      <div className="p-4 space-y-3 text-xs font-mono">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <Badge 
            variant={launch.status === 'active' ? 'default' : 'secondary'}
            className="text-[10px]"
          >
            {launch.status.toUpperCase()}
          </Badge>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Curve Type:</span>
          <span className="text-foreground">{launch.curveType.toUpperCase()}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Supply:</span>
          <span className="text-foreground">{formatNumber(parseFloat(launch.totalSupply))}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Holders:</span>
          <span className="text-foreground">{launch.holders}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">24h Volume:</span>
          <span className="text-secondary">${formatNumber(launch.volume24h)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Market Cap:</span>
          <span className="text-primary">${formatNumber(launch.marketCap)}</span>
        </div>
        
        <div className="border-t border-border pt-3 mt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Creator:</span>
            <span className="text-foreground">{shortenAddress(launch.creatorAddress)}</span>
          </div>
          
          <div className="flex justify-between mt-2">
            <span className="text-muted-foreground">Mint:</span>
            <span className="text-foreground">{shortenAddress(launch.mintAddress)}</span>
          </div>
        </div>
        
        <div className="border-t border-border pt-3 mt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created:</span>
            <span className="text-foreground">{launch.age}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
