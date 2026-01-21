import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  PLATFORM_FEE_RATE, 
  PLATFORM_TREASURY, 
  DEFAULT_FUNDRAISING_TARGET 
} from '@/lib/solana';

export default function Docs() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary terminal-glow mb-2" data-testid="text-docs-title">
          [DOCUMENTATION]
        </h1>
        <p className="text-muted-foreground font-mono">
          Everything you need to know about launching and trading tokens on Claude.fun
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [1] WHAT IS CLAUDE.FUN?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <p className="text-foreground">
              Claude.fun is a Solana mainnet token launchpad that allows anyone to create and launch 
              SPL tokens with built-in bonding curves. Tokens trade on the bonding curve until they 
              reach their fundraising target, at which point they "graduate" to a Raydium CPMM liquidity pool.
            </p>
            <div className="bg-muted/30 p-4 border border-border">
              <div className="text-secondary mb-2">[KEY FEATURES]</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Real SPL token creation on Solana mainnet</li>
                <li>• Three bonding curve types to choose from</li>
                <li>• Automatic graduation to Raydium DEX</li>
                <li>• 100% LP token burn for permanent liquidity</li>
                <li>• Phantom wallet integration</li>
                <li>• On-chain transaction verification</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [2] HOW TO LAUNCH A TOKEN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="text-secondary">STEP 1:</span>
                <span className="text-foreground">Connect your Phantom wallet</span>
              </div>
              <div className="flex gap-3">
                <span className="text-secondary">STEP 2:</span>
                <span className="text-foreground">Navigate to <Link href="/create"><span className="text-primary underline" data-testid="link-docs-create">/create</span></Link></span>
              </div>
              <div className="flex gap-3">
                <span className="text-secondary">STEP 3:</span>
                <span className="text-foreground">Fill in your token details (name, symbol, description)</span>
              </div>
              <div className="flex gap-3">
                <span className="text-secondary">STEP 4:</span>
                <span className="text-foreground">Choose your bonding curve type</span>
              </div>
              <div className="flex gap-3">
                <span className="text-secondary">STEP 5:</span>
                <span className="text-foreground">Set your total supply and fundraising target</span>
              </div>
              <div className="flex gap-3">
                <span className="text-secondary">STEP 6:</span>
                <span className="text-foreground">Click "LAUNCH TOKEN" and sign the transaction</span>
              </div>
            </div>

            <div className="bg-muted/30 p-4 border border-border mt-4">
              <div className="text-secondary mb-2">[TOKEN CREATION DETAILS]</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• <span className="text-foreground">Default Supply:</span> 1,000,000,000 tokens</li>
                <li>• <span className="text-foreground">Decimals:</span> 9 (same as SOL)</li>
                <li>• <span className="text-foreground">Network:</span> Solana Mainnet</li>
                <li>• <span className="text-foreground">Creation Cost:</span> ~0.01 SOL (network fees only)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [3] BONDING CURVES EXPLAINED
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <p className="text-foreground">
              A bonding curve is a mathematical formula that determines the price of a token based on its 
              circulating supply. As more tokens are bought, the price increases according to the curve. 
              When tokens are sold, the price decreases.
            </p>

            <div className="space-y-4">
              <div className="bg-muted/30 p-4 border border-secondary/50">
                <div className="text-secondary font-bold mb-2">[LINEAR CURVE]</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Formula: price = initialPrice + (slope × supply)
                </div>
                <p className="text-foreground text-xs">
                  Price increases at a constant rate as supply grows. This provides predictable, 
                  steady price appreciation. Best for tokens seeking stable, gradual growth.
                </p>
                <div className="mt-2 text-xs">
                  <span className="text-primary">Pros:</span> <span className="text-muted-foreground">Predictable pricing, easy to understand</span>
                </div>
                <div className="text-xs">
                  <span className="text-destructive">Cons:</span> <span className="text-muted-foreground">Slower price appreciation for early buyers</span>
                </div>
              </div>

              <div className="bg-muted/30 p-4 border border-secondary/50">
                <div className="text-secondary font-bold mb-2">[EXPONENTIAL CURVE]</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Formula: price = initialPrice × (1 + rate)^supply
                </div>
                <p className="text-foreground text-xs">
                  Price grows exponentially with supply. Early buyers get significant discounts while 
                  late buyers pay premium prices. Creates high volatility and rapid price movements.
                </p>
                <div className="mt-2 text-xs">
                  <span className="text-primary">Pros:</span> <span className="text-muted-foreground">High rewards for early participants</span>
                </div>
                <div className="text-xs">
                  <span className="text-destructive">Cons:</span> <span className="text-muted-foreground">High volatility, expensive for latecomers</span>
                </div>
              </div>

              <div className="bg-muted/30 p-4 border border-secondary/50">
                <div className="text-secondary font-bold mb-2">[LOGARITHMIC CURVE]</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Formula: price = initialPrice × (1 + multiplier × ln(1 + supply))
                </div>
                <p className="text-foreground text-xs">
                  Price increases quickly at first, then slows as supply grows. This creates a more 
                  accessible entry point for later buyers while still rewarding early participants.
                </p>
                <div className="mt-2 text-xs">
                  <span className="text-primary">Pros:</span> <span className="text-muted-foreground">Balanced between early/late buyer advantages</span>
                </div>
                <div className="text-xs">
                  <span className="text-destructive">Cons:</span> <span className="text-muted-foreground">More complex pricing dynamics</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [4] TRADING ON THE CURVE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <p className="text-foreground">
              Once a token is launched, anyone can buy or sell tokens on the bonding curve. The price 
              is determined algorithmically based on the current supply.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-primary/10 p-4 border border-primary/30">
                <div className="text-primary font-bold mb-2">[BUYING]</div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>• Send SOL to receive tokens</li>
                  <li>• Price increases with each purchase</li>
                  <li>• Larger buys have higher price impact</li>
                  <li>• 0.25% platform fee applied</li>
                </ul>
              </div>
              <div className="bg-destructive/10 p-4 border border-destructive/30">
                <div className="text-destructive font-bold mb-2">[SELLING]</div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>• Send tokens to receive SOL</li>
                  <li>• Price decreases with each sale</li>
                  <li>• Larger sells have higher price impact</li>
                  <li>• 0.25% platform fee applied</li>
                </ul>
              </div>
            </div>

            <div className="bg-muted/30 p-4 border border-border">
              <div className="text-secondary mb-2">[PRICE IMPACT]</div>
              <p className="text-xs text-muted-foreground">
                Price impact measures how much your trade will move the token price. Large trades 
                relative to the liquidity will have higher price impact. Always check the quoted 
                price impact before executing a trade.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [5] GRADUATION TO RAYDIUM
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <p className="text-foreground">
              When a token reaches its fundraising target (default: {DEFAULT_FUNDRAISING_TARGET} SOL), 
              it "graduates" from the bonding curve to a Raydium CPMM (Constant Product Market Maker) pool.
            </p>

            <div className="bg-muted/30 p-4 border border-border">
              <div className="text-secondary mb-2">[GRADUATION PROCESS]</div>
              <div className="space-y-2 text-xs">
                <div className="flex gap-3">
                  <span className="text-primary">1.</span>
                  <span className="text-foreground">Target of {DEFAULT_FUNDRAISING_TARGET} SOL reached</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary">2.</span>
                  <span className="text-foreground">Bonding curve trading is disabled</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary">3.</span>
                  <span className="text-foreground">Liquidity pool created on Raydium DEX</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary">4.</span>
                  <span className="text-foreground">100% of LP tokens are burned</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary">5.</span>
                  <span className="text-foreground">Token trades freely on Raydium</span>
                </div>
              </div>
            </div>

            <div className="bg-secondary/10 p-4 border border-secondary/30">
              <div className="text-secondary font-bold mb-2">[100% LP BURN]</div>
              <p className="text-xs text-muted-foreground">
                All LP (Liquidity Provider) tokens are burned upon graduation. This means the liquidity 
                is permanently locked and cannot be removed ("rugged"). This provides security for 
                token holders that liquidity will always be available for trading.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [6] FEE STRUCTURE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-secondary">FEE TYPE</th>
                    <th className="text-left py-2 text-secondary">AMOUNT</th>
                    <th className="text-left py-2 text-secondary">RECIPIENT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Trading Fee (Buy/Sell)</td>
                    <td className="py-2 text-primary" data-testid="text-trading-fee">{(PLATFORM_FEE_RATE * 100).toFixed(2)}%</td>
                    <td className="py-2 text-muted-foreground">Platform Treasury</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Token Creation</td>
                    <td className="py-2 text-primary">~0.01 SOL</td>
                    <td className="py-2 text-muted-foreground">Network (Rent + TX Fee)</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">LP Token Burn</td>
                    <td className="py-2 text-primary">100%</td>
                    <td className="py-2 text-muted-foreground">Burned (Locked Forever)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-muted/30 p-4 border border-border">
              <div className="text-secondary mb-2">[TREASURY WALLET]</div>
              <code className="text-xs text-primary break-all" data-testid="text-treasury-address">
                {PLATFORM_TREASURY.toBase58()}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                All trading fees are collected in the platform treasury wallet.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [7] SECURITY
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <p className="text-foreground">
              Claude.fun implements multiple layers of security to ensure the integrity of token launches:
            </p>

            <div className="space-y-3">
              <div className="bg-muted/30 p-3 border border-border">
                <div className="text-secondary text-xs mb-1">[TRANSACTION VERIFICATION]</div>
                <p className="text-xs text-muted-foreground">
                  Every token creation is verified on-chain by parsing the transaction and validating 
                  all instructions (createAccount, initializeMint, ATA creation, mintTo).
                </p>
              </div>
              
              <div className="bg-muted/30 p-3 border border-border">
                <div className="text-secondary text-xs mb-1">[SIGNER VERIFICATION]</div>
                <p className="text-xs text-muted-foreground">
                  The system verifies that the creator wallet actually signed the transaction, 
                  preventing spoofed or fraudulent launches.
                </p>
              </div>
              
              <div className="bg-muted/30 p-3 border border-border">
                <div className="text-secondary text-xs mb-1">[ON-CHAIN STATE VALIDATION]</div>
                <p className="text-xs text-muted-foreground">
                  After confirmation, the system fetches the mint account and ATA to verify: 
                  correct supply, decimals, mint authority, freeze authority, and token balance.
                </p>
              </div>
              
              <div className="bg-muted/30 p-3 border border-border">
                <div className="text-secondary text-xs mb-1">[PHANTOM WALLET ONLY]</div>
                <p className="text-xs text-muted-foreground">
                  The platform exclusively supports Phantom wallet for enhanced security and 
                  consistent user experience.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary font-mono text-lg">
              [8] FAQ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <div className="space-y-4">
              <div>
                <div className="text-secondary text-xs mb-1">Q: How much does it cost to launch a token?</div>
                <p className="text-xs text-muted-foreground">
                  A: Only network fees (~0.01 SOL) for account rent and transaction costs. 
                  There are no platform fees for token creation.
                </p>
              </div>
              
              <div>
                <div className="text-secondary text-xs mb-1">Q: What wallet do I need?</div>
                <p className="text-xs text-muted-foreground">
                  A: Claude.fun exclusively supports Phantom wallet. Make sure you have Phantom 
                  installed and connected to Solana mainnet.
                </p>
              </div>
              
              <div>
                <div className="text-secondary text-xs mb-1">Q: Can I rug my own token?</div>
                <p className="text-xs text-muted-foreground">
                  A: Once a token graduates and LP tokens are burned, the liquidity is 
                  permanently locked. However, you retain mint authority until you revoke it.
                </p>
              </div>
              
              <div>
                <div className="text-secondary text-xs mb-1">Q: What happens if my token doesn't reach the target?</div>
                <p className="text-xs text-muted-foreground">
                  A: The token continues trading on the bonding curve indefinitely until it 
                  reaches the graduation target.
                </p>
              </div>
              
              <div>
                <div className="text-secondary text-xs mb-1">Q: Which bonding curve should I choose?</div>
                <p className="text-xs text-muted-foreground">
                  A: Linear for stable growth, Exponential for high-reward/high-risk, 
                  Logarithmic for balanced accessibility. See section [3] for details.
                </p>
              </div>
              
              <div>
                <div className="text-secondary text-xs mb-1">Q: Is this on mainnet or devnet?</div>
                <p className="text-xs text-muted-foreground">
                  A: Claude.fun operates on Solana MAINNET. All transactions use real SOL 
                  and create real tokens. Trade responsibly.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive font-mono text-lg">
              [!] RISK DISCLAIMER
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm font-mono">
            <p className="text-foreground">
              Trading tokens on bonding curves involves significant financial risk. Please read 
              and understand the following before using Claude.fun:
            </p>
            
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-destructive">•</span>
                Token prices can be extremely volatile and you may lose your entire investment
              </li>
              <li className="flex gap-2">
                <span className="text-destructive">•</span>
                This platform is for educational and experimental purposes
              </li>
              <li className="flex gap-2">
                <span className="text-destructive">•</span>
                Past performance does not guarantee future results
              </li>
              <li className="flex gap-2">
                <span className="text-destructive">•</span>
                Do your own research (DYOR) before investing in any token
              </li>
              <li className="flex gap-2">
                <span className="text-destructive">•</span>
                Never invest more than you can afford to lose
              </li>
              <li className="flex gap-2">
                <span className="text-destructive">•</span>
                This is not financial advice
              </li>
            </ul>

            <div className="bg-destructive/20 p-4 border border-destructive/50 mt-4">
              <p className="text-xs text-destructive font-bold">
                BY USING CLAUDE.FUN, YOU ACKNOWLEDGE THAT YOU UNDERSTAND THESE RISKS AND 
                ACCEPT FULL RESPONSIBILITY FOR YOUR TRADING DECISIONS.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center py-8">
          <Link href="/create">
            <Button 
              size="lg"
              className="font-mono"
              data-testid="button-docs-create-token"
            >
              [START LAUNCHING TOKENS]
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
