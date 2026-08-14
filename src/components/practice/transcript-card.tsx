"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Transcript, type TranscriptMessage } from "@/components/practice/transcript";

export function TranscriptCard({ messages, aiLabel }: { messages: TranscriptMessage[]; aiLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left text-sm font-semibold text-foreground"
        aria-expanded={open}
      >
        Transcript
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div className="border-t border-border px-5 py-4">
          <Transcript messages={messages} aiLabel={aiLabel} />
        </div>
      ) : null}
    </div>
  );
}
