import { signOut } from "@/app/auth/actions";
import { removeDevice } from "@/app/account/actions";
import { listMyDevices, deviceLabel } from "@/lib/devices";

/**
 * Full-screen block shown when the current device exceeds the account's device
 * limit. Lets the user remove one of their existing devices to free a slot.
 */
export default async function DeviceLimitBlock({
  maxDevices,
  currentDeviceId,
}: {
  maxDevices: number;
  currentDeviceId: string | null;
}) {
  const devices = await listMyDevices();

  return (
    <div className="app-gradient flex min-h-screen items-center justify-center p-4">
      <div className="glass w-full max-w-md p-6">
        <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--danger)]/10 text-[var(--danger)]">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold">Device limit reached</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your plan allows {maxDevices} device{maxDevices === 1 ? "" : "s"}. To use MEDprep on
          this device, remove one of the devices below, then reload.
        </p>

        <div className="mt-4 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {devices.map((d, i) => {
            const withinLimit = i < maxDevices;
            const isCurrent = d.device_id === currentDeviceId;
            return (
              <div key={d.device_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {deviceLabel(d.user_agent)}
                    {isCurrent && (
                      <span className="badge ml-2 bg-black/[0.06]">this device</span>
                    )}
                    {withinLimit ? (
                      <span className="badge ml-1 bg-[var(--primary)]/10 text-[var(--primary)]">active</span>
                    ) : (
                      <span className="badge ml-1 bg-amber-100 text-amber-700">over limit</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Last used {new Date(d.last_seen).toLocaleString()}
                  </p>
                </div>
                <form action={removeDevice.bind(null, d.device_id)}>
                  <button className="btn-ghost text-xs text-[var(--danger)]" type="submit">
                    Remove
                  </button>
                </form>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <form action={signOut}>
            <button type="submit" className="btn-outline">Sign out</button>
          </form>
          <a href="" className="btn-primary">Reload</a>
        </div>
      </div>
    </div>
  );
}
