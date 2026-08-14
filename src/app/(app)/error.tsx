"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App segment error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="py-10">
      <ErrorState
        title="Something went wrong"
        description="Please try again. If this keeps happening, come back to this page later."
        onRetry={reset}
      />
    </div>
  );
}
