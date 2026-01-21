import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function MainnetWarning() {
  const [isOpen, setIsOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const hasSeenWarning = localStorage.getItem('claudefun_mainnet_warning');
    if (!hasSeenWarning) {
      setIsOpen(true);
    }
  }, []);

  const handleContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem('claudefun_mainnet_warning', 'true');
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="font-mono bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary terminal-glow text-center">
            <div>+------------------------------+</div>
            <div>|  MAINNET WARNING  |</div>
            <div>+------------------------------+</div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-foreground text-sm space-y-4">
          <div className="text-center text-destructive font-bold">
            THIS IS A REAL BLOCKCHAIN
          </div>
          
          <div className="text-muted-foreground text-xs space-y-2">
            <div>
              This dApp operates on <span className="text-primary">Solana Mainnet</span>. 
              All transactions use real SOL and have real financial consequences.
            </div>
            
            <div className="text-accent">
              By continuing, you acknowledge:
            </div>
            
            <ul className="list-none space-y-1 pl-2">
              <li>- Transactions are irreversible</li>
              <li>- Token prices can be volatile</li>
              <li>- You may lose your investment</li>
              <li>- This is not financial advice</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center space-x-2 mt-4">
          <Checkbox 
            id="acknowledge" 
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked as boolean)}
            data-testid="checkbox-acknowledge"
          />
          <Label htmlFor="acknowledge" className="text-xs text-muted-foreground cursor-pointer">
            I understand the risks
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="dontShow" 
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
            data-testid="checkbox-dont-show"
          />
          <Label htmlFor="dontShow" className="text-xs text-muted-foreground cursor-pointer">
            Don't show this again
          </Label>
        </div>

        <DialogFooter className="mt-4">
          <Button
            onClick={handleContinue}
            disabled={!acknowledged}
            className="w-full font-mono"
            data-testid="button-continue"
          >
            [CONTINUE TO CLAUDE.FUN]
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
