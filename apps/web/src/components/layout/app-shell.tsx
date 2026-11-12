"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { UserMenu } from "./user-menu";
import { CreditsBadge } from "./credits-badge";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { d } = useT();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || (href !== "/create" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("size-[18px]", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {d.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { d } = useT();
  return (
    <div className="flex min-h-dvh w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r bg-sidebar/60 px-4 py-5 lg:flex">
        <Link href="/create" className="px-2">
          <Wordmark />
        </Link>
        <div className="mt-8 flex-1">
          <NavLinks />
        </div>
        <CreditsBadge />
        <UserMenu />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur lg:hidden">
          <Link href="/create">
            <Wordmark />
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={d.nav.openNavigation}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-5">
              <SheetTitle className="sr-only">{d.nav.openNavigation}</SheetTitle>
              <Wordmark />
              <div className="mt-8">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <div className="mt-8">
                <CreditsBadge onNavigate={() => setOpen(false)} />
                <UserMenu />
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
