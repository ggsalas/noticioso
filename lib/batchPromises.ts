/**
 * Like Promise.allSettled but runs tasks in batches of `batchSize` concurrently.
 * Tasks are factory functions (() => Promise<T>) to avoid starting them prematurely.
 */
export async function batchPromises<T>(
  promises: (() => Promise<T>)[],
  batchSize: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];

  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize).map((task) => task());
    results.push(...(await Promise.allSettled(batch)));
  }

  return results;
}
