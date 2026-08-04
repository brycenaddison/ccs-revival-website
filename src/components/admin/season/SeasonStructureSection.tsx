/**
 * Season structure — the Site Admin section over `/tournaments/:conf/phases`.
 *
 * Site-admin only, matching the API: everything under `/phases` guards on the `admin` **role**, never a
 * league grant. The line upstream draws is that reshaping a season is not the same job as running one,
 * so a league admin's schedule editor lives in League Admin and talks to `PATCH
 * /tournaments/schedule/:id` instead.
 *
 * Two screens, one at a time, because the API has exactly two saves: the season page (the phase list)
 * and a phase's contents. Navigating between them is local state rather than a route — a half-finished
 * draft should not survive a URL change, and there is nothing here worth linking to.
 *
 * The league is chosen here rather than inherited, the same way `LeaguesSection` does it: `/admin` is
 * not conf-scoped, so a section under it has to ask.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { Toast } from "../../Toast";
import { ACTION_SM, ErrorLine, Pill } from "../adminUi";
import { PhaseListEditor } from "./PhaseListEditor";
import { GroupPhaseEditor } from "./GroupPhaseEditor";
import { BracketPhaseEditor } from "./BracketPhaseEditor";
import { useLeague } from "../../../lib/leagueContext";
import { queries } from "../../../lib/queries";
import {
  errorMessage,
  isBracketContents,
  isGroupContents,
  type PhaseSummary,
} from "../../../lib/api";

/**
 * Cap for the parts of this section that are a column of fields.
 *
 * The section takes the whole page so the bracket's day strip can, which leaves everything *else* here
 * stretched across whatever monitor it is on — a league picker the width of a 4K screen, phase rows with
 * a foot of space between a label and its input. The bracket is the only thing that wants the width, so
 * it is the only thing that gets it, and this is applied to each of its neighbours.
 */
const FIELD_COLUMN = "w-full max-w-[1200px]";

export function SeasonStructureSection() {
  const { tournaments, loading, error } = useLeague();
  const [conf, setConf] = useState("");
  const [openPhase, setOpenPhase] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // The list arriving after a conf was chosen — or a league deleted elsewhere — falls back to the
  // picker rather than editing a conference that isn't there.
  const selected = tournaments.find(t => t.conf === conf) ?? null;

  if (loading) return <p className="text-text-dim">Loading leagues…</p>;

  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorLine message={`Couldn't load the league list: ${error}`} />}

      <div className="w-full max-w-md">
        <label className={LABEL_CLASS} htmlFor="season-structure-league">
          League
        </label>
        <select
          id="season-structure-league"
          value={selected?.conf ?? ""}
          onChange={e => {
            setConf(e.target.value);
            // A phase id means nothing in another conference, and the API answers 404 for one.
            setOpenPhase(null);
          }}
          className={CONTROL_CLASS}
        >
          <option value="">Choose a league…</option>
          {tournaments.map(t => (
            <option key={t.conf} value={t.conf}>
              {t.name} ({t.conf}){t.active ? " · live" : ""}
            </option>
          ))}
        </select>
      </div>

      {selected === null ? (
        <p className="text-text-dim py-6 text-center">
          Pick a league to edit its phases, groups and brackets.
        </p>
      ) : openPhase === null ? (
        <div className={FIELD_COLUMN}>
          <SeasonPage key={selected.conf} conf={selected.conf} onOpen={setOpenPhase} onSaved={setSaved} />
        </div>
      ) : (
        <PhasePage
          key={`${selected.conf}:${openPhase}`}
          conf={selected.conf}
          phaseId={openPhase}
          onBack={() => setOpenPhase(null)}
          onSaved={setSaved}
        />
      )}

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

