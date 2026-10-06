import { backfillLinks } from './form-links';
import { syncPortListeners } from './port-router';

/** Boot tasks: give every form a unique link/port and start the per-form port listeners. */
export async function startup() {
  try {
    await backfillLinks();
    await syncPortListeners();
  } catch (err) {
    // The schema may not exist yet on the very first boot of a dev checkout.
    console.error('[formcraft] startup link sync skipped:', err instanceof Error ? err.message : err);
  }
}
