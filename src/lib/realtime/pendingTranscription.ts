/**
 * Bounded wait for the user's final utterance to finish transcribing before a Realtime session
 * closes. server_vad reports `input_audio_buffer.speech_stopped` immediately, but the
 * corresponding `conversation.item.input_audio_transcription.completed` event arrives slightly
 * later — ending the session (timer or End Practice) right in that gap would otherwise silently
 * drop the user's last turn from what the Evaluation Engine sees. Capped by `timeoutMs` so a
 * stalled or failed transcription can never block ending indefinitely.
 */
export async function waitForPendingUserTranscription(
  pendingRef: { current: boolean },
  timeoutMs = 4000,
  pollMs = 100,
): Promise<void> {
  const start = Date.now();
  while (pendingRef.current && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
