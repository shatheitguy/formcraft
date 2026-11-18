import { backfillLinks } from './form-links';
import { syncPortListeners } from './port-router';
import { startUpdateChecks } from './activity';
import { startAutoBackups } from './auto-backup';
import { startFormAlertDigests } from './form-alerts';

/** Boot tasks: give every form a unique link/port and start the per-form port listeners. */
export async function startup() {
  try {
    await backfillLinks();
    await syncPortListeners();
    startUpdateChecks();
    startAutoBackups();
    startFormAlertDigests();
    // WhatsApp linked in Settings → Notifications: connect again.
    import('./whatsapp').then((m) => m.waResume()).catch((e) => console.error('[formcraft] whatsapp', e?.message || e));
  } catch (err) {
    // The schema may not exist yet on the very first boot of a dev checkout.
    console.error('[formcraft] startup link sync skipped:', err instanceof Error ? err.message : err);
  }
}
