import Link from "next/link";
import { LogOut } from "lucide-react";
import { logOutAction } from "@/lib/auth/actions";

export function TopBar({ displayName }: { displayName: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur safe-top">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <Link href="/home" className="text-sm font-semibold text-foreground">
          Communication Coach
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-foreground-muted sm:inline">{displayName}</span>
          <form action={logOutAction}>
            <button
              type="submit"
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-foreground-muted hover:bg-surface-muted"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
