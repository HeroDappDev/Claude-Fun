import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center font-mono">
        <pre className="text-primary text-xs mb-4 terminal-glow">
{`
  ██╗  ██╗ ██████╗ ██╗  ██╗
  ██║  ██║██╔═══██╗██║  ██║
  ███████║██║   ██║███████║
  ╚════██║██║   ██║╚════██║
       ██║╚██████╔╝     ██║
       ╚═╝ ╚═════╝      ╚═╝
`}
        </pre>
        <div className="text-destructive text-xl mb-2">[ERROR 404]</div>
        <div className="text-muted-foreground text-sm mb-6">
          Page not found in the blockchain
        </div>
        <Link href="/">
          <Button variant="outline" className="font-mono">
            {'<'} RETURN TO CLAUDE.FUN
          </Button>
        </Link>
      </div>
    </div>
  );
}
