import "server-only";
import { getAIProvider } from "@/lib/ai";
import { buildInterlocutorMessages, buildInterlocutorSystemPrompt } from "@/lib/simulation/promptBuilder";
import type { CommunicationToolRow, ConversationMessageRow, ScenarioRow } from "@/lib/db/types";

/** Generates the AI interlocutor's next line given the conversation so far. */
export async function generateInterlocutorTurn(
  tool: CommunicationToolRow,
  scenario: ScenarioRow,
  priorMessages: ConversationMessageRow[],
): Promise<string> {
  const provider = getAIProvider();
  const systemPrompt = buildInterlocutorSystemPrompt(tool, scenario);
  const messages = buildInterlocutorMessages(priorMessages);
  const { text } = await provider.generateInterlocutorReply({ systemPrompt, messages });
  return text;
}
