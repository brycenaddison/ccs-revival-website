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
import { toast } from "sonner";
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
import { fmtKickoff, timeAgo } from "../../lib/utils";
import { ConfirmButton } from "../ConfirmButton";
import { DateTimePicker } from "../DateTimePicker";
import { SettingsRow } from "../settings/SettingsSection";
import { ErrorLine, stateNote } from "./adminUi";
import { LABEL_CLASS } from "../stats/FilterBar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  info: "Info — the usual notice",
  warning: "Warning — needs attention",
  critical: "Critical — something is wrong",
};

type Selection = null | "new" | number;

export function AnnouncementsSection() {
  const [selected, setSelected] = useState<Selection>(null);

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
      <div className="flex items-center justify-between mb-2">
        <h3 className={LABEL_CLASS}>Banners</h3>
        <Button type="button" variant="quiet" size="inline" onClick={() => setSelected("new")}>
          <Megaphone size={12} aria-hidden="true" />
          New banner
        </Button>
      </div>

      <p className="text-text-dim text-xs mb-4 leading-relaxed">
        The newest active banner inside its window is the one that shows, and a league-specific one
        beats a site-wide one. So posting a new banner replaces what is up — the old row stays here
        as history. To take one down with nothing behind it, switch it off.
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : isPending ? (
        <div className="flex justify-center py-6">
          <Spinner aria-label="Loading banners" />
        </div>
      ) : rows.length === 0 ? (
        <Empty className="p-6 md:p-6">
          <EmptyHeader>
            <EmptyTitle>No banners yet.</EmptyTitle>
          </EmptyHeader>
        </Empty>
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
                  <span className="font-heading ">{a.level}</span>
                  <span>· {a.conf ?? "site-wide"}</span>
                  <span>· {timeAgo(a.createdAt)}</span>
                  {a.endsAt && <span>· until {fmtKickoff(a.endsAt)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.id === liveId && <Badge>Live now</Badge>}
                {!a.active && <Badge variant="muted">Off</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}

      {(selected === "new" || editing !== null) && (
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[18px] text-text-bright mb-4">
            {selected === "new" ? "New banner" : "Edit banner"}
          </h3>
          <AnnouncementForm
            key={selected === "new" ? "new" : editing?.id}
            announcement={editing}
            onSaved={message => {
              toast.success(message);
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
  /*
   * `GET /admin/leagues` rather than the public list: an announcement is often the thing that tells
   * people a season is coming, and the conference it is about is unlisted right up until the teams
   * are published. Scoping one to a hidden league is also harmless — the banner is only rendered on
   * that league's own pages, which nobody can reach yet.
   */
  const { data: leagues } = useQuery(queries.adminLeagues());
  const tournaments = leagues ?? [];
  const isNew = announcement === null;

  const [message, setMessage] = useState(announcement?.message ?? "");
  const [level, setLevel] = useState<AnnouncementLevel>(announcement?.level ?? "info");
  const [linkUrl, setLinkUrl] = useState(announcement?.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(announcement?.linkLabel ?? "");
  const [conf, setConf] = useState(announcement?.conf ?? "");
  const [active, setActive] = useState(announcement?.active ?? true);
  // ISO instants as served, so an untouched window compares equal to the row it came from.
  const [startsAt, setStartsAt] = useState<string | null>(announcement?.startsAt ?? null);
  const [endsAt, setEndsAt] = useState<string | null>(announcement?.endsAt ?? null);

  const trimmed = message.trim();
  const windowProblem = windowError(startsAt, endsAt);

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
    if (startsAt !== announcement.startsAt) out.startsAt = startsAt;
    if (endsAt !== announcement.endsAt) out.endsAt = endsAt;
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
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
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
        {field => (
          <Textarea
            {...field}
            rows={3}
            value={message}
            maxLength={MESSAGE_MAX}
            onChange={e => setMessage(e.target.value)}
            placeholder="Signups for the summer split are open."
          />
        )}
      </SettingsRow>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="Level">
          {field => (
            <NativeSelect {...field} value={level} onChange={e => setLevel(e.target.value as AnnouncementLevel)}>
              {ANNOUNCEMENT_LEVELS.map(l => (
                <NativeSelectOption key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </SettingsRow>

        <SettingsRow label="League" hint="Site-wide shows on every league's page.">
          {field => (
            <NativeSelect {...field} value={conf} onChange={e => setConf(e.target.value)}>
              <NativeSelectOption value="">Site-wide</NativeSelectOption>
              {tournaments.map(t => (
                <NativeSelectOption key={t.conf} value={t.conf}>
                  {t.shortname ?? t.name}
                  {stateNote(t)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </SettingsRow>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="Link">
          {field => (
            <Input
              {...field}
              value={linkUrl}
              maxLength={LINK_URL_MAX}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://ccsesports.org/register"
            />
          )}
        </SettingsRow>
        <SettingsRow label="Button text" hint='Defaults to "Learn more".'>
          {field => (
            <Input
              {...field}
              value={linkLabel}
              maxLength={LINK_LABEL_MAX}
              onChange={e => setLinkLabel(e.target.value)}
              placeholder="Sign up"
            />
          )}
        </SettingsRow>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="Starts" hint="Not set means immediately.">
          {field => <DateTimePicker {...field} value={startsAt} onChange={setStartsAt} placeholder="Immediately" />}
        </SettingsRow>
        <SettingsRow label="Ends" hint="Not set means it runs until switched off or replaced." error={windowProblem}>
          {field => <DateTimePicker {...field} value={endsAt} onChange={setEndsAt} placeholder="No end" />}
        </SettingsRow>
      </div>

      <SettingsRow label="Active">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
          <Checkbox checked={active} onCheckedChange={v => setActive(v === true)} />
          Eligible to show
        </label>
      </SettingsRow>

      <ErrorLine message={failure ? errorMessage(failure) : null} />

      <div className="flex items-center gap-2 mt-6 pt-5 border-t border-border">
        <Button type="submit" disabled={!canSave || !dirty || save.isPending}>
          {save.isPending ? "Saving..." : isNew ? "Post" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>

        {!isNew && (
          <div className="ml-auto">
            <ConfirmButton
              title="Delete this banner?"
              description="The row is removed permanently, along with its place in this history."
              confirmLabel="Delete"
              onConfirm={() => remove.mutate()}
              disabled={remove.isPending}
              trigger={
                <Button type="button" variant="destructive" size="sm" disabled={remove.isPending}>
                  <Trash2 size={13} aria-hidden="true" />
                  {remove.isPending ? "Deleting..." : "Delete"}
                </Button>
              }
            />
          </div>
        )}
      </div>
    </form>
  );
}
