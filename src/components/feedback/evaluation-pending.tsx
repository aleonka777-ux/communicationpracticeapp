"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingState, ErrorState } from "@/components/ui/state";

/** Rare fallback for direct navigation to a feedback URL before evaluation has finished. */
export function EvaluationPending({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/practice/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Couldn't generate feedback.");
        }
        if (!cancelled) router.refresh();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  if (error) return <ErrorState title="Couldn't generate feedback" description={error} onRetry={() => router.refresh()} />;
  return <LoadingState label="Preparing your feedback…" />;
}
