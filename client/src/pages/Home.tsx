import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TokenTable } from '@/components/TokenTable';
import { ActiveLaunch } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'wouter';

type SortOption = 'age' | 'progress' | 'marketCap' | 'volume';
type FilterOption = 'all' | 'active' | 'graduated';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('age');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const { data: launches = [], isLoading } = useQuery<ActiveLaunch[]>({
    queryKey: ['/api/launches'],
  });

  const { data: stats } = useQuery<{
    activeLaunches: number;
    graduatedLaunches: number;
    totalRaised: number;
  }>({
    queryKey: ['/api/stats'],
  });

  const filteredLaunches = useMemo(() => {
    let result = [...launches];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (l) => l.name.toLowerCase().includes(query) || 
               l.symbol.toLowerCase().includes(query)
      );
    }
    
    if (filterBy !== 'all') {
      result = result.filter((l) => l.status === filterBy);
    }
    
    result.sort((a, b) => {
      switch (sortBy) {
        case 'progress':
          return b.progress - a.progress;
        case 'marketCap':
          return b.marketCap - a.marketCap;
        case 'volume':
          return b.volume24h - a.volume24h;
        case 'age':
        default:
          return 0;
      }
    });
    
    return result;
  }, [launches, searchQuery, sortBy, filterBy]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="text-primary text-2xl mb-2 cursor-blink">_</div>
          <div className="text-muted-foreground text-sm">Loading launches...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-8 text-center">
          {/* ASCII art hidden on mobile for cleaner UX */}
          <pre className="hidden sm:inline-block text-primary text-xs sm:text-sm font-mono terminal-glow">
{`
   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗   ███████╗██╗   ██╗███╗   ██╗
  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝   ██╔════╝██║   ██║████╗  ██║
  ██║     ██║     ███████║██║   ██║██║  ██║█████╗     █████╗  ██║   ██║██╔██╗ ██║
  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝     ██╔══╝  ██║   ██║██║╚██╗██║
  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗██╗██║     ╚██████╔╝██║ ╚████║
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝
`}
          </pre>
          {/* Mobile-friendly title */}
          <h1 className="sm:hidden text-2xl font-bold text-primary terminal-glow">[CLAUDE.FUN]</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Launch tokens with bonding curves on Solana Mainnet
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="border border-border p-4 text-center">
            <div className="text-2xl font-bold text-primary terminal-glow">
              {stats?.activeLaunches ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">ACTIVE LAUNCHES</div>
          </div>
          <div className="border border-border p-4 text-center">
            <div className="text-2xl font-bold text-secondary terminal-glow">
              {stats?.graduatedLaunches ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">GRADUATED</div>
          </div>
          <div className="border border-border p-4 text-center">
            <div className="text-2xl font-bold text-accent terminal-glow">
              {stats?.totalRaised?.toFixed(1) ?? '0'}
            </div>
            <div className="text-xs text-muted-foreground">TOTAL SOL RAISED</div>
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search tokens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="font-mono text-sm bg-background w-full"
                data-testid="input-search"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
                <SelectTrigger className="w-[120px] sm:w-[140px] font-mono text-xs sm:text-sm" data-testid="select-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  <SelectItem value="active">ACTIVE</SelectItem>
                  <SelectItem value="graduated">GRADUATED</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[120px] sm:w-[140px] font-mono text-xs sm:text-sm" data-testid="select-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="age">NEWEST</SelectItem>
                  <SelectItem value="progress">PROGRESS</SelectItem>
                  <SelectItem value="marketCap">MARKET CAP</SelectItem>
                  <SelectItem value="volume">VOLUME</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Link href="/create" className="sm:hidden">
            <Button className="font-mono w-full" data-testid="button-create-token-mobile">
              [+ CREATE NEW TOKEN]
            </Button>
          </Link>
          
          <div className="hidden sm:block">
            <Link href="/create">
              <Button className="font-mono whitespace-nowrap" data-testid="button-create-token">
                [+ NEW TOKEN]
              </Button>
            </Link>
          </div>
        </div>

        <TokenTable launches={filteredLaunches} />

        <div className="mt-8 text-center text-xs text-muted-foreground space-y-2">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span>Powered by Raydium LaunchLab</span>
            <span className="text-border">|</span>
            <span>Solana Mainnet</span>
            <span className="text-border">|</span>
            <span>100% LP Burn</span>
          </div>
          <div className="text-[10px]">
            Trading involves risk. Never invest more than you can afford to lose.
          </div>
        </div>
      </div>
    </div>
  );
}
