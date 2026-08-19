/** First-time public identity setup for a newly Discord-created profile. */

import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { ProfilePresentationForm } from "../components/profile/ProfilePresentationForm";
import { playerPath } from "../components/profile/PlayerLink";
import { RequireAuth } from "../components/auth/RequireAuth";
import { useAuth } from "../lib/authContext";

export default function Setup() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  return (
    <PageShell maxWidth={760}>
      <RequireAuth>
        <div className="mx-auto rounded-lg border border-border bg-bg2 p-5 sm:p-7">
          <p className="mb-1 font-heading text-xs uppercase tracking-wider text-accent">One last step</p>
          <h1 className="font-display text-[28px] tracking-widest text-text-bright">SET UP YOUR PLAYER PROFILE</h1>
          <p className="mb-7 mt-2 max-w-[620px] text-sm text-text-secondary">
            Tell players, production, and content how to refer to you. These details are public and can be changed later in Settings.
          </p>
          {profile && (
            <ProfilePresentationForm
              initial={{
                nickname: profile.nickname ?? profile.name ?? "",
                pronouns: profile.pronouns ?? "",
                pronunciation: profile.pronunciation ?? "",
              }}
              submitLabel="Complete setup"
              onSaved={saved => navigate(playerPath(saved.id), { replace: true })}
            />
          )}
        </div>
      </RequireAuth>
    </PageShell>
  );
}
