/**
 * First-time setup for a newly Discord-created profile: who you are, then which accounts are you.
 *
 * Two steps, and the second one is the reason this stopped being a single form. A profile with no
 * Riot account attached is invisible to everything the site is for — no match attribution, no
 * statistics, no roster eligibility — and the only prompt to fix that used to be a Settings page
 * nobody had a reason to open. Asking here, once, while somebody is already filling in a form about
 * themselves, is the cheapest that question ever gets.
 *
 * **The accounts step is skippable and says so.** It is not a requirement upstream — `POST
 * /profiles/me/accounts` takes only `auth`, and setup completes without it — so gating the button on
 * it would be this page inventing a rule the API doesn't have, on the one screen a new member cannot
 * navigate away from.
 *
 * Setup is *complete* after step one: the presentation write is what clears `setupRequired`, and it
 * stays atomic. Step two is a prompt on the way out, which is why `SetupGate` had to learn to leave
 * a page mid-flow alone — see the comment there.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { ProfilePresentationForm } from "../components/profile/ProfilePresentationForm";
import { playerPath } from "../components/profile/PlayerLink";
import { RequireAuth } from "../components/auth/RequireAuth";
import { UnverifiedAccounts } from "../components/settings/profile/UnverifiedAccounts";
import { ACTION_PRIMARY, ErrorLine } from "../components/admin/adminUi";
import { RiotAccountCards } from "../components/profile/RiotAccountCards";
import { useAuth } from "../lib/authContext";
import { queries } from "../lib/queries";
import { errorMessage } from "../lib/api";

export default function Setup() {
  const { profile, verification } = useAuth();
  const navigate = useNavigate();
  /** The id from the save, so the finish button works even if the session refresh is still in air. */
  const [savedId, setSavedId] = useState<number | null>(null);

  return (
    <PageShell maxWidth={760}>
      <RequireAuth>
        <div className="mx-auto rounded-lg border border-border bg-bg2 p-5 sm:p-7">
          {savedId === null ? (
            <>
              <p className="mb-1 font-heading text-xs text-brand">
                Step 1 of 2
              </p>
              <h1 className="font-display text-[28px] text-text-bright">
                SET UP YOUR PLAYER PROFILE
              </h1>
              <p className="mb-7 mt-2 max-w-[620px] text-sm text-text-secondary">
                Tell players, production, and content how to refer to you. These details are public
                and can be changed later in Settings.
              </p>
              {profile && (
                <ProfilePresentationForm
                  initial={{
                    nickname: profile.nickname ?? profile.name ?? "",
                    pronouns: profile.pronouns ?? "",
                    pronunciation: profile.pronunciation ?? "",
                  }}
                  submitLabel="Save and continue"
                  onSaved={saved => setSavedId(saved.id)}
                />
              )}
            </>
          ) : (
            <AccountsStep
              profileId={savedId}
              canVerify={verification.profileIcon}
              onDone={() => navigate(playerPath(savedId), { replace: true })}
            />
          )}
        </div>
      </RequireAuth>
    </PageShell>
  );
}

function AccountsStep({
  profileId,
  canVerify,
  onDone,
}: {
  profileId: number;
  canVerify: boolean;
  onDone: () => void;
}) {
  const { data, isPending, error } = useQuery(queries.profileAccounts(profileId));

  return (
    <>
      <p className="mb-1 font-heading text-xs text-brand">Step 2 of 2</p>
      <h1 className="font-display text-[28px] text-text-bright">
        ADD YOUR RIOT ACCOUNTS
      </h1>
      <p className="mt-2 max-w-[620px] text-sm text-text-secondary">
        Linking your Riot accounts helps scouting and roster staff. You'll need to verify your main account to be eligible for rosters.
      </p>
      <p className="mt-1.5 max-w-[620px] text-xs text-text-dim">
        Already have an OP.GG multisearch link for your accounts? Paste it in to add them all at once.
      </p>

      {isPending ? (
        <p className="mt-6 text-text-dim">Loading your accounts…</p>
      ) : error ? (
        // The step is optional, so a failed read must not trap anybody here: the error is shown and
        // the way out below it still works.
        <ErrorLine message={`Couldn't load your accounts: ${errorMessage(error)}`} />
      ) : data ? (
        <>
          {/* An account can already be attached before setup — signing in with Riot links one
              outright — and leaving it off would read as this page not knowing about it. */}
          {data.accounts.length > 0 && (
            <div className="mt-5">
              <RiotAccountCards accounts={data.accounts} />
            </div>
          )}
          <UnverifiedAccounts accounts={data.unverifiedAccounts} canVerify={canVerify} />
        </>
      ) : (
        <p className="mt-6 text-text-dim">
          Your accounts aren't available right now. You can add them in Settings later.
        </p>
      )}

      <div className="mt-7 border-t border-border pt-5">
        <button type="button" onClick={onDone} className={ACTION_PRIMARY}>
          {data && (data.accounts.length > 0 || data.unverifiedAccounts.length > 0)
            ? "Go to my profile"
            : "Skip for now"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        <p className="mt-2 text-xs text-text-dim">
          Accounts can be added and verified any time in Settings →
          Connections.
        </p>
      </div>
    </>
  );
}
