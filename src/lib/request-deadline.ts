// SDK initialization, locks and retry sleeps are not bounded by fetch alone.
export async function withinDeadline<T>(operation: PromiseLike<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DOMException("Request deadline exceeded", "TimeoutError")), milliseconds);
      })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
