import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-accent">
            <BookOpen className="h-4 w-4 text-accent-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">LedgerPilot</span>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">Cloud</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Features</a>
          <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
          <a href="#security" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Security</a>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link to="/signup">
            <Button variant="hero" size="sm">Start Free Trial</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
