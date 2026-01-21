import { ActiveLaunch } from '@shared/schema';
import { SolProgress } from './AsciiProgress';
import { shortenAddress, formatNumber } from '@/lib/solana';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { ExternalLink } from 'lucide-react';

interface TokenTableProps {
  launches: ActiveLaunch[];
  onSelect?: (launch: ActiveLaunch) => void;
}

export function TokenTable({ launches, onSelect }: TokenTableProps) {
  if (launches.length === 0) {
    return (
      <div className="border border-border p-8 text-center">
        <div className="text-muted-foreground font-mono text-sm">
          <div>+---------------------------+</div>
          <div>|    NO ACTIVE LAUNCHES     |</div>
          <div>+---------------------------+</div>
          <div className="mt-4 text-xs">
            Be the first to launch a token!
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {launches.map((launch) => (
          <div 
            key={launch.id}
            className="border border-border p-4 hover-elevate cursor-pointer"
            onClick={() => onSelect?.(launch)}
            data-testid={`card-token-${launch.id}`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-foreground font-bold text-sm">{launch.symbol}</span>
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${
                      launch.curveType === 'linear' ? 'text-primary border-primary' :
                      launch.curveType === 'exponential' ? 'text-accent border-accent' :
                      'text-secondary border-secondary'
                    }`}
                  >
                    {launch.curveType.toUpperCase()}
                  </Badge>
                </div>
                <span className="text-muted-foreground text-xs">{launch.name}</span>
              </div>
              <div className="text-right">
                <div className="text-primary text-sm font-bold">{launch.currentPrice.toFixed(6)}</div>
                <div className="text-muted-foreground text-[10px]">SOL</div>
              </div>
            </div>
            
            <div className="mb-3">
              <SolProgress 
                current={launch.currentRaised} 
                target={launch.fundraisingTarget}
                width={20}
              />
            </div>
            
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mb-3">
              <span>MC: ${formatNumber(launch.marketCap)}</span>
              <span>{launch.holders} holders</span>
              <span>{launch.age}</span>
            </div>
            
            <div className="flex gap-2">
              {launch.status === 'graduated' ? (
                <Badge variant="secondary" className="text-[10px] w-full justify-center">
                  GRADUATED
                </Badge>
              ) : (
                <>
                  <Link href={`/trade/${launch.id}`} className="flex-1">
                    <Button 
                      size="sm" 
                      variant="default"
                      className="text-xs w-full"
                      data-testid={`button-buy-mobile-${launch.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      BUY
                    </Button>
                  </Link>
                  <Link href={`/trade/${launch.id}`} className="flex-1">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="text-xs w-full"
                      data-testid={`button-sell-mobile-${launch.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      SELL
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono" data-testid="table-tokens">
            <thead className="bg-card border-b border-border">
              <tr>
                <th className="text-left p-3 text-muted-foreground">TOKEN</th>
                <th className="text-left p-3 text-muted-foreground">CURVE</th>
                <th className="text-left p-3 text-muted-foreground">PROGRESS</th>
                <th className="text-right p-3 text-muted-foreground">PRICE</th>
                <th className="text-right p-3 text-muted-foreground">MC</th>
                <th className="text-right p-3 text-muted-foreground">HOLDERS</th>
                <th className="text-right p-3 text-muted-foreground">AGE</th>
                <th className="text-center p-3 text-muted-foreground">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {launches.map((launch) => (
                <tr 
                  key={launch.id} 
                  className="border-b border-border/50 hover-elevate cursor-pointer"
                  onClick={() => onSelect?.(launch)}
                  data-testid={`row-token-${launch.id}`}
                >
                  <td className="p-3">
                    <div className="flex flex-col">
                      <span className="text-foreground font-bold">{launch.symbol}</span>
                      <span className="text-muted-foreground text-[10px]">{launch.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] ${
                        launch.curveType === 'linear' ? 'text-primary border-primary' :
                        launch.curveType === 'exponential' ? 'text-accent border-accent' :
                        'text-secondary border-secondary'
                      }`}
                    >
                      {launch.curveType.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <SolProgress 
                      current={launch.currentRaised} 
                      target={launch.fundraisingTarget}
                      width={12}
                    />
                  </td>
                  <td className="p-3 text-right text-primary">
                    {launch.currentPrice.toFixed(8)}
                  </td>
                  <td className="p-3 text-right text-secondary">
                    ${formatNumber(launch.marketCap)}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">
                    {launch.holders}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">
                    {launch.age}
                  </td>
                  <td className="p-3 text-center">
                    {launch.status === 'graduated' ? (
                      <Badge variant="secondary" className="text-[10px]">
                        GRADUATED
                      </Badge>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <Link href={`/trade/${launch.id}`}>
                          <Button 
                            size="sm" 
                            variant="default"
                            className="text-[10px] h-6 px-2"
                            data-testid={`button-buy-${launch.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            BUY
                          </Button>
                        </Link>
                        <Link href={`/trade/${launch.id}`}>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-[10px] h-6 px-2"
                            data-testid={`button-sell-${launch.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            SELL
                          </Button>
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
