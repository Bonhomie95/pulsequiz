/**
 * Shared question-timing constants.
 *
 * Solo quiz and PvP both count 15 seconds per question, and both must forgive
 * the network round trip: the server starts the clock when it writes the
 * deadline, but the player's clock only starts once the response has travelled
 * back and rendered. Their answer then has to travel out again. On mobile that
 * is easily a second in each direction, so a player who answers with time
 * visibly left on screen can still arrive after a strict deadline — and because
 * a wrong-or-late answer ends the run, they lose it to latency alone.
 *
 * The grace absorbs that round trip. It is deliberately small: the deadline
 * stays server-authoritative, so a client faking its own timer gains at most
 * this much.
 */
export const TIME_PER_QUESTION = 15;
export const ANSWER_GRACE_MS = 2_500;

/** The last instant an answer is still accepted for a given deadline. */
export function answerCutoff(deadline: Date | string): number {
  return new Date(deadline).getTime() + ANSWER_GRACE_MS;
}

/** True when `deadline` has passed even allowing for the round trip. */
export function isAnswerTooLate(deadline: Date | string | null | undefined): boolean {
  if (!deadline) return false;
  return Date.now() > answerCutoff(deadline);
}
