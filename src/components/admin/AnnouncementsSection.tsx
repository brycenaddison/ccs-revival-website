/**
 * The home-page banner editor — `/admin/announcements`.
 *
 * Site admin rather than `content`, matching the API: a banner is an operational control that
 * renders above everything else, not editorial copy.
 *
 * **Which banner shows is not a field on any row.** Upstream's `current()` picks the newest active
 * one inside its window, preferring a conf-specific banner over a site-wide one. That rule is
 * invisible from a list of rows, which is why this screen does two things a plain CRUD list would
 * not: it states the rule in prose, and it marks the live row by asking `/home` rather than by
 * re-deriving the rule here. Re-deriving it would eventually disagree with the server, and the
 * disagreement would look like a bug in the banner rather than in this badge.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Trash2 } from "lucide-react";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  windowError,
  errorMessage,
  ANNOUNCEMENT_LEVELS,
  LINK_LABEL_MAX,
  LINK_URL_MAX,
  MESSAGE_MAX,
  type Announcement,
  type AnnouncementCreate,
  type AnnouncementLevel,
  type AnnouncementUpdate,
} from "../../lib/api";
import { queries, queryRoots } from "../../lib/queries";
import { useLeague } from "../../lib/leagueContext";
import { fmtKickoff, fromLocalInput, timeAgo, toLocalInput } from "../../lib/utils";
import { Toast } from "../Toast";
import { SettingsRow } from "../settings/SettingsSection";
import { ACTION, ACTION_PRIMARY, ACTION_QUIET, ACTION_SM_DANGER, ErrorLine, Pill } from "./adminUi";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";

const LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  info: "Info — the usual notice",
  warning: "Warning — needs attention",
  critical: "Critical — something is wrong",
};

type Selection = null | "new" | number;

export function AnnouncementsSection() {
  const [selected, setSelected] = useState<Selection>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isPending, error } = useQuery(queries.announcements());
  const rows = data ?? [];

  // The server's own answer to "which one is showing", not a re-derivation of its rule. Site-wide
  // (no conf) because that is the banner a reader with no season selected sees.
  const { data: homeData } = useQuery(queries.home());
  const liveId = homeData?.announcement?.id ?? null;

  const editing: Announcement | null =
    typeof selected === "number" ? (rows.find(r => r.id === selected) ?? null) : null;

  return (
    <div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-2">
        <label className={LABEL_CLASS}>Banners</label>
        <button type="button" className={ACTION_QUIET} onClick={() => setSelected("new")}>
          <Megaphone size={12} />
          New banner
        </button>
      </div>

      <p className="text-text-dim text-xs mb-4 leading-relaxed">
        The newest active banner inside its window is the one that shows, and a league-specific one
        beats a site-wide one. So posting a new banner replaces what is up — the old row stays here
        as history. To take one down with nothing behind it, switch it off.
      </p>

      {error ? (
        <p className="text-ccs-red text-sm" role="alert">
          {errorMessage(error)}
        </p>
      ) : isPending ? (
        <p className="text-text-subtle text-sm py-6 text-center">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-text-dim text-sm py-6 text-center">No banners yet.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden mb-6">
          {rows.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              aria-current={selected === a.id ? "true" : undefined}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 bg-transparent border-0 cursor-pointer ${
                i > 0 ? "border-t border-border" : ""
              } ${selected === a.id ? "bg-bg-input" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-bright m-0 truncate">{a.message}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-text-dim">
                  <span className="uppercase font-heading tracking-wider">{a.level}</span>
                  <span>· {a.conf ?? "site-wide"}</span>
                  <span>· {timeAgo(a.createdAt)}</span>
                  {a.endsAt && <span>· until {fmtKickoff(a.endsAt)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.id === liveId && <Pill>Live now</Pill>}
                {!a.active && <Pill muted>Off</Pill>}
              </div>
            </button>
          ))}
        </div>
      )}

      {(selected === "new" || editing !== null) && (
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[18px] text-text-bright tracking-widest mb-4">
            {selected === "new" ? "NEW BANNER" : "EDIT BANNER"}
          </h3>
          <AnnouncementForm
            key={selected === "new" ? "new" : editing?.id}
            announcement={editing}
            onSaved={message => {
              setToast(message);
              setSelected(null);
            }}
            onCancel={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------- form

interface FormProps {
  announcement: Announcement | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

function AnnouncementForm({ announcement, onSaved, onCancel }: FormProps) {
  const qc = useQueryClient();
  const { tournaments } = useLeague();
  const isNew = announcement === null;

  const [message, setMessage] = useState(announcement?.message ?? "");
  const [level, setLevel] = useState<AnnouncementLevel>(announcement?.level ?? "info");
  const [linkUrl, setLinkUrl] = useState(announcement?.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(announcement?.linkLabel ?? "");
  const [conf, setConf] = useState(announcement?.conf ?? "");
  const [active, setActive] = useState(announcement?.active ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInput(announcement?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(announcement?.endsAt));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const trimmed = message.trim();
  const windowProblem = windowError(fromLocalInput(startsAt), fromLocalInput(endsAt));

  const changes = useMemo((): AnnouncementUpdate => {
    if (announcement === null) return {};
    const out: AnnouncementUpdate = {};
    const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

    if (trimmed !== announcement.message) out.message = trimmed;
    if (level !== announcement.level) out.level = level;
    if (nullable(linkUrl) !== announcement.linkUrl) out.linkUrl = nullable(linkUrl);
    if (nullable(linkLabel) !== announcement.linkLabel) out.linkLabel = nullable(linkLabel);
    if (nullable(conf) !== announcement.conf) out.conf = nullable(conf);
    if (active !== announcement.active) out.active = active;
    if (fromLocalInput(startsAt) !== announcement.startsAt) out.startsAt = fromLocalInput(startsAt);
    if (fromLocalInput(endsAt) !== announcement.endsAt) out.endsAt = fromLocalInput(endsAt);
    return out;
  }, [announcement, trimmed, level, linkUrl, linkLabel, conf, active, startsAt, endsAt]);

  const dirty = isNew || Object.keys(changes).length > 0;
  const canSave = trimmed !== "" && windowProblem === null;

  const save = useMutation({
    mutationFn: () => {
      if (announcement === null) {
        const input: AnnouncementCreate = {
          message: trimmed,
          level,
          active,
          ...(linkUrl.trim() ? { linkUrl: linkUrl.trim() } : {}),
          ...(linkLabel.trim() ? { linkLabel: linkLabel.trim() } : {}),
          ...(conf.trim() ? { conf: conf.trim() } : {}),
          ...(fromLocalInput(startsAt) ? { startsAt: fromLocalInput(startsAt) } : {}),
          ...(fromLocalInput(endsAt) ? { endsAt: fromLocalInput(endsAt) } : {}),
        };
        return createAnnouncement(input);
      }
      return updateAnnouncement(announcement.id, changes);
    },
    onSuccess: async () => {
      // `home` as well as the list: the public banner is served from `/home`, so an editor that
      // invalidated only its own list would leave the actual banner stale for five minutes.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.announcements }),
        qc.invalidateQueries({ queryKey: queryRoots.home }),
      ]);
      onSaved(isNew ? "Banner posted." : "Banner saved.");
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteAnnouncement(announcement?.id ?? 0),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.announcements }),
        qc.invalidateQueries({ queryKey: queryRoots.home }),
      ]);
      onSaved("Banner deleted.");
    },
  });

  const failure = save.error ?? remove.error;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (canSave && dirty && !save.isPending) save.mutate();
      }}
    >
      <SettingsRow label="Message" hint="Shown as a card at the top of the home page's center column.">
        <textarea
          className={CONTROL_CLASS}
          rows={3}
          value={message}
          maxLength={MESSAGE_MAX}
          onChange={e => setMessage(e.target.value)}
          placeholder="Signups for the summer split are open."
        />
      </SettingsRow>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="Level">
          <select
            className={CONTROL_CLASS}
            value={level}
            onChange={e => setLevel(e.target.value as AnnouncementLevel)}
          >
            {ANNOUNCEMENT_LEVELS.map(l => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </SettingsRow>

        <SettingsRow label="League" hint="Site-wide shows on every league's page.">
          <select className={CONTROL_CLASS} value={conf} onChange={e => setConf(e.target.value)}>
            <option value="">Site-wide</option>
            {tournaments.map(t => (
              <option key={t.conf} value={t.conf}>
                {t.shortname ?? t.name}
              </option>
            ))}
          </select>
        </SettingsRow>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="Link">
          <input
            className={CONTROL_CLASS}
            value={linkUrl}
            maxLength={LINK_URL_MAX}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://ccsesports.org/register"
          />
        </SettingsRow>
        <SettingsRow label="Button text" hint='Defaults to "Learn more".'>
          <input
            className={CONTROL_CLASS}
            value={linkLabel}
            maxLength={LINK_LABEL_MAX}
            onChange={e => setLinkLabel(e.target.value)}
            placeholder="Sign up"
          />
        </SettingsRow>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="Starts" hint="Empty means immediately.">
          <input
            type="datetime-local"
            className={CONTROL_CLASS}
            value={startsAt}
            onChange={e => setStartsAt(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow label="Ends" hint="Empty means it runs until switched off or replaced.">
          <input
            type="datetime-local"
            className={CONTROL_CLASS}
            value={endsAt}
            onChange={e => setEndsAt(e.target.value)}
          />
        </SettingsRow>
      </div>

      <SettingsRow label="Active">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          Eligible to show
        </label>
      </SettingsRow>

      {windowProblem && <p className="text-ccs-red text-sm mt-1">{windowProblem}</p>}
      <ErrorLine message={failure ? errorMessage(failure) : null} />

      <div className="flex items-center gap-2 mt-6 pt-5 border-t border-border">
        <button type="submit" className={ACTION_PRIMARY} disabled={!canSave || !dirty || save.isPending}>
          {save.isPending ? "Saving..." : isNew ? "Post" : "Save"}
        </button>
        <button type="button" className={ACTION} onClick={onCancel}>
          Cancel
        </button>

        {!isNew && (
          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-text-secondary text-xs">Delete permanently?</span>
                <button
                  type="button"
                  className={ACTION_SM_DANGER}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? "Deleting..." : "Delete"}
                </button>
                <button type="button" className={ACTION} onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className={ACTION_SM_DANGER}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
