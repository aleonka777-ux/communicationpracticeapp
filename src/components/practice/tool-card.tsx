import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CommunicationToolRow } from "@/lib/db/types";

export function ToolCard({ tool }: { tool: CommunicationToolRow }) {
  return (
    <Link href={`/tools/${tool.slug}`} className="block">
      <Card className="flex items-center justify-between gap-4 transition-colors hover:border-primary/40">
        <div>
          <p className="font-medium text-foreground">{tool.name}</p>
          <p className="mt-0.5 text-sm text-foreground-muted">{tool.short_description}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-foreground-muted" aria-hidden="true" />
      </Card>
    </Link>
  );
}
