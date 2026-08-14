"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePracticeSessionAction } from "@/lib/practice/actions";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={deletePracticeSessionAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger/10"
        onClick={() => {
          if (window.confirm("Delete this practice session? This can't be undone.")) {
            formRef.current?.requestSubmit();
          }
        }}
      >
        <Trash2 className="h-4 w-4" /> Delete session
      </Button>
    </form>
  );
}
