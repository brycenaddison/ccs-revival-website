/**
 * The one editor for player-owned presentation fields.
 *
 * Setup and Settings intentionally share the whole form rather than merely sharing input styles:
 * field limits, the website's all-three-required policy, complete-document writes, cache invalidation
 * and auth refresh are one contract. A second implementation would eventually let one screen save
 * a document the other rejects.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  errorMessage,
  NICKNAME_MAX,
  PRONOUNS_MAX,
  PRONUNCIATION_MAX,
  updateMyProfile,
  type ProfilePresentation,
} from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import { queryRoots } from "../../lib/queries";
import { ACTION_PRIMARY, ErrorLine } from "../admin/adminUi";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";

interface Values {
  nickname: string;
  pronouns: string;
  pronunciation: string;
}

interface Props {
  initial: Values;
  submitLabel: string;
  onSaved?: (profile: ProfilePresentation) => void;
}

const clean = (value: string): string => value.trim();

export function ProfilePresentationForm({ initial, submitLabel, onSaved }: Props) {
  const [values, setValues] = useState(initial);
  const [fieldError, setFieldError] = useState<keyof Values | null>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const pronounsRef = useRef<HTMLInputElement>(null);
  const pronunciationRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { refresh } = useAuth();

  useEffect(() => setValues(initial), [initial.nickname, initial.pronouns, initial.pronunciation]);

  const mutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async saved => {
      await Promise.all([
        refresh(),
        qc.invalidateQueries({ queryKey: queryRoots.profiles }),
      ]);
      onSaved?.(saved);
    },
  });

  const update = (field: keyof Values, value: string) => {
    setValues(current => ({ ...current, [field]: value }));
    if (fieldError === field && clean(value)) setFieldError(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const empty = (Object.keys(values) as (keyof Values)[]).find(field => !clean(values[field]));
    if (empty) {
      setFieldError(empty);
      ({ nickname: nicknameRef, pronouns: pronounsRef, pronunciation: pronunciationRef })[empty].current?.focus();
      return;
    }
    setFieldError(null);
    mutation.mutate({
      nickname: clean(values.nickname),
      pronouns: clean(values.pronouns),
      pronunciation: clean(values.pronunciation),
    });
  };

  return (
    <form onSubmit={submit} className="max-w-[620px]" noValidate>
      <ProfileField
        id="profile-nickname"
        label="Nickname"
        hint="The name shown across CCS. It does not need to match Discord or a Riot ID."
        value={values.nickname}
        maxLength={NICKNAME_MAX}
        error={fieldError === "nickname"}
      >
        <input
          ref={nicknameRef}
          id="profile-nickname"
          value={values.nickname}
          onChange={event => update("nickname", event.target.value)}
          maxLength={NICKNAME_MAX}
          autoComplete="nickname"
          className={CONTROL_CLASS}
          aria-invalid={fieldError === "nickname"}
          aria-describedby="profile-nickname-help"
        />
      </ProfileField>

      <ProfileField
        id="profile-pronouns"
        label="Pronouns"
        hint="For example: they/them, she/her, or he/him."
        value={values.pronouns}
        maxLength={PRONOUNS_MAX}
        error={fieldError === "pronouns"}
      >
        <input
          ref={pronounsRef}
          id="profile-pronouns"
          value={values.pronouns}
          onChange={event => update("pronouns", event.target.value)}
          maxLength={PRONOUNS_MAX}
          autoComplete="off"
          className={CONTROL_CLASS}
          aria-invalid={fieldError === "pronouns"}
          aria-describedby="profile-pronouns-help"
        />
      </ProfileField>

      <ProfileField
        id="profile-pronunciation"
        label="Name pronunciation"
        hint="Write how a caster should say your nickname, such as GLAY-shul."
        value={values.pronunciation}
        maxLength={PRONUNCIATION_MAX}
        error={fieldError === "pronunciation"}
      >
        <input
          ref={pronunciationRef}
          id="profile-pronunciation"
          value={values.pronunciation}
          onChange={event => update("pronunciation", event.target.value)}
          maxLength={PRONUNCIATION_MAX}
          autoComplete="off"
          className={CONTROL_CLASS}
          aria-invalid={fieldError === "pronunciation"}
          aria-describedby="profile-pronunciation-help"
        />
      </ProfileField>

      {fieldError && <ErrorLine message="Nickname, pronouns, and pronunciation are all required." />}
      {mutation.error && <ErrorLine message={errorMessage(mutation.error)} />}

      <button type="submit" disabled={mutation.isPending} className={`${ACTION_PRIMARY} mt-2`}>
        {mutation.isPending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function ProfileField({
  id,
  label,
  hint,
  value,
  maxLength,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  maxLength: number;
  error: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
        <span className="shrink-0 font-mono text-[10px] text-text-dim">{value.length}/{maxLength}</span>
      </div>
      {children}
      <p id={`${id}-help`} className={`mt-1.5 text-xs ${error ? "text-ccs-red" : "text-text-dim"}`}>
        {error ? `${label} is required.` : hint}
      </p>
    </div>
  );
}
