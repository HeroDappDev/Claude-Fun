import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ActiveLaunch } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWallet } from '@solana/wallet-adapter-react';
import { useToast } from '@/hooks/use-toast';
import { formatNumber, shortenAddress, PLATFORM_FEE_RATE } from '@/lib/solana';
import { SolProgress } from './AsciiProgress';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { AlertTriangle, ExternalLink, Info, Zap } from 'lucide-react';
import { useRaydium } from '@/hooks/useRaydium';

interface TradePanelProps {
  launch: ActiveLaunch;
}

type TradeStatus = 'idle' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error';

interface BuyQuote {
  amountIn: number;
  amountOut: number;
  fee: number;
  priceImpact: number;
  currentPrice: number;
  newPrice: number;
  willGraduate: boolean;
}

interface SellQuote {
  amountIn: number;
  amountOut: number;
  fee: number;
  priceImpact: number;
  currentPrice: number;
  newPrice: number;
}

export function TradePanel({ launch }: TradePanelProps) {
  const { connected, publicKey } = useWallet();
  const { toast } = useToast();
  const { buyToken, sellToken, checkPoolExists, canTradeOnChain, sdkReady, isLoading: sdkLoading, errorMessage: sdkError, walletCapable } = useRaydium();
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [buyQuote, setBuyQuote] = useState<BuyQuote | null>(null);
  const [sellQuote, setSellQuote] = useState<SellQuote | null>(null);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>('idle');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isLaunchLabPool, setIsLaunchLabPool] = useState(false);

  useEffect(() => {
    if (launch.mintAddress && connected && sdkReady) {
      checkPoolExists(launch.mintAddress).then(setIsLaunchLabPool);
    } else {
      setIsLaunchLabPool(false);
    }
  }, [launch.mintAddress, connected, checkPoolExists, sdkReady]);

  const buyMutation = useMutation({
    mutationFn: async (solAmount: number) => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      if (!launch.mintAddress) {
        throw new Error('Token mint address not available');
      }

      setTradeStatus('preparing');
      
      if (isLaunchLabPool && canTradeOnChain) {
        setTradeStatus('signing');
        
        try {
          const result = await buyToken(launch.mintAddress, solAmount, 100);
          
          await apiRequest('POST', `/api/launches/${launch.id}/buy`, {
            solAmount,
            walletAddress: publicKey.toBase58(),
            signature: result.signature,
            onChain: true,
          });
          
          setTradeStatus('success');
          return { signature: result.signature, onChain: true, amountOut: result.amountOut };
        } catch (e) {
          console.error('On-chain buy failed:', e);
          throw e;
        }
      } else {
        const result = await apiRequest('POST', `/api/launches/${launch.id}/buy`, {
          solAmount,
          walletAddress: publicKey.toBase58(),
        });

        setTradeStatus('success');
        return result;
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/launches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/launches', launch.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      const isOnChain = data?.onChain || data?.signature;
      toast({
        title: isOnChain ? 'On-chain trade confirmed!' : 'Trade recorded!',
        description: data.graduated 
          ? `${launch.symbol} has graduated to Raydium!` 
          : `Bought ${formatNumber(data?.amountOut || buyQuote?.amountOut || 0)} ${launch.symbol}`,
      });
      setBuyAmount('');
      setTradeStatus('idle');
    },
    onError: (error) => {
      setTradeStatus('error');
      toast({
        title: 'Trade failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setTimeout(() => setTradeStatus('idle'), 2000);
    },
  });

  const sellMutation = useMutation({
    mutationFn: async (tokenAmount: number) => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      if (!launch.mintAddress) {
        throw new Error('Token mint address not available');
      }

      setTradeStatus('preparing');
      
      if (isLaunchLabPool && canTradeOnChain) {
        setTradeStatus('signing');
        
        try {
          const result = await sellToken(launch.mintAddress, tokenAmount, 100);
          
          await apiRequest('POST', `/api/launches/${launch.id}/sell`, {
            tokenAmount,
            walletAddress: publicKey.toBase58(),
            solReceived: sellQuote?.amountOut || 0,
            signature: result.signature,
            onChain: true,
          });
          
          setTradeStatus('success');
          return { signature: result.signature, onChain: true };
        } catch (e) {
          console.error('On-chain sell failed:', e);
          throw e;
        }
      } else {
        const result = await apiRequest('POST', `/api/launches/${launch.id}/sell`, {
          tokenAmount,
          walletAddress: publicKey.toBase58(),
          solReceived: sellQuote?.amountOut || 0,
        });

        setTradeStatus('success');
        return result;
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/launches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/launches', launch.id] });
      
      const isOnChain = data?.onChain || data?.signature;
      toast({
        title: isOnChain ? 'On-chain trade confirmed!' : 'Trade recorded!',
        description: `Sold for ${sellQuote?.amountOut?.toFixed(4) || '0'} SOL`,
      });
      setSellAmount('');
      setTradeStatus('idle');
    },
    onError: (error) => {
      setTradeStatus('error');
      toast({
        title: 'Trade failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setTimeout(() => setTradeStatus('idle'), 2000);
    },
  });

  const fetchBuyQuote = useCallback(async (solAmount: number) => {
    if (solAmount <= 0) {
      setBuyQuote(null);
      return;
    }
    
    setIsLoadingQuote(true);
    try {
      const response = await fetch(`/api/launches/${launch.id}/quote/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solAmount }),
      });
      
      if (response.ok) {
        const quote = await response.json();
        setBuyQuote(quote);
      } else {
        const error = await response.json();
        console.error('Quote error:', error);
        setBuyQuote(null);
        toast({
          title: 'Quote unavailable',
          description: error.error || 'Could not get buy quote',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to fetch buy quote:', error);
      setBuyQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [launch.id, toast]);

  const fetchSellQuote = useCallback(async (tokenAmount: number) => {
    if (tokenAmount <= 0) {
      setSellQuote(null);
      return;
    }
    
    setIsLoadingQuote(true);
    try {
      const response = await fetch(`/api/launches/${launch.id}/quote/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenAmount }),
      });
      
      if (response.ok) {
        const quote = await response.json();
        setSellQuote(quote);
      } else {
        const error = await response.json();
        console.error('Quote error:', error);
        setSellQuote(null);
        toast({
          title: 'Quote unavailable',
          description: error.error || 'Could not get sell quote',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to fetch sell quote:', error);
      setSellQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [launch.id, toast]);

  useEffect(() => {
    const solAmount = parseFloat(buyAmount);
    if (isNaN(solAmount) || solAmount <= 0) {
      setBuyQuote(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      fetchBuyQuote(solAmount);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [buyAmount, fetchBuyQuote]);

  useEffect(() => {
    const tokenAmount = parseFloat(sellAmount);
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      setSellQuote(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      fetchSellQuote(tokenAmount);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [sellAmount, fetchSellQuote]);

  const handleBuy = async () => {
    if (!connected) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your Phantom wallet to trade.',
        variant: 'destructive',
      });
      return;
    }

    const solAmount = parseFloat(buyAmount);
    if (isNaN(solAmount) || solAmount <= 0) return;
    
    buyMutation.mutate(solAmount);
  };

  const handleSell = async () => {
    if (!connected) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your Phantom wallet to trade.',
        variant: 'destructive',
      });
      return;
    }

    const tokenAmount = parseFloat(sellAmount);
    if (isNaN(tokenAmount) || tokenAmount <= 0) return;
    
    sellMutation.mutate(tokenAmount);
  };

  const isTrading = tradeStatus !== 'idle' && tradeStatus !== 'error';
  const isGraduated = launch.status === 'graduated';

  return (
    <div className="border border-border">
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div>
            <div className="text-lg font-bold text-foreground">{launch.symbol}</div>
            <div className="text-xs text-muted-foreground">{launch.name}</div>
          </div>
          <div className="text-right">
            <div className="text-primary font-mono text-sm">
              {launch.currentPrice.toFixed(8)} SOL
            </div>
            <div className="text-xs text-muted-foreground">
              MC: ${formatNumber(launch.marketCap)}
            </div>
          </div>
        </div>

        <div className="mb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Mint:</span>
            <a 
              href={`https://solscan.io/token/${launch.mintAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
              data-testid="link-mint-address"
            >
              {shortenAddress(launch.mintAddress)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        
        <SolProgress 
          current={launch.currentRaised} 
          target={launch.fundraisingTarget}
          width={28}
        />
        
        <div className="mt-2 text-xs text-muted-foreground">
          {isGraduated ? (
            <span className="text-accent font-bold">Token graduated to Raydium!</span>
          ) : (
            <span>{(launch.fundraisingTarget - launch.currentRaised).toFixed(1)} SOL until graduation</span>
          )}
        </div>

        {launch.txSignature && (
          <div className="mt-2">
            <a 
              href={`https://solscan.io/tx/${launch.txSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
              data-testid="link-tx-signature"
            >
              View creation TX
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      <Tabs defaultValue="buy" className="w-full">
        <div className={`px-3 py-1.5 border-b text-[10px] flex items-center gap-1.5 ${
          isLaunchLabPool && canTradeOnChain
            ? 'bg-primary/10 border-primary/30 text-primary' 
            : sdkError
              ? 'bg-destructive/10 border-destructive/30 text-destructive'
              : sdkLoading 
                ? 'bg-muted/50 border-muted text-muted-foreground'
                : 'bg-accent/10 border-accent/30 text-accent'
        }`}>
          {sdkError ? (
            <>
              <AlertTriangle className="w-3 h-3" />
              <span>SDK error: {sdkError.slice(0, 50)}{sdkError.length > 50 ? '...' : ''}</span>
            </>
          ) : sdkLoading ? (
            <>
              <Info className="w-3 h-3 animate-pulse" />
              <span>Initializing trading SDK...</span>
            </>
          ) : isLaunchLabPool && canTradeOnChain ? (
            <>
              <Zap className="w-3 h-3" />
              <span>On-chain trading via Raydium LaunchLab</span>
            </>
          ) : (
            <>
              <Info className="w-3 h-3" />
              <span>Bonding curve simulation - create via LaunchLab for on-chain trading</span>
            </>
          )}
        </div>
        <TabsList className="w-full rounded-none border-b border-border bg-card">
          <TabsTrigger 
            value="buy" 
            className="flex-1 rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-mono text-sm"
            data-testid="tab-buy"
          >
            BUY
          </TabsTrigger>
          <TabsTrigger 
            value="sell"
            className="flex-1 rounded-none data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground font-mono text-sm"
            data-testid="tab-sell"
          >
            SELL
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="p-4 space-y-4 mt-0">
          {isGraduated && (
            <div className="flex items-center gap-2 p-2 bg-accent/10 border border-accent text-accent text-xs">
              <AlertTriangle className="w-4 h-4" />
              <span>Token has graduated. Trade on Raydium.</span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">AMOUNT (SOL)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              className="font-mono bg-background"
              disabled={isTrading || isGraduated}
              data-testid="input-buy-amount"
            />
          </div>

          <div className="flex gap-2">
            {[0.1, 0.5, 1, 5].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                className="flex-1 text-xs font-mono"
                onClick={() => setBuyAmount(amount.toString())}
                disabled={isTrading || isGraduated}
                data-testid={`button-quick-buy-${amount}`}
              >
                {amount}
              </Button>
            ))}
          </div>

          {buyQuote && (
            <div className="space-y-2 pt-2 border-t border-border text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You receive:</span>
                <span className="text-primary font-mono">
                  {formatNumber(buyQuote.amountOut)} {launch.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current price:</span>
                <span className="font-mono">{buyQuote.currentPrice.toFixed(10)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price impact:</span>
                <span className={buyQuote.priceImpact > 5 ? 'text-destructive' : 'text-muted-foreground'}>
                  {buyQuote.priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform fee ({(PLATFORM_FEE_RATE * 100).toFixed(2)}%):</span>
                <span className="font-mono">{buyQuote.fee.toFixed(6)} SOL</span>
              </div>
              {buyQuote.willGraduate && (
                <div className="flex items-center gap-1 text-accent">
                  <Info className="w-3 h-3" />
                  <span>This trade will graduate the token!</span>
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full font-mono"
            onClick={handleBuy}
            disabled={!buyAmount || isTrading || isGraduated || !connected || isLoadingQuote}
            data-testid="button-confirm-buy"
          >
            {isTrading ? (
              <span className="flex items-center gap-2">
                <span className="cursor-blink">_</span> PROCESSING...
              </span>
            ) : isLoadingQuote ? (
              <span className="flex items-center gap-2">
                <span className="cursor-blink">_</span> GETTING QUOTE...
              </span>
            ) : (
              '[BUY ' + launch.symbol + ']'
            )}
          </Button>
        </TabsContent>

        <TabsContent value="sell" className="p-4 space-y-4 mt-0">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">AMOUNT ({launch.symbol})</Label>
            <Input
              type="number"
              step="1000"
              placeholder="0"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              className="font-mono bg-background"
              disabled={isTrading}
              data-testid="input-sell-amount"
            />
          </div>

          <div className="flex gap-2">
            {['25%', '50%', '75%', 'MAX'].map((pct) => (
              <Button
                key={pct}
                variant="outline"
                size="sm"
                className="flex-1 text-xs font-mono"
                onClick={() => setSellAmount('1000000')}
                disabled={isTrading}
                data-testid={`button-quick-sell-${pct}`}
              >
                {pct}
              </Button>
            ))}
          </div>

          {sellQuote && (
            <div className="space-y-2 pt-2 border-t border-border text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You receive:</span>
                <span className="text-primary font-mono">
                  {sellQuote.amountOut.toFixed(4)} SOL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current price:</span>
                <span className="font-mono">{sellQuote.currentPrice.toFixed(10)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price impact:</span>
                <span className={sellQuote.priceImpact > 5 ? 'text-destructive' : 'text-muted-foreground'}>
                  {sellQuote.priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform fee ({(PLATFORM_FEE_RATE * 100).toFixed(2)}%):</span>
                <span className="font-mono">{sellQuote.fee.toFixed(6)} SOL</span>
              </div>
            </div>
          )}

          <Button
            variant="destructive"
            className="w-full font-mono"
            onClick={handleSell}
            disabled={!sellAmount || isTrading || !connected || isLoadingQuote}
            data-testid="button-confirm-sell"
          >
            {isTrading ? (
              <span className="flex items-center gap-2">
                <span className="cursor-blink">_</span> PROCESSING...
              </span>
            ) : isLoadingQuote ? (
              <span className="flex items-center gap-2">
                <span className="cursor-blink">_</span> GETTING QUOTE...
              </span>
            ) : (
              '[SELL ' + launch.symbol + ']'
            )}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
