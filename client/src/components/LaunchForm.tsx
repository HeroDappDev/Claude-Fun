import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { launchFormSchema, LaunchFormData, calculatePrice, CurveType } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWallet } from '@solana/wallet-adapter-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useRaydium } from '@/hooks/useRaydium';
import { TokenImageUpload } from './TokenImageUpload';
import { formatNumber, PLATFORM_FEE_RATE, DEFAULT_INITIAL_PRICE, DEFAULT_CURVE_SLOPE } from '@/lib/solana';
import { grindVanityAddress, VanityProgress } from '@/lib/vanity';

type LaunchStatus = 'idle' | 'uploading' | 'metadata' | 'grinding' | 'creating' | 'confirming' | 'success' | 'error';

export function LaunchForm() {
  const { connected, publicKey } = useWallet();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<LaunchStatus>('idle');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [wantVanity, setWantVanity] = useState(false);
  const [vanityProgress, setVanityProgress] = useState<VanityProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { createLaunchpadPool, sdkReady, isLoading: sdkLoading, errorMessage: sdkError } = useRaydium();

  // Raydium LaunchLab minimum requirements
  const MIN_SUPPLY = 10_000_000; // 10 million tokens minimum
  const MIN_FUNDRAISING_SOL = 30; // 30 SOL minimum

  const form = useForm<LaunchFormData>({
    resolver: zodResolver(launchFormSchema),
    defaultValues: {
      name: '',
      symbol: '',
      description: '',
      website: '',
      twitter: '',
      telegram: '',
      totalSupply: '1000000000', // 1 billion (well above 10M minimum)
      curveType: 'linear',
      fundraisingTarget: '85', // 85 SOL (above 30 SOL minimum)
      initialPurchase: '0',
    },
  });

  const initialPurchase = form.watch('initialPurchase');
  const curveType = form.watch('curveType');
  const totalSupply = form.watch('totalSupply');

  const tokensReceived = useMemo(() => {
    const solAmount = parseFloat(initialPurchase) || 0;
    if (solAmount <= 0) return 0;
    
    const supply = parseFloat(totalSupply) || 1000000000;
    const slope = DEFAULT_CURVE_SLOPE;
    const initialPrice = DEFAULT_INITIAL_PRICE;
    
    let tokens = 0;
    const netSol = solAmount * (1 - PLATFORM_FEE_RATE);
    
    if (curveType === 'linear') {
      if (slope > 0) {
        const a = slope / 2;
        const b = initialPrice;
        const c = netSol;
        const discriminant = b * b + 4 * a * c;
        tokens = (-b + Math.sqrt(discriminant)) / (2 * a);
      } else {
        tokens = netSol / initialPrice;
      }
    } else if (curveType === 'exponential' || curveType === 'logarithmic') {
      let remainingSol = netSol;
      let currentSupply = 0;
      const step = supply / 1000;
      
      while (remainingSol > 0.0000001 && currentSupply < supply) {
        const price = calculatePrice(currentSupply, curveType as any, slope, initialPrice);
        const tokensThisStep = Math.min(step, (supply - currentSupply));
        const cost = tokensThisStep * price;
        
        if (cost > remainingSol) {
          tokens += remainingSol / price;
          break;
        }
        
        tokens += tokensThisStep;
        remainingSol -= cost;
        currentSupply += tokensThisStep;
      }
    } else {
      tokens = netSol / initialPrice;
    }
    
    return Math.min(tokens, supply);
  }, [initialPurchase, curveType, totalSupply]);

  const handleImageChange = useCallback((file: File | null, previewUrl: string | null) => {
    setImageFile(file);
    setImagePreview(previewUrl);
  }, []);

  const uploadImage = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('image', file);
    
    const response = await fetch('/api/upload/image', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload image');
    }
    
    const result = await response.json();
    return result.imageUrl;
  };

  const createMetadata = async (
    name: string, 
    symbol: string, 
    description: string, 
    imageUrl: string | null,
    website?: string,
    twitter?: string,
    telegram?: string
  ): Promise<{ metadataUri: string; imageUri: string | null }> => {
    const response = await fetch('/api/metadata/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        symbol,
        description,
        imageUrl: imageUrl ? `${window.location.origin}${imageUrl}` : null,
        website: website || null,
        twitter: twitter || null,
        telegram: telegram || null,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create metadata');
    }
    
    const result = await response.json();
    // Return full URL for on-chain metadata and IPFS image URL
    return {
      metadataUri: `${window.location.origin}${result.metadataUri}`,
      imageUri: result.imageUri || null,
    };
  };

  const createLaunchMutation = useMutation({
    mutationFn: async (data: LaunchFormData) => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      if (!sdkReady) {
        throw new Error('Raydium SDK not ready. Please ensure your wallet supports batch signing.');
      }

      let uploadedImageUrl: string | null = null;
      let vanityKeypair: import('@solana/web3.js').Keypair | undefined;
      
      // Step 1: Upload image if provided
      if (imageFile) {
        setStatus('uploading');
        uploadedImageUrl = await uploadImage(imageFile);
      }

      // Step 2: Create metadata JSON with social links for trading platforms
      setStatus('metadata');
      const { metadataUri, imageUri } = await createMetadata(
        data.name,
        data.symbol.toUpperCase(),
        data.description || '',
        uploadedImageUrl,
        data.website || '',
        data.twitter || '',
        data.telegram || ''
      );

      console.log('Metadata URI:', metadataUri);
      console.log('IPFS Image URI:', imageUri);

      // Step 2.5: Grind for vanity address if enabled
      if (wantVanity) {
        setStatus('grinding');
        setVanityProgress(null);
        
        abortControllerRef.current = new AbortController();
        
        try {
          const result = await grindVanityAddress(
            'claude',
            true, // case insensitive
            (progress) => setVanityProgress(progress),
            abortControllerRef.current.signal
          );
          
          vanityKeypair = result.keypair;
          console.log(`Vanity address found: ${result.address} (${result.attempts} attempts, ${result.timeMs}ms)`);
        } catch (err) {
          if ((err as Error).message.includes('cancelled')) {
            throw new Error('Vanity address generation was cancelled');
          }
          throw err;
        }
      }

      // Step 3: Create LaunchLab pool via Raydium SDK
      setStatus('creating');
      
      const initialBuyAmount = parseFloat(data.initialPurchase) || 0;
      
      const result = await createLaunchpadPool({
        name: data.name,
        symbol: data.symbol.toUpperCase(),
        metadataUri,
        totalSupply: parseInt(data.totalSupply),
        fundraisingTarget: parseFloat(data.fundraisingTarget),
        decimals: 6,
        initialPurchase: initialBuyAmount,
        customMintKeypair: vanityKeypair,
      });

      setStatus('confirming');

      // Step 4: Save launch data to our database
      // Use IPFS image URL for permanent storage, not local /uploads/ path
      const launchData = {
        mintAddress: result.mintAddress,
        name: data.name,
        symbol: data.symbol.toUpperCase(),
        description: data.description || null,
        imageUrl: imageUri,
        website: data.website || null,
        twitter: data.twitter || null,
        telegram: data.telegram || null,
        curveType: data.curveType,
        totalSupply: data.totalSupply,
        fundraisingTarget: data.fundraisingTarget,
        currentRaised: initialBuyAmount.toString(),
        creatorAddress: publicKey.toBase58(),
        status: 'active',
        poolId: result.poolId,
        metadataUri,
      };

      await apiRequest('POST', '/api/launches', launchData);

      setStatus('success');
      
      return { ...result, signature: result.signature, mintAddress: result.mintAddress };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/launches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      toast({
        title: 'Token launched on Raydium LaunchLab!',
        description: `${form.getValues('symbol').toUpperCase()} is now live and tradeable.`,
      });
      
      setStatus('idle');
      setLocation('/');
    },
    onError: (error) => {
      setStatus('error');
      toast({
        title: 'Launch failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
      setTimeout(() => setStatus('idle'), 2000);
    },
  });

  const onSubmit = async (data: LaunchFormData) => {
    if (!connected || !publicKey) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your Phantom wallet to launch a token.',
        variant: 'destructive',
      });
      return;
    }

    if (!sdkReady) {
      toast({
        title: 'SDK not ready',
        description: sdkError || 'Please wait for Raydium SDK to initialize.',
        variant: 'destructive',
      });
      return;
    }

    createLaunchMutation.mutate(data);
  };

  const getStatusText = () => {
    switch (status) {
      case 'uploading':
        return 'UPLOADING IMAGE...';
      case 'metadata':
        return 'CREATING METADATA...';
      case 'grinding':
        return 'GRINDING VANITY ADDRESS...';
      case 'creating':
        return 'CREATING LAUNCHLAB POOL...';
      case 'confirming':
        return 'CONFIRMING...';
      case 'success':
        return 'SUCCESS!';
      case 'error':
        return 'FAILED';
      default:
        if (!connected) return '[CONNECT WALLET]';
        if (sdkLoading) return 'LOADING SDK...';
        if (!sdkReady) return '[SDK NOT READY]';
        return '[LAUNCH ON LAUNCHLAB]';
    }
  };

  const isProcessing = status !== 'idle' && status !== 'error';
  const canLaunch = connected && sdkReady && !isProcessing;

  return (
    <div className="border border-border p-6 max-w-xl">
      <div className="mb-6">
        <div className="text-primary font-bold text-lg terminal-glow">
          [CREATE LAUNCHLAB TOKEN]
        </div>
        <div className="text-muted-foreground text-xs mt-1">
          Launch your token with a bonding curve on Raydium LaunchLab
        </div>
        {sdkError && (
          <div className="text-destructive text-xs mt-2">
            SDK Error: {sdkError}
          </div>
        )}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs text-muted-foreground">
              TOKEN NAME
            </Label>
            <Input
              id="name"
              placeholder="Claude Token"
              className="font-mono text-sm bg-background"
              disabled={isProcessing}
              {...form.register('name')}
              data-testid="input-token-name"
            />
            {form.formState.errors.name && (
              <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol" className="text-xs text-muted-foreground">
              SYMBOL
            </Label>
            <Input
              id="symbol"
              placeholder="CLDE"
              className="font-mono text-sm bg-background uppercase"
              disabled={isProcessing}
              {...form.register('symbol')}
              data-testid="input-token-symbol"
            />
            {form.formState.errors.symbol && (
              <p className="text-destructive text-xs">{form.formState.errors.symbol.message}</p>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              TOKEN IMAGE
            </Label>
            <TokenImageUpload 
              onImageChange={handleImageChange}
              disabled={isProcessing}
            />
          </div>

          <div className="flex-1 space-y-2">
            <Label htmlFor="description" className="text-xs text-muted-foreground">
              DESCRIPTION (OPTIONAL)
            </Label>
            <Textarea
              id="description"
              placeholder="Describe your token..."
              className="font-mono text-sm bg-background resize-none h-20"
              disabled={isProcessing}
              {...form.register('description')}
              data-testid="input-token-description"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="website" className="text-xs text-muted-foreground">
              WEBSITE (OPTIONAL)
            </Label>
            <Input
              id="website"
              placeholder="https://example.com"
              className="font-mono text-sm bg-background"
              disabled={isProcessing}
              {...form.register('website')}
              data-testid="input-website"
            />
            {form.formState.errors.website && (
              <p className="text-destructive text-xs">{form.formState.errors.website.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="twitter" className="text-xs text-muted-foreground">
              X / TWITTER (OPTIONAL)
            </Label>
            <Input
              id="twitter"
              placeholder="@username or URL"
              className="font-mono text-sm bg-background"
              disabled={isProcessing}
              {...form.register('twitter')}
              data-testid="input-twitter"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telegram" className="text-xs text-muted-foreground">
              TELEGRAM (OPTIONAL)
            </Label>
            <Input
              id="telegram"
              placeholder="@group or URL"
              className="font-mono text-sm bg-background"
              disabled={isProcessing}
              {...form.register('telegram')}
              data-testid="input-telegram"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="totalSupply" className="text-xs text-muted-foreground">
              TOTAL SUPPLY <span className="text-primary/60">(min 10M)</span>
            </Label>
            <Input
              id="totalSupply"
              placeholder="1000000000"
              className="font-mono text-sm bg-background"
              disabled={isProcessing}
              {...form.register('totalSupply')}
              data-testid="input-total-supply"
            />
            {parseInt(totalSupply) < MIN_SUPPLY && parseInt(totalSupply) > 0 && (
              <p className="text-destructive text-xs">Minimum: 10,000,000 tokens</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fundraisingTarget" className="text-xs text-muted-foreground">
              TARGET (SOL) <span className="text-primary/60">(min 30)</span>
            </Label>
            <Input
              id="fundraisingTarget"
              placeholder="85"
              className="font-mono text-sm bg-background"
              disabled={isProcessing}
              {...form.register('fundraisingTarget')}
              data-testid="input-fundraising-target"
            />
            {parseFloat(form.watch('fundraisingTarget')) < MIN_FUNDRAISING_SOL && parseFloat(form.watch('fundraisingTarget')) > 0 && (
              <p className="text-destructive text-xs">Minimum: 30 SOL</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">BONDING CURVE TYPE</Label>
          <Select
            value={form.watch('curveType')}
            onValueChange={(value) => form.setValue('curveType', value as any)}
            disabled={isProcessing}
          >
            <SelectTrigger className="font-mono text-sm bg-background" data-testid="select-curve-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear" className="font-mono text-sm">
                LINEAR - Price increases proportionally with supply
              </SelectItem>
              <SelectItem value="exponential" className="font-mono text-sm">
                EXPONENTIAL - Price increases faster as supply grows
              </SelectItem>
              <SelectItem value="logarithmic" className="font-mono text-sm">
                LOGARITHMIC - Price increases slower as supply grows
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 p-4 bg-card border border-primary/30">
          <Label htmlFor="initialPurchase" className="text-xs text-primary terminal-glow">
            BUY TOKENS AT LAUNCH (OPTIONAL)
          </Label>
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <Input
                id="initialPurchase"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                className="font-mono text-sm bg-background"
                disabled={isProcessing}
                {...form.register('initialPurchase')}
                data-testid="input-initial-purchase"
              />
              <span className="text-xs text-muted-foreground mt-1 block">SOL to spend</span>
            </div>
            <div className="text-muted-foreground text-lg">=</div>
            <div className="flex-1 text-right">
              <div className="font-mono text-primary text-lg terminal-glow">
                {formatNumber(tokensReceived)}
              </div>
              <span className="text-xs text-muted-foreground">tokens received</span>
            </div>
          </div>
          {parseFloat(initialPurchase) > 0 && (
            <div className="text-xs text-muted-foreground mt-2 flex justify-between">
              <span>Fee (0.25%):</span>
              <span>{(parseFloat(initialPurchase) * PLATFORM_FEE_RATE).toFixed(6)} SOL</span>
            </div>
          )}
        </div>

        <div className="space-y-2 p-4 bg-card border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs text-cyan-400">
                VANITY ADDRESS (OPTIONAL)
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Generate a token address ending in "claude"
              </p>
            </div>
            <Switch
              checked={wantVanity}
              onCheckedChange={setWantVanity}
              disabled={isProcessing}
              data-testid="switch-vanity"
            />
          </div>
          {wantVanity && (
            <div className="text-xs text-amber-400 mt-2 p-2 bg-amber-400/10 border border-amber-400/30">
              This will take 30 seconds to several minutes. Your token address will end in "claude" (case-insensitive).
            </div>
          )}
          {status === 'grinding' && vanityProgress && (
            <div className="text-xs text-cyan-400 mt-2 font-mono">
              Grinding... {vanityProgress.attempts.toLocaleString()} attempts | {vanityProgress.rate.toLocaleString()}/sec | {Math.round(vanityProgress.elapsed)}s
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground mb-4">
            <div className="flex justify-between py-1">
              <span>Estimated Network Fee:</span>
              <span className="text-foreground">~0.02 SOL</span>
            </div>
            {parseFloat(initialPurchase) > 0 && (
              <div className="flex justify-between py-1">
                <span>Initial Token Purchase:</span>
                <span className="text-primary">{initialPurchase} SOL</span>
              </div>
            )}
            <div className="flex justify-between py-1 font-bold border-t border-border pt-1 mt-1">
              <span>Total Cost:</span>
              <span className="text-foreground">~{(0.02 + (parseFloat(initialPurchase) || 0)).toFixed(2)} SOL</span>
            </div>
            <div className="flex justify-between py-1 mt-2 border-t border-border pt-2">
              <span>Graduation Target:</span>
              <span className="text-foreground">{form.watch('fundraisingTarget') || '85'} SOL</span>
            </div>
            <div className="flex justify-between py-1">
              <span>LP Burn:</span>
              <span className="text-primary">100%</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Trading:</span>
              <span className="text-primary">Raydium LaunchLab</span>
            </div>
          </div>

          {isProcessing && (
            <div className="mb-4 p-3 bg-card border border-border">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-primary cursor-blink">_</span>
                <span className="text-muted-foreground">
                  {status === 'uploading' && 'Uploading token image...'}
                  {status === 'metadata' && 'Creating on-chain metadata...'}
                  {status === 'creating' && 'Creating LaunchLab pool on Raydium...'}
                  {status === 'confirming' && 'Waiting for blockchain confirmation...'}
                </span>
              </div>
            </div>
          )}

          <Button 
            type="submit" 
            className="w-full font-mono"
            disabled={!canLaunch}
            data-testid="button-launch-token"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <span className="cursor-blink">_</span> {getStatusText()}
              </span>
            ) : (
              getStatusText()
            )}
          </Button>

          {!connected && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Connect your Phantom wallet to launch a token
            </p>
          )}

          {connected && !sdkReady && !sdkLoading && (
            <p className="text-xs text-destructive text-center mt-2">
              Raydium SDK requires a wallet that supports batch signing
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
