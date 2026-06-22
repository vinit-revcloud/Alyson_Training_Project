import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LearnSidebarNav } from "@/components/learn/LearnSidebar";

export function LearnMobileNav({ footerLinks }: { footerLinks: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 border-b border-[var(--learn-border)] bg-[var(--learn-card)] p-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2 border-[var(--learn-border)]">
            <Menu className="h-4 w-4" />
            Guides
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[280px] flex-col p-0">
          <SheetHeader className="border-b border-[var(--learn-border)] p-4 text-left">
            <SheetTitle className="text-sm">Onboarding guides</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <LearnSidebarNav />
            <div className="border-t border-[var(--learn-border)] p-2" onClick={() => setOpen(false)}>
              {footerLinks}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Link to="/learn/dashboard" className="text-sm font-medium text-[var(--learn-accent)]">
        Dashboard
      </Link>
    </div>
  );
}