/** The phase list. Its own component so the query is remounted per conference rather than refetched. */
function SeasonPage({
  conf,
  onOpen,
  onSaved,
}: {
  conf: string;
  onOpen: (phaseId: number) => void;
  onSaved: (message: string) => void;
}) {
  const phases = useQuery(queries.seasonPhases(conf));

  if (phases.isPending) return <p className="text-text-dim">Loading the season…</p>;
  if (phases.isError) {
    return <ErrorLine message={`Couldn't load the phase list: ${errorMessage(phases.error)}`} />;
  }

  return (
    // Deliberately **not** keyed on `dataUpdatedAt`. That remounts the editor on any refetch, which
    // discards whatever was being typed — and with `refetchOnWindowFocus` on by default, tabbing away
    // and back was enough to do it. The conf key on `SeasonPage` above is the identity that should
    // reset a draft, and the save handler already replaces it with the server's copy.
    <PhaseListEditor
      conf={conf}
      phases={phases.data}
      onEdit={(phase: PhaseSummary) => onOpen(phase.id)}
      onSaved={onSaved}
    />
  );
}

/** One phase's contents. Which editor renders is the phase's stored `kind`, which cannot change. */
function PhasePage({
  conf,
  phaseId,
  onBack,
  onSaved,
}: {
  conf: string;
  phaseId: number;
  onBack: () => void;
  onSaved: (message: string) => void;
}) {
  const doc = useQuery(queries.phaseDocument(conf, phaseId));
  // Team **ids** are what every save here takes; the public listing is where they come from.
  const teams = useQuery(queries.teamsForConf(conf));

  const header = (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} className={ACTION_SM}>
        <ArrowLeft size={13} aria-hidden="true" />
        Season
      </button>
      {doc.data && (
        <>
          <h3 className="font-display text-lg text-text-bright tracking-widest">
            {doc.data.phase.name.toUpperCase()}
          </h3>
          <Pill muted={!doc.data.phase.published}>
            {doc.data.phase.days.from === doc.data.phase.days.to
              ? `Day ${doc.data.phase.days.from}`
              : `Days ${doc.data.phase.days.from}–${doc.data.phase.days.to}`}
          </Pill>
          {!doc.data.phase.published && <Pill muted>Hidden</Pill>}
        </>
      )}
    </div>
  );

  if (doc.isPending || teams.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="text-text-dim">Loading the phase…</p>
      </div>
    );
  }

  if (doc.isError) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorLine message={`Couldn't load the phase: ${errorMessage(doc.error)}`} />
      </div>
    );
  }

  // `!doc.data` rather than `=== null`: the combined pending check above narrows `teams` but not `doc`,
  // so `data` is still possibly undefined here as far as the compiler is concerned.
  if (!doc.data) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="text-text-dim py-6 text-center">
          That phase is gone — deleted, or moved to another league. Go back to the season.
        </p>
      </div>
    );
  }

  const { phase, contents, terminalNodes } = doc.data;

  return (
    <div className="flex flex-col gap-4">
      {header}

      {teams.isError && (
        <ErrorLine
          message={`Couldn't load the team list, so the pickers are empty: ${errorMessage(teams.error)}`}
        />
      )}

      {/* No `dataUpdatedAt` key here either — `PhasePage` is already keyed on conf and phase id, which
          is the identity a draft belongs to. See the note in `SeasonPage`.

          The group editor is capped and the bracket editor is not: a group phase is groups and match
          rows, which is a form, while a bracket is the one thing on this page that has a use for the
          whole monitor. */}
      {isGroupContents(contents) ? (
        <div className={FIELD_COLUMN}>
          <GroupPhaseEditor
            conf={conf}
            phase={phase}
            contents={contents}
            teams={teams.data ?? []}
            onSaved={onSaved}
          />
        </div>
      ) : isBracketContents(contents) ? (
        <BracketPhaseEditor
          conf={conf}
          phase={phase}
          contents={contents}
          terminalNodes={terminalNodes ?? []}
          teams={teams.data ?? []}
          onSaved={onSaved}
        />
      ) : (
        // Unreachable unless the payload is neither shape — a deploy skew rather than a state.
        <ErrorLine message="This phase's contents are in a shape this build doesn't recognise." />
      )}
    </div>
  );
}
