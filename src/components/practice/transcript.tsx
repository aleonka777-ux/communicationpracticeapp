import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageSpeaker } from "@/lib/db/types";

export interface TranscriptMessage {
  id: string;
  speaker: MessageSpeaker;
  text: string;
}

export function Transcript({ messages, aiLabel }: { messages: TranscriptMessage[]; aiLabel: string }) {
  return (
    <div className="flex flex-col gap-3" role="log" aria-live="polite" aria-label="Conversation transcript">
      {messages.map((message) => {
        if (message.speaker === "coach_hint") {
          return (
            <div key={message.id} className="flex items-start gap-2 rounded-xl border border-dashed border-accent-green/50 bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <span className="font-semibold">Hint: </span>
                {message.text}
              </p>
            </div>
          );
        }

        const isUser = message.speaker === "user";
        return (
          <div key={message.id} className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
            <span className="mb-1 px-1 text-xs text-foreground-muted">{isUser ? "You" : aiLabel}</span>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                isUser ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground",
              )}
            >
              {message.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
