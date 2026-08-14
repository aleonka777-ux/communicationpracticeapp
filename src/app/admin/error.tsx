"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/state";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin segment error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="py-10">
      <ErrorState title="Something went wrong" description="Please check your input and try again." onRetry={reset} />
    </div>
  );
}
