/**
 * Replays the seed simulation off the main thread so the boot screen stays
 * responsive during the first-visit generation.
 */
import { generateDatabase } from "./seed";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ now: string }>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = event => {
  const { db } = generateDatabase(new Date(event.data.now));
  scope.postMessage(db);
};
