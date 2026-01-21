import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/components/WalletProvider";
import { Header } from "@/components/Header";
import { MainnetWarning } from "@/components/MainnetWarning";
import Home from "@/pages/Home";
import Create from "@/pages/Create";
import Trade from "@/pages/Trade";
import Docs from "@/pages/Docs";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/create" component={Create} />
      <Route path="/trade/:id" component={Trade} />
      <Route path="/docs" component={Docs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WalletProvider>
          <div className="min-h-screen bg-background text-foreground scanlines">
            <Header />
            <Router />
            <MainnetWarning />
          </div>
          <Toaster />
        </WalletProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
