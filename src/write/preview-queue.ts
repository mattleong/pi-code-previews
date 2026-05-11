const writePreviewQueues = new Map<string, Promise<void>>();

export async function runSerializedWritePreview<T>(
  resolvedPath: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!resolvedPath) return run();
  const previous = writePreviewQueues.get(resolvedPath) ?? Promise.resolve();
  const wait = previous.catch(() => undefined);
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = wait.then(() => blocker);
  writePreviewQueues.set(resolvedPath, current);
  await wait;
  try {
    return await run();
  } finally {
    release();
    if (writePreviewQueues.get(resolvedPath) === current) writePreviewQueues.delete(resolvedPath);
  }
}
