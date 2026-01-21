import { LaunchForm } from '@/components/LaunchForm';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function Create() {
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
        
        <div className="grid lg:grid-cols-2 gap-8">
          <LaunchForm />
          
          <div className="space-y-6">
            {/* How It Works */}
            <div className="border border-border p-6">
              <div className="text-primary font-bold text-sm terminal-glow mb-4">
                [HOW IT WORKS]
              </div>
              
              <div className="space-y-4 text-xs font-mono text-muted-foreground">
                <div className="flex gap-3">
                  <span className="text-primary">01.</span>
                  <div>
                    <div className="text-foreground mb-1">CREATE YOUR TOKEN</div>
                    <div>Choose a name, symbol, and bonding curve type. Pay a small creation fee.</div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <span className="text-primary">02.</span>
                  <div>
                    <div className="text-foreground mb-1">BONDING CURVE TRADING</div>
                    <div>Anyone can buy or sell tokens. Price adjusts automatically based on supply.</div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <span className="text-primary">03.</span>
                  <div>
                    <div className="text-foreground mb-1">REACH THE TARGET</div>
                    <div>When the fundraising target is met (default: 85 SOL), the token graduates.</div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <span className="text-primary">04.</span>
                  <div>
                    <div className="text-foreground mb-1">LIQUIDITY MIGRATION</div>
                    <div>Funds automatically migrate to a Raydium CPMM pool. LP tokens are burned.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bonding Curve Types */}
            <div className="border border-border p-6">
              <div className="text-primary font-bold text-sm terminal-glow mb-4">
                [BONDING CURVES]
              </div>
              
              <div className="space-y-4 text-xs font-mono">
                <div className="border-b border-border pb-3">
                  <div className="text-foreground mb-1">LINEAR</div>
                  <div className="text-muted-foreground">
                    Price = Initial + (Slope × Supply)
                  </div>
                  <div className="text-primary mt-1">
                    Steady, predictable price increase
                  </div>
                </div>
                
                <div className="border-b border-border pb-3">
                  <div className="text-foreground mb-1">EXPONENTIAL</div>
                  <div className="text-muted-foreground">
                    Price = Initial × (1 + Rate)^Supply
                  </div>
                  <div className="text-accent mt-1">
                    Accelerating price growth, rewards early buyers
                  </div>
                </div>
                
                <div>
                  <div className="text-foreground mb-1">LOGARITHMIC</div>
                  <div className="text-muted-foreground">
                    Price = Initial + Rate × log(1 + Supply)
                  </div>
                  <div className="text-secondary mt-1">
                    Slower price growth, more accessible entry
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            <div className="border border-destructive/50 p-6">
              <div className="text-destructive font-bold text-sm mb-4">
                [RISK WARNING]
              </div>
              
              <div className="space-y-2 text-xs font-mono text-muted-foreground">
                <p>
                  Token trading on bonding curves involves significant risk. Prices can be 
                  extremely volatile and you may lose your entire investment.
                </p>
                <p>
                  This is not financial advice. Do your own research before investing.
                </p>
                <p className="text-destructive">
                  Never invest more than you can afford to lose.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
