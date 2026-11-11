/**
 * Awaits the promise and returns the error it rejected with; throws if it resolves. Tests use this
 * instead of `expect(promise).rejects`: on Windows, Bun can lose a socket data event while a test
 * awaits `.rejects` over a database query (oven-sh/bun#44429), and the run then hangs.
 */
export async function rejection(promise: PromiseLike<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error("Expected the promise to reject with an Error.", { cause: error });
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}
