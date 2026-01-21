import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { TradePanel } from '@/components/TradePanel';
import { TokenStats } from '@/components/TokenStats';
import { SolProgress } from '@/components/AsciiProgress';
import { ActiveLaunch } from '@shared/schema';
import { formatNumber } from '@/lib/solana';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { queryClient } from '@/lib/queryClient';
import { Globe, MessageCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { SiX } from 'react-icons/si';
import { useDexScreener, getDexScreenerUrl, getDexScreenerChartUrl } from '@/hooks/useDexScreener';
import { useRaydiumPool } from '@/hooks/useRaydiumPool';

export default function Trade() {
  const params = useParams<{ id: string }>();

  const { data: launch, isLoading, error } = useQuery<ActiveLaunch>({
    queryKey: ['/api/launches', params.id],
  });

  // Fetch live data from Raydium LaunchLab pool (on-chain)
  const { 
    poolData,
    hasPool,
    isLoading: poolLoading,
    isFetching: poolFetching,
  } = useRaydiumPool(
    launch?.mintAddress, 
    Number(launch?.totalSupply || 1_000_000_000),
    Number(launch?.fundraisingTarget || 85),
    { refetchInterval: 10000 }
  );

  // Fetch supplementary data from DexScreener (USD prices, charts)
  const { 
    priceUsd, 
    priceNative,
    marketCap: dexMarketCap, 
    volume24h, 
    liquidity,
    priceChange24h,
    txns24h,
    dexScreenerUrl,
    hasPair,
    isLoading: dexLoading,
    isFetching: dexFetching,
  } = useDexScreener(launch?.mintAddress, { refetchInterval: 10000 });

  // Use Raydium on-chain data as primary, DexScreener as supplementary
  const currentPrice = poolData?.currentPrice ?? launch?.currentPrice ?? 0;
  const currentRaised = poolData?.totalRaised ?? launch?.currentRaised ?? 0;
  const progress = poolData?.progress ?? launch?.progress ?? 0;
  const poolStatus = poolData?.status ?? 'trading';
  
  // Market cap: prefer DexScreener USD value, fallback to Raydium with SOL price conversion
  const marketCapUsd = dexMarketCap ?? (hasPool && poolData?.marketCapUsd ? poolData.marketCapUsd : null);
  const marketCapSol = hasPool ? poolData?.marketCapSol : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="text-primary text-2xl mb-2 cursor-blink">_</div>
          <div className="text-muted-foreground text-sm">Loading token data...</div>
        </div>
      </div>
    );
  }

  if (error || !launch) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="text-destructive text-xl mb-4">[ERROR 404]</div>
          <div className="text-muted-foreground text-sm mb-4">Token not found</div>
          <Link href="/">
            <Button variant="outline" className="font-mono text-xs">
              {'<'} BACK TO LAUNCHES
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="font-mono text-xs" data-testid="button-back">
              {'<'} BACK TO LAUNCHES
            </Button>
          </Link>
        </div>

        <div className="border border-border p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {launch.imageUrl ? (
                <img 
                  src={launch.imageUrl} 
                  alt={launch.name}
                  className="w-16 h-16 rounded object-cover border border-primary"
                  data-testid="img-token-profile"
                />
              ) : (
                <div 
                  className="w-16 h-16 border border-primary flex items-center justify-center text-2xl font-bold text-primary terminal-glow"
                  data-testid="text-token-fallback"
                >
                  {launch.symbol.slice(0, 2)}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground">{launch.name}</h1>
                  <Badge 
                    variant={launch.status === 'active' ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {launch.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">${launch.symbol}</div>
                {launch.description && (
                  <div className="text-xs text-muted-foreground mt-1">{launch.description}</div>
                )}
                {(launch.website || launch.twitter || launch.telegram) && (
                  <div className="flex items-center gap-3 mt-2">
                    {launch.website && (
                      <a 
                        href={launch.website.startsWith('http') ? launch.website : `https://${launch.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary transition-colors"
                        data-testid="link-website"
                      >
                        <Globe className="w-4 h-4" />
                      </a>
                    )}
                    {launch.twitter && (
                      <a 
                        href={launch.twitter.startsWith('http') ? launch.twitter : `https://x.com/${launch.twitter.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary transition-colors"
                        data-testid="link-twitter"
                      >
                        <SiX className="w-4 h-4" />
                      </a>
                    )}
                    {launch.telegram && (
                      <a 
                        href={launch.telegram.startsWith('http') ? launch.telegram : `https://t.me/${launch.telegram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary transition-colors"
                        data-testid="link-telegram"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right" data-testid="container-price">
              <div className="text-2xl font-bold text-primary terminal-glow" data-testid="text-price-usd">
                {priceUsd ? `$${priceUsd.toFixed(8)}` : poolLoading ? '...' : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground" data-testid="text-price-sol">
                {currentPrice.toFixed(10)} SOL
              </div>
              {(dexFetching || poolFetching) && (
                <RefreshCw className="w-3 h-3 text-primary animate-spin inline-block ml-1" />
              )}
            </div>
          </div>
          
          <div className="mt-6">
            <div className="hidden sm:block">
              <SolProgress 
                current={currentRaised} 
                target={launch.fundraisingTarget}
                width={40}
              />
            </div>
            <div className="sm:hidden">
              <SolProgress 
                current={currentRaised} 
                target={launch.fundraisingTarget}
                width={20}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>Raised: {currentRaised.toFixed(2)} SOL</span>
              <span>Target: {launch.fundraisingTarget} SOL</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="border border-border p-4 text-center relative">
            {(dexFetching || poolFetching) && (
              <RefreshCw className="w-3 h-3 absolute top-2 right-2 text-primary animate-spin" />
            )}
            <div className="text-lg font-bold text-secondary" data-testid="text-market-cap">
              {marketCapUsd 
                ? `$${formatNumber(marketCapUsd)}` 
                : marketCapSol 
                  ? `${formatNumber(marketCapSol)} SOL` 
                  : poolLoading ? '...' : '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">MARKET CAP</div>
          </div>
          <div className="border border-border p-4 text-center">
            <div className="text-lg font-bold text-foreground" data-testid="text-volume">
              {volume24h ? `$${formatNumber(volume24h)}` : '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">24H VOLUME</div>
          </div>
          <div className="border border-border p-4 text-center">
            <div className={`text-lg font-bold ${priceChange24h && priceChange24h >= 0 ? 'text-primary' : 'text-destructive'}`} data-testid="text-price-change">
              {priceChange24h !== null ? `${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%` : '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">24H CHANGE</div>
          </div>
          <div className="border border-border p-4 text-center">
            <div className="text-lg font-bold text-accent" data-testid="text-liquidity">
              {liquidity ? `$${formatNumber(liquidity)}` : hasPool ? `${currentRaised.toFixed(2)} SOL` : '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">{liquidity ? 'LIQUIDITY' : 'POOL TVL'}</div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
          <div className="border border-border p-4 text-center">
            <div className="text-lg font-bold text-primary">{progress.toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground">BONDING CURVE</div>
          </div>
          <div className="border border-border p-4 text-center">
            <div className="text-lg font-bold text-foreground" data-testid="text-txns">
              {txns24h ? `${txns24h.buys + txns24h.sells}` : '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">24H TRADES</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TradePanel launch={launch} />
          </div>
          <div>
            <TokenStats launch={launch} />
          </div>
        </div>

        <div className="mt-6 border border-border">
          <div className="p-4 border-b border-border bg-card flex items-center justify-between">
            <div className="text-primary font-bold text-sm terminal-glow">
              [LIVE CHART]
            </div>
            <a 
              href={getDexScreenerUrl(launch.mintAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary transition-colors"
              data-testid="link-dexscreener"
            >
              <span>View on DexScreener</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="relative" style={{ height: '400px' }}>
            {hasPair ? (
              <iframe
                src={getDexScreenerChartUrl(launch.mintAddress)}
                className="w-full h-full border-0"
                title="DexScreener Chart"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                data-testid="iframe-dexscreener-chart"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-card/50" data-testid="chart-pending">
                <div className="text-primary text-4xl mb-4 animate-pulse">◉</div>
                <div className="text-muted-foreground text-sm font-mono text-center px-4">
                  {dexLoading ? 'Loading chart...' : 'Token is being indexed by DexScreener'}
                </div>
                <div className="text-muted-foreground text-xs font-mono mt-2 text-center px-4">
                  Chart will appear once trading data is available
                </div>
                <a 
                  href={getDexScreenerUrl(launch.mintAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 text-xs text-primary font-mono"
                  data-testid="link-check-dexscreener"
                >
                  Check DexScreener status →
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 border border-border">
          <div className="p-4 border-b border-border bg-card">
            <div className="text-primary font-bold text-sm terminal-glow">
              [RECENT TRANSACTIONS]
            </div>
          </div>
          <div className="p-4">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-2">TYPE</th>
                  <th className="text-right py-2">AMOUNT</th>
                  <th className="text-right py-2">PRICE</th>
                  <th className="text-right py-2">TIME</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/50">
                  <td className="py-2 text-primary">BUY</td>
                  <td className="py-2 text-right">125,000 {launch.symbol}</td>
                  <td className="py-2 text-right">0.00001234</td>
                  <td className="py-2 text-right text-muted-foreground">2m ago</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td className="py-2 text-destructive">SELL</td>
                  <td className="py-2 text-right">50,000 {launch.symbol}</td>
                  <td className="py-2 text-right">0.00001198</td>
                  <td className="py-2 text-right text-muted-foreground">5m ago</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td className="py-2 text-primary">BUY</td>
                  <td className="py-2 text-right">500,000 {launch.symbol}</td>
                  <td className="py-2 text-right">0.00001150</td>
                  <td className="py-2 text-right text-muted-foreground">12m ago</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
