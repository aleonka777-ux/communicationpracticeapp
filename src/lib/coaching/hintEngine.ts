import "server-only";
import { getAIProvider } from "@/lib/ai";
import { buildHintSystemPrompt } from "@/lib/coaching/promptBuilder";
import { buildInterlocutorMessages } from "@/lib/simulation/promptBuilder";
import type { CommunicationToolRow, ConversationMessageRow } from "@/lib/db/types";

/** Generates a single Training Mode hint from the conversation so far. */
export async function generateHint(
  tool: CommunicationToolRow,
  recentMessages: ConversationMessageRow[],
): Promise<string> {
  const provider = getAIProvider();
  const systemPrompt = buildHintSystemPrompt(tool);
  const messages = buildInterlocutorMessages(recentMessages);
  const { text } = await provider.generateHint({ systemPrompt, messages });
  return text;
}
