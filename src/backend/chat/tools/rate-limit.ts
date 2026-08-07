/** 串行限速队列：任务排队执行，相邻两次至少间隔 intervalMs */
export const createRateLimitedQueue = (intervalMs: number) => {
  let lastRunAt = 0;
  let queue: Promise<void> = Promise.resolve();

  return async <T>(task: () => Promise<T>): Promise<T> => {
    const waitForTurn = queue;
    let releaseQueue = () => {};
    queue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await waitForTurn;

    try {
      const elapsed = Date.now() - lastRunAt;
      if (elapsed < intervalMs) {
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs - elapsed));
      }
      lastRunAt = Date.now();
      return await task();
    } finally {
      releaseQueue();
    }
  };
};
