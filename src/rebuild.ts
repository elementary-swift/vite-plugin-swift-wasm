export function createReloadDebouncer(delayMs: number) {
  let lastTime = 0;

  return {
    shouldReload() {
      const now = Date.now();
      if (now - lastTime < delayMs) {
        return false;
      }
      lastTime = now;
      return true;
    },
  };
}

export function createThrottledRebuilder(
  build: () => Promise<void>,
  warn: (message: string) => void,
) {
  let runningBuildCount = 0;
  let queuedRebuild: Promise<void> | null = null;

  return async () => {
    if (queuedRebuild) {
      return queuedRebuild;
    }

    runningBuildCount++;
    try {
      const currentBuild = build();
      if (runningBuildCount > 1) {
        queuedRebuild = currentBuild;
      }

      await currentBuild;
    } finally {
      if (runningBuildCount > 2) {
        warn(`This should not happen: runningBuildCount > 2`);
      }
      runningBuildCount--;
      if (runningBuildCount === 1) {
        queuedRebuild = null;
      }
    }
  };
}
