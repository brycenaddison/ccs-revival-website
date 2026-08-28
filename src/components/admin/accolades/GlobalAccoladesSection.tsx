/**
 * Site Admin → Accolades: the reusable definitions every league may issue.
 *
 * Definitions only. **Issuing** is a league job and lives in League Admin → Accolades, because an
 * occurrence names a team or a set of players in one conference and there is no site-wide issuance
 * endpoint. The schema does permit a site-wide occurrence (`conf: null` — Hall of Fame is the
 * obvious one) and the public profile read already renders it, but no API can create one yet, so
 * there is nothing here for it.
 *
 * A league admin sees the active definitions from this list in their own conference's read and may
 * issue them; this is the only surface that can change them.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { ACTION_PRIMARY, ACTION_SM, ErrorLine } from "../adminUi";
import { Toast } from "../../Toast";
import { DefinitionForm, DefinitionRow } from "./accoladeUi";
import { queries, queryRoots } from "../../../lib/queries";
import {
  createGlobalDefinition,
  errorMessage,
  updateGlobalDefinition,
  type AccoladeDefinition,
  type AccoladeDefinitionInput,
} from "../../../lib/api";

/** Editor target: nothing open, a new definition, or an existing one by id. */
type Editing = { kind: "closed" } | { kind: "new" } | { kind: "existing"; id: number };

export function GlobalAccoladesSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });
  const [saved, setSaved] = useState<string | null>(null);

  const { data, isPending, error } = useQuery(queries.globalAccoladeDefinitions());
  const definitions = data ?? [];

  const save = useMutation({
    mutationFn: (input: AccoladeDefinitionInput) =>
      editing.kind === "existing"
        ? updateGlobalDefinition(editing.id, input)
        : createGlobalDefinition(input),
    onSuccess: async (definition: AccoladeDefinition) => {
      // `accolades` covers this list and every league's issuable set, since a definition retired
      // here has to disappear from the league editors that were offering it. `profiles` is in the
      // same breath because the public profile page carries its own copy of an accolade's name and
      // description, and a rename would otherwise stay stale there for a minute.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.accolades }),
        qc.invalidateQueries({ queryKey: queryRoots.profiles }),
      ]);
      setSaved(`Saved ${definition.name}.`);
      setEditing({ kind: "closed" });
    },
  });

  const target =
    editing.kind === "existing" ? definitions.find(d => d.id === editing.id) ?? null : null;

  if (isPending) return <p className="text-text-dim">Loading definitions…</p>;

  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorLine message={`Couldn't load the definitions: ${errorMessage(error)}`} />}

      {editing.kind === "closed" ? (
        <button
          type="button"
          onClick={() => {
            save.reset();
            setEditing({ kind: "new" });
          }}
          className={ACTION_PRIMARY}
        >
          <Plus size={15} aria-hidden="true" />
          New definition
        </button>
      ) : (
        <DefinitionForm
          // Keyed on the target so opening a different definition resets the fields to that row
          // rather than carrying a half-typed edit across to it.
          key={editing.kind === "existing" ? editing.id : "new"}
          definition={target}
          saving={save.isPending}
          error={save.isError ? errorMessage(save.error) : null}
          onSave={input => save.mutate(input)}
          onCancel={() => setEditing({ kind: "closed" })}
        />
      )}

      {definitions.length === 0 ? (
        <p className="text-text-dim">
          No site-wide definitions yet. A league can still define its own.
        </p>
      ) : (
        <ul>
          {definitions.map(definition => (
            <DefinitionRow key={definition.id} definition={definition}>
              <button
                type="button"
                onClick={() => {
                  save.reset();
                  setEditing({ kind: "existing", id: definition.id });
                }}
                className={ACTION_SM}
              >
                <Pencil size={13} aria-hidden="true" />
                Edit
              </button>
            </DefinitionRow>
          ))}
        </ul>
      )}

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}
