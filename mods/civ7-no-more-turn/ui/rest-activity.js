// A recorder/debug harness renews an explicit, short lease. Merely enabling
// the debug console must never disable the user's normal play restrictions.
export const ACTIVITY_KEY = 'civ7-rest-guard.activity.v1';
export const MAX_ACTIVITY_MS = 120000;

export function activityActive(storage, now) {
  try {
    const leases = JSON.parse(storage.getItem('modSettings') || '{}')[ACTIVITY_KEY];
    return !!leases && Object.values(leases).some(lease =>
      ['recording', 'debug'].includes(lease?.kind) &&
      Number.isFinite(lease.issuedAt) && Number.isFinite(lease.expiresAt) &&
      lease.issuedAt <= now && lease.expiresAt > now &&
      lease.expiresAt - lease.issuedAt <= MAX_ACTIVITY_MS);
  } catch { return false; }
}
