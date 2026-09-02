/**
 * Ending sessions.
 *
 * The first call site for `logoutEverywhere` — `POST /auth/logout-all` has been wired through the
 * auth context since OAuth landed with nothing calling it, so the endpoint existed but was
 * unreachable from the UI.
 *
 * Neither action needs a confirmation step: both are recoverable by signing in again, and the
 * consequence of the second is stated next to it rather than in a dialog.
 */

import { LogOut, ShieldOff } from "lucide-react";
import { useAuth } from "../../../lib/authContext";

const BUTTON = "flex items-center gap-2 rounded-md px-4 py-2 cursor-pointer font-heading text-sm bg-transparent";

export function SessionsSection() {
  const { logout, logoutEverywhere } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button onClick={() => void logout()} className={`${BUTTON} border border-border text-text-bright`}>
          <LogOut size={15} aria-hidden="true" />
          Log out
        </button>
        <p className="text-text-dim text-xs mt-2">Signs you out on this device only.</p>
      </div>

      <div className="border-t border-border pt-6">
        <button
          onClick={() => void logoutEverywhere()}
          className={`${BUTTON} border border-ccs-red/40 text-ccs-red`}
        >
          <ShieldOff size={15} aria-hidden="true" />
          Log out everywhere
        </button>
        <p className="text-text-dim text-xs mt-2">
          Ends your session on every device, including this one. Use this if you've signed in
          somewhere you don't control.
        </p>
      </div>
    </div>
  );
}
