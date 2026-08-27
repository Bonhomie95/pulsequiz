import { errorMessage } from '../api';

/**
 * Error copy is user-facing. The server writes its messages for users, so those
 * win; everything else must still say something specific about what went wrong
 * rather than a generic apology.
 */
describe('errorMessage', () => {
  it("prefers the server's own message", () => {
    const err = {
      response: { status: 400, data: { message: 'You need 100 coins to play this wager.' } },
    };
    expect(errorMessage(err)).toBe('You need 100 coins to play this wager.');
  });

  it('names a timeout as a timeout', () => {
    expect(errorMessage({ code: 'ECONNABORTED' })).toMatch(/took too long/i);
  });

  it('names an unreachable server', () => {
    expect(errorMessage({ message: 'Network Error' })).toMatch(/can't reach/i);
  });

  it('falls back to the caller-supplied message', () => {
    const err = { response: { status: 500, data: {} } };
    expect(errorMessage(err, "Couldn't load the leaderboard.")).toBe(
      "Couldn't load the leaderboard.",
    );
  });

  it('never returns an empty string', () => {
    expect(errorMessage(undefined).length).toBeGreaterThan(0);
    expect(errorMessage(null).length).toBeGreaterThan(0);
    expect(errorMessage({}).length).toBeGreaterThan(0);
  });
});
