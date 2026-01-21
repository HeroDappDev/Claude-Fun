import { useMemo, ReactNode, useCallback, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletError } from '@solana/wallet-adapter-base';
import { shortenAddress } from '@/lib/solana';
import { Button } from '@/components/ui/button';

import '@solana/wallet-adapter-react-ui/styles.css';

// Fetch RPC config from server (uses premium Helius RPC if configured)
async function fetchRpcConfig(): Promise<{ rpcUrl: string; wssUrl: string }> {
  try {
    const response = await fetch('/api/config/rpc');
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn('Failed to fetch RPC config');
  }
  return {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    wssUrl: 'wss://api.mainnet-beta.solana.com',
  };
}

// Fetch balance from server API (uses server's RPC connection)
async function fetchBalance(address: string): Promise<number> {
  try {
    const response = await fetch(`/api/wallet/${address}/balance`);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.balance || 0;
  } catch (error) {
    console.error('Error fetching balance:', error);
    return 0;
  }
}

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [rpcEndpoint, setRpcEndpoint] = useState('https://api.mainnet-beta.solana.com');
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchRpcConfig().then(config => {
      setRpcEndpoint(config.rpcUrl);
      setIsLoading(false);
      console.log('Using RPC endpoint:', config.rpcUrl.substring(0, 50) + '...');
    });
  }, []);

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  const onError = useCallback((error: WalletError) => {
    console.error('Wallet error:', error);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary font-mono">Initializing...</div>
      </div>
    );
  }

  return (
    <ConnectionProvider endpoint={rpcEndpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}

export function WalletButton() {
  const { publicKey, connected, connecting, disconnect, select, wallets } = useWallet();
  const [balance, setBalance] = useState<number>(0);
  
  useEffect(() => {
    let mounted = true;
    
    if (publicKey) {
      fetchBalance(publicKey.toBase58()).then((bal) => {
        if (mounted) setBalance(bal);
      });
    } else {
      setBalance(0);
    }
    
    return () => { mounted = false; };
  }, [publicKey]);

  const handleConnect = useCallback(() => {
    if (wallets.length > 0) {
      select(wallets[0].adapter.name);
    }
  }, [wallets, select]);

  if (connecting) {
    return (
      <Button variant="outline" disabled className="font-mono text-xs">
        <span className="cursor-blink">_</span> CONNECTING...
      </Button>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground">
          <span className="text-primary">{balance.toFixed(4)}</span> SOL
        </div>
        <Button 
          variant="outline" 
          onClick={() => disconnect()}
          className="font-mono text-xs"
          data-testid="button-disconnect-wallet"
        >
          [{shortenAddress(publicKey.toBase58())}]
        </Button>
      </div>
    );
  }

  return (
    <Button 
      onClick={handleConnect}
      className="font-mono text-xs"
      data-testid="button-connect-wallet"
    >
      [CONNECT PHANTOM]
    </Button>
  );
}

export function useWalletConnection() {
  const { publicKey, connected, signTransaction, signAllTransactions } = useWallet();
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    
    if (publicKey) {
      fetchBalance(publicKey.toBase58()).then((bal) => {
        if (mounted) setBalance(bal);
      });
      
      const interval = setInterval(() => {
        fetchBalance(publicKey.toBase58()).then((bal) => {
          if (mounted) setBalance(bal);
        });
      }, 30000);
      
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }
    
    return () => { mounted = false; };
  }, [publicKey]);

  return {
    publicKey,
    connected,
    balance,
    signTransaction,
    signAllTransactions,
  };
}
