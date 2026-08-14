"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, MessageCircleHeart, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/home", label: "Practice", icon: MessageCircleHeart },
  { href: "/history", label: "History", icon: History },
] as const;

export function BottomNav({ isCoach }: { isCoach: boolean }) {
  const pathname = usePathname();
  const allItems = isCoach ? [...items, { href: "/admin", label: "Coach", icon: ShieldCheck }] : items;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur safe-bottom"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {allItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-primary" : "text-foreground-muted",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
