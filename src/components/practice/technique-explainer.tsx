"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommunicationToolRow } from "@/lib/db/types";

export function TechniqueExplainer({ tool }: { tool: CommunicationToolRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-surface-muted">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground"
        aria-expanded={open}
      >
        Remind me how this works
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4 text-sm">
          <div>
            <p className="mb-1 font-semibold text-foreground">What it does</p>
            <p className="text-foreground-muted">{tool.purpose}</p>
          </div>
          {tool.core_principles.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-foreground">Try to do this</p>
              <ul className="list-inside list-disc space-y-1 text-foreground-muted">
                {tool.core_principles.slice(0, 4).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {tool.good_examples.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-foreground">Example</p>
              <p className="italic text-foreground-muted">&ldquo;{tool.good_examples[0]}&rdquo;</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
