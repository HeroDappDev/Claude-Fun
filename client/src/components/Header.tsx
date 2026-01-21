import { WalletButton } from './WalletProvider';
import { Link, useLocation } from 'wouter';
import { SiX } from 'react-icons/si';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

const PLATFORM_CA = '2yqy46CfsN5JGTq7iwgsmmURf4THhX7jFk2sL8u9pump';

export function Header() {
  const [location] = useLocation();
  const [copied, setCopied] = useState(false);

  const copyCA = () => {
    navigator.clipboard.writeText(PLATFORM_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="/">
              <span className="text-lg sm:text-xl font-bold text-primary terminal-glow cursor-pointer" data-testid="link-home">
                [CLAUDE.FUN]
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <Link href="/">
                <span 
                  className={`cursor-pointer hover:text-primary transition-colors ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}
                  data-testid="link-launches"
                >
                  /launches
                </span>
              </Link>
              <Link href="/create">
                <span 
                  className={`cursor-pointer hover:text-primary transition-colors ${location === '/create' ? 'text-primary' : 'text-muted-foreground'}`}
                  data-testid="link-create"
                >
                  /create
                </span>
              </Link>
              <Link href="/docs">
                <span 
                  className={`cursor-pointer hover:text-primary transition-colors ${location === '/docs' ? 'text-primary' : 'text-muted-foreground'}`}
                  data-testid="link-docs"
                >
                  /docs
                </span>
              </Link>
              <a 
                href="https://x.com/ClaudeFun_SOL" 
                target="_blank" 
                rel="noopener noreferrer"
                className="cursor-pointer hover:text-primary transition-colors text-muted-foreground"
                data-testid="link-twitter"
              >
                <SiX className="w-4 h-4" />
              </a>
              <button
                onClick={copyCA}
                className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors text-muted-foreground"
                data-testid="button-copy-ca"
              >
                <span className="text-xs">CA: {PLATFORM_CA}</span>
                {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
              </button>
            </nav>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <span>MAINNET</span>
            </div>
            <WalletButton />
          </div>
        </div>
        
        {/* Mobile navigation */}
        <nav className="flex sm:hidden items-center justify-center gap-4 text-xs mt-2 pt-2 border-t border-border/50">
          <Link href="/">
            <span 
              className={`cursor-pointer hover:text-primary transition-colors ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}
              data-testid="link-launches-mobile"
            >
              /launches
            </span>
          </Link>
          <Link href="/create">
            <span 
              className={`cursor-pointer hover:text-primary transition-colors ${location === '/create' ? 'text-primary' : 'text-muted-foreground'}`}
              data-testid="link-create-mobile"
            >
              /create
            </span>
          </Link>
          <Link href="/docs">
            <span 
              className={`cursor-pointer hover:text-primary transition-colors ${location === '/docs' ? 'text-primary' : 'text-muted-foreground'}`}
              data-testid="link-docs-mobile"
            >
              /docs
            </span>
          </Link>
          <a 
            href="https://x.com/ClaudeFun_" 
            target="_blank" 
            rel="noopener noreferrer"
            className="cursor-pointer hover:text-primary transition-colors text-muted-foreground"
            data-testid="link-twitter-mobile"
          >
            <SiX className="w-3 h-3" />
          </a>
          <button
            onClick={copyCA}
            className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors text-muted-foreground"
            data-testid="button-copy-ca-mobile"
          >
            <span className="text-[10px]">CA: {PLATFORM_CA}</span>
            {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
          </button>
        </nav>
      </div>
    </header>
  );
}
