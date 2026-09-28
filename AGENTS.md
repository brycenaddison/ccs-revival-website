# Working in this repo

This is the shared instruction source for all coding agents. `CLAUDE.md` imports this file with
`@AGENTS.md`; keep project guidance here rather than maintaining duplicate instructions.

The CCS website uses Vite, React 19, TypeScript, TanStack Query v5, React Router v6 and Tailwind v4.
The CSS-first theme is in `src/index.css`. The API is the read-only sibling repo
`../tournament-bot`; start with its `docs/API.md` index and follow the feature references.
Do not edit that repository or derive data the API already answers.

## Workflow

- Do not run `pnpm`, `npm`, `node`, `npx` or `ts-node`, including scripts wrapping them.
  Humans run the toolchain. Give exact commands such as `! pnpm build` when validation is needed.
  pnpm is the package manager, pinned in `package.json`; this is a single package.
  There is no general test framework; the SEO scripts have an offline fixture check.
- Start with this map and use targeted searches. Do not spawn subagents or explore `/test/`.
- Do not create a `docs/` directory here. Do not put personal filesystem paths or references
  to standalone deliverables anywhere in the repository, including agent instructions.
- Edit Markdown surgically. Never bulk-format it unless the user explicitly requests that.
- Update this file in the same change when routes, API modules, query families, shared components
  or non-obvious behavior change. Keep the map concise and reuse existing components and helpers.

## Core conventions

- Use US English for prose, comments and identifiers. Never change a wire value or third-party
  vocabulary just to change spelling. Do not introduce em dashes in new text.
- Import API values from `src/lib/api/index.ts`, with one module per area. Module headers explain
  upstream behavior and workarounds. Public reads use `http.ts`; signed-in operations use
  `credentialedRequest`. Map responses defensively, keep absent values null and drop unknown
  enum values rather than repairing them. Mirror API constraints as constants beside the types.
  Ordinary `getList`/`getOne` treat missing routes or null as absence; article archive and sitemap
  inventory reads deliberately validate strictly. Never call `fetch` from a component.
- Dates stay ISO strings until rendering. Preserve served row order unless a documented interactive
  table owns sorting. Do not recalculate rankings or use names as join keys.
- `profileId` is durable identity. Any player name with a usable ID uses `PlayerLink`;
  otherwise render plain content. Reuse `TeamLink`, `ChampionIcon` and profile/account components.
- Every query key/options object lives in `src/lib/queries.ts`. Explain staleness choices and reuse
  owning roots. Mutations invalidate their root; await invalidation when the next step reads it.
  Never mutate in a mount effect: StrictMode can detach the mutation observer and strand pending UI.
  Start mutations from user events in a component that outlives the request; mount-time reads use queries.
- API errors render verbatim through `errorMessage`/`ErrorLine`. Gate league controls with
  `hasScope`; preserve its legacy behavior when the API supplies no effective scope list.
- Reuse `PageShell`, `SectionFrame`, `SettingsRow`, `ACTION*`, `LABEL_CLASS` and `CONTROL_CLASS`.
  Prefer shadcn/ui primitives for controls, adapting them through tokens and preserving their upstream
  structure. Modal, layered and focus-trapped UI uses shared Radix wrappers, never handmade overlays,
  `window.confirm` or `window.alert`. Destructive confirmation uses `ConfirmButton`.
- Tailwind utilities use theme tokens; raw colors and inline color styles are only for established
  data-driven branding/stat visualizations. CCS `brand` is red; shadcn `accent` is the hover
  surface. `primary`/`destructive` share a hue, so distinguish actions by treatment, not hue alone.
  Map sides use `side-blue`/`side-red`. Support both themes.
- Geist and Geist Mono are self-hosted. Use role tokens `font-display`, `font-heading`, `font-body`
  and `font-mono`, never family names or `font-variation-settings` in components.
  Section headings use `font-display text-[22px] text-text-bright`; nav/captions use
  `font-heading text-sm`. Roles own tracking. Use sentence case, no uppercase treatment or
  `.toUpperCase()` except actual acronyms. A canvas reads fonts through `useThemeColors`.
- Real navigation uses `Link` and `aria-current`, not tablist semantics. Use the JS mobile
  breakpoint from `useWindowSize` when layouts truly differ. The `nav:` breakpoint belongs
  only to navigation, not content.
- Images use `components/ImageUpload.tsx` and its picker hook/button. Store URLs; the shared
  `api/uploads.ts` boundary owns file types, the 5 MB limit and upload errors. Markdown body
  fields use `content/MarkdownEditor.tsx`, not a separate textarea or file picker.
- Comment why a workaround or invariant exists, not what the adjacent code does.
  Placeholders use `ComingSoon({ needs })` and name the missing endpoint.

## Routes, navigation and layout

- `src/main.tsx` owns providers and routes. Public data tabs use `SiteLayout ticker`; ordinary
  pages, including teams, match, game and register, use `SiteLayout`. Only login uses
  `BareLayout`. Home is eager; other pages are lazy. Profiles are `/players/:profileId`;
  first-time identity setup is `/setup`.
- `components/layout/SiteLayout.tsx` owns ticker, nav, footer, mobile bar and Suspense.
  `PageShell.tsx` publishes page width/extra bottom padding; pages never mount the ticker.
  The inner content scroller must stay `relative` so hidden absolute inputs/menu triggers cannot
  escape its overflow boundary. Keep flex/grid children shrinkable and overflow inside the page.
  Scroll the actual content container, not the window. `FullBleedScroller` uses the nearest
  scrolling ancestor's client width; `ScrollRail` supplies shared horizontal scrolling.
- `RouteErrorBoundary.tsx` resets by pathname; stale chunk recovery reloads once. The deployment
  retains old hashed assets for seven days so open tabs survive a release.
- `lib/tabs.ts` and season-link helpers own navigation. NavBar's desktop/mobile CCS logo links
  Home with the current season and closes the mobile menu. News is seasonless; its links
  drop conf and its nav hides the season picker.
- `components/auth/SetupGate.tsx` is the route-tree hard gate for incomplete signed-in profiles.
  Keep the setup flow mounted through its second step until explicit navigation.
  `lib/authContext.tsx` owns cookie identity/OAuth; `api/auth.ts` maps `/auth/me`,
  including nickname, pronouns, pronunciation and `setupRequired`.
- `auth/UserMenu.tsx` + `AuthControl.tsx` share desktop/mobile account actions. Join CCS uses
  `DISCORD_INVITE` from `lib/siteLinks.ts`; Apply Now links to `/register` while
  applications are open (public home flag for anonymous visitors, open-seasons read when signed in).
  `useHasInvitations` offers Team Invitations for a nonempty inbox,
  including answered invitations; the private query is keyed by viewer profile ID. Keep the
  bot-linked `/team-invitations` route stable. `useHasLiveApplication` gates My Applications.

## Search and shared controls

- `components.json` configures shadcn (Radix/new-york, Tailwind v4). Humans add primitives
  with `pnpm exec shadcn add <component>`. `@/` resolves to `src/`; generated imports use
  `@/lib/cn`, never the unrelated npm `cn` package. Preserve CCS theme mappings.
- `components/search/SiteSearch.tsx` mounts one provider/dialog and Ctrl/Cmd+K handler per
  SiteLayout, with lazy `SearchResults.tsx`. Triggers serve desktop, mobile bottom bar and
  hamburger dropdown; mobile's top row has no search. Opening search closes the hamburger, and its
  dropdown trigger restores focus to the hamburger button. Keep the dialog outside that dropdown.
  Preserve bottom-bar spacing/`--bottom-nav-h`; editable fields and other dialogs retain shortcuts.
- `ui/command.tsx` wraps cmdk with theme tokens and keeps generated exports/data slots.
  Shared `DialogContent` leaves geometry and close controls to callers and uses CCS 300/301 layers;
  `CommandDialog` adds its centered geometry. `CommandLinkItem.tsx` activates real
  Link/PlayerLink/TeamLink anchors on Enter. Those links forward props/refs; stop click propagation
  so keyboard activation cannot recurse.
- Search shortcuts reuse `TABS`, season links and `accountMenuEntries` with existing permissions.
  `SHORTCUT_LABELS` supplies League Info/Content Management labels and filtering vocabulary.
  Public links are under Pages, account links under Your Pages, privileged links under Admin; hide
  empty groups. Appearance offers Toggle Dark Mode. Search omits Join CCS/Apply.
  `lib/theme.ts` owns preference/toggling/iframe notifications; `useThemeColors` observes
  `data-theme`. There is no separate nav theme button.
- `queries.publicTeams` searches across listed seasons. `publicPlayerSearch` merges ordinary
  and Riot-mode search by profile ID without conf or roster-derived IDs. Public keys are separate
  from editor lookups; `RequestOpts.anonymous` omits cookies even on same-origin credentialed
  team reads. Wait for two characters, debounce players, never show an earlier term's results or
  locally re-filter server identity matches. Preserve order and disclose result caps.
- `ui/color-picker.tsx` is re-exported as `ColorField` from `admin/adminUi.tsx`.
  Its react-colorful canvas/hue/hex controls commit only opaque six-digit hex. Expand three-digit
  shorthand on blur and reset incomplete input. Keep the API's pure-black `intFromHex` nudge
  and forms' live `TeamStylePreview`.

## Articles and Markdown

- `components/content/ArticlesSection.tsx` switches between filtered list and ArticleEditor.
  Focus the entered heading without scrolling, then reveal it with `block: "nearest"` only if
  offscreen. Never align the whole form to the top. Back/Cancel preserves the list filter.
  The open record is independent of the filtered list; saves return the full record and forms are
  keyed by identity so publish/unpublish/list refresh does not close or reset an editor.
- `content/MarkdownEditor.tsx` is shared CodeMirror: document size (preferred 420 px) for
  article/Info, notes size (320 px) for application notes. It owns Write/Preview, vertical resizing
  and Radix fullscreen. Split requires 960 px of editor width, otherwise falls back to Write.
  Parents own saves and presets; keep editor imports lazy.
- `content/markdown/useMarkdownSession.ts` preserves state/history/selection across remounts,
  view changes and parent echoes. External replacements/`resetKey` clear history and insertion
  bookmarks. Key forms by record/conf; presentation changes wait for IME composition.
  Image/link/table bookmarks map through intervening edits and collapse when selected text changes.
  Reset/unmount invalidates late upload completion. Images insert inline without extra whitespace,
  with the caret in description brackets. Capture `openForInsertion`'s callback before opening the
  native picker; keep `useImagePicker` mounted across presentation changes.
- `content/markdown/commands.ts` is the toolbar/shortcut/context-menu command registry.
  Formatting has isolated undo steps; inline formatting is per paragraph, line operations preserve
  indentation, existing code blocks disable formatting. `MarkdownContextMenu.tsx` forwards to an
  inert Radix trigger; wrapping the source suppresses native touch selection. Shift+right-click
  bypasses it. Menu commands run after close for focus restoration, except Image opens in the
  direct user gesture. Primary toolbar controls stay visible and wrap; More contains only inline
  code, block quote, code block, table and horizontal rule. Heading options share styling.
  `TableSizePicker.tsx` shares an 8x8 pointer/keyboard grid in a Popover; dimensions include the
  header row. CodeMirror styling is scoped Tailwind; overriding unlayered defaults needs importance.
- `components/Markdown.tsx` is the sole renderer for articles, Info, application notes and
  previews. Raw HTML stays disabled. Exact image title `width=N` (1–9999) sets display width,
  capped by container with automatic height; other titles remain tooltips.
  `src/typeset.css` is imported unedited. Rhythm belongs in `index.css` presets, not individual
  rendered elements. Only Markdown output gets `.typeset`. Article output/previews cap the entire
  body, including tables/images, at `--container-article` (760 px), with SiteLayout padding
  (12 px mobile/32 px desktop). Notes use a paragraph-only 75ch cap.
- `pages/Article.tsx` + `news/ArticleLink.tsx`: native articles render public Markdown at
  `/news/:slug`; link articles send readers off-site and have no full local body.
  `api/articles.ts` owns reads/writes; published detail supplies title, subtitle, author,
  image and timestamps. Author names imply no profile ID. Show updated dates when later than publication.
- `pages/News.tsx` is an all-seasons archive at `/news` and `/news/page/:page`.
  Show 24 articles in served order; request 25 at offset `(page - 1) * 24` for lookahead.
  Use crawlable previous/next links and no previous-page placeholder data. Redirect page 1 to
  `/news`; invalid or empty later pages use noindex.

## SEO

- `src/lib/seo/` owns URL policy, metadata, excerpts/JSON-LD and sitemap output.
  `components/seo/MetadataProvider.tsx` is the only client head writer, outside SetupGate/lazy
  routes. Overrides are keyed by navigation identity; navigation clears stale tags, dates, image
  dimensions and JSON-LD. Private/unknown routes and content error states use client noindex.
- Season/profile canonicals retain conf; news ignores it and tracking. `VITE_SITE_ORIGIN` is
  validated HTTPS with the public CCS origin as fallback, never the browser host.
  Vite fills the shell's CCS_METADATA marker with generic Open Graph/Twitter tags and the 512 px
  CCS logo. The shared shell has no canonical, og:url, noindex or homepage JSON-LD.
- `queries.publicTeamDetail` is anonymous and separate under the teams root; TeamPage uses it
  for public body/metadata while staff panels retain their read. Sessions may expose unpublished
  teams, so public metadata must omit cookies. Player artwork uses ProfileHeader's primary verified
  account. Tournament codes never enter metadata.
- `scripts/generate-sitemap.ts` imports pure `api/publicArticleInventory.ts` directly to
  avoid browser API initialization. Strict anonymous 50-row reads omit conf and require two
  matching complete inventories. HTTP/shape/duplicate/order/unstable-inventory failures abort before
  deployment. Only native articles, archive pages and explicit landing pages enter the sitemap.
  No body reads, lastmod, priority or changefreq.
- Humans run `pnpm seo:check` (offline fixtures, Node 24), `pnpm build`, and
  `pnpm build:production` for live generation. CI is offline; production generates XML/text
  before rsync. Sitemap freshness depends on deployment; there is no content scheduler.
- `Home.tsx` leads with news and competition, without a promotional introduction. Participation
  guidance lives below the league-specific documents on `Info.tsx`, outside their loading/error
  branches: North America, teams register together, and eligibility, schedules and fees vary by
  league/season. Reuse its quick links for applications and the optional Discord invite.
- Rendering/hydration, automatic refresh, staged releases and request-time metadata are deferred.
  `createRoot` and SetupGate remain. Future prerendering must handle browser globals in
  `useWindowSize`/`useThemeColors`, PageShell's layout effect and relative dates. A generated
  homepage needs a separate SPA fallback to avoid leaking its canonical/body/hydration to other
  routes. The API has no complete public profile inventory; roster IDs are not a substitute.

## Seasons and league administration

- `api/league.ts` selects current conferences from active flags, then the newest listed
  tournament only if none is flagged. There is no environment pin. `activeSource` stays
  `flagged`/`newest`; schedule feeds send explicit conf only for the client fallback.
- Concurrent divisions use `codename`, not shared season `shortname`. `lib/leagueAdapters.ts`
  owns `groupLabels` (codename, full name, conf fallback); feed labels use codename/shortname/league.
  Historical profile labels use full names.
- `listed` controls public discovery, `applicationsOpen` intake, and `active` default feeds.
  Public `GET /tournaments` is listed-only. Admin pickers use `queries.adminLeagues` so
  hidden drafts remain editable. Session-scoped reads can reveal unpublished data; never mix their
  cache with anonymous public reads.
- Publishing approved application rosters creates teams/updates timestamps, not public flags; it
  can repeat while intake continues. Site-admin listing requires teams, sets listed/active and
  closes intake. Only the list command makes a season public; edits permit `listed: false` to
  hide it. Intake toggling is site-admin only. League roster staff read `applicationIntake`
  for listed/applicationsOpen/teamsPublishedAt and cannot change them or infer them from public lists.
- `api/seasonView.ts` reads public resolved `GET /:conf/season`, excluding unpublished phases.
  `api/season.ts` reads site-admin structure `GET /:conf/phases`, preserving nulls meaning
  inherit. They are not interchangeable: an editor using resolved values turns inheritance into overrides.
- `pages/LeagueAdmin.tsx` filters section registries before SettingsShell. Info, Applications and
  Accolades need league admin; Teams needs roster; Schedule/Bracket need schedule; site admins see all.
  Hidden direct links redirect to the first allowed section; no allowed sections shows a notice.
  The API permits roster on application review, while this UI requires admin; UI filtering is not
  an authorization boundary. Do not link ordinary league staff to inaccessible site-admin controls.
- `SettingsShell` renders section registries for profile, site and league areas; add sections
  through their registry. Shared area links live in `lib/settingsAreas.ts`.
  `RequireAuth` treats `allow: null` as loading, not denied.
- `league/info/InfoSection.tsx` edits a whole Info document. Preserve `applicationBody` on
  Info saves, and preserve other fields when application notes save; invalidate both relevant roots.
  `rulebookUrl` is required and prepended as the first public quick link, keeping remaining link
  order. The open-seasons endpoint supplies rulebook/applicationBody before Info publication.
  `pages/Info.tsx` renders selected conferences but never applicationBody.
- Accolade definition forms are shared by global site-admin management and league issuance.
  Writes invalidate accolades and profile roots.

## Team applications and roster identities

- `components/apply/` is the shared applicant UI. Register starts applications; My Applications
  resumes existing ones across open seasons using per-conf queries, omitting empty sections.
  Both reuse `ApplicationCard`. Team Invitations is the other half of the workflow.
- Authority follows `submittedByProfileId`, not the owner role. Readiness has no owner blocker:
  require two contacts and verified Riot accounts for every starter/sub, not nonplaying contacts/owners.
  The local checklist is guidance; the API's submit 409 is authoritative.
  `rulesAcknowledged`/`ticketOpened` in applicationMetadata are client confirmations;
  nothing on the site verifies a Discord ticket.
- `ApplicationForm.tsx` shares create/replace and preserves the strict seven-key document and
  applicationMetadata on whole-document PUT. Withdraw deletes an application; there is no withdrawn
  UI state, and the mapper filters legacy withdrawn rows.
- `applyUi.tsx` owns labels/statuses, details, headers and `RankChip`. Keep Unverified,
  Rank pending, Unranked and rank distinct; chips are cached, not live Riot lookups.
  Substitute ordinals are internal, position is single-choice, and re-inviting by profileId updates
  roles. Hide revoked members from applicants, retain declined members; reviewers see both.
  `useApplicationConfName` uses application payload names because public league lists omit drafts.
- `admin/applications/ImportApplicationsSection.tsx` uses site-admin import routes to create a
  submitter-owned draft. Pending invitations appear immediately in inboxes without sending DMs.
  Sending invitations is a separate explicit confirmation; do not invent a staged status or second
  review queue. `api/adminApplications.ts` shares `mapApplication` with applicant/reviewer reads.
- `admin/applications/PersonPicker.tsx` combines public profiles and site-admin guild search,
  carrying PersonIdentity until import resolves Discord IDs. Profile results can lack Discord;
  missing cached handles prove nothing. Its guild route cannot serve league staff with roster-only
  grants. Shared result UI does not change import's deferred profile creation.
- `components/players/` owns PlayerPicker/PlayerSlot/PlayerList with required profile/riot/discord
  modes and typed external adapters. `PlayerIdentity.tsx` owns labels, badges, avatar fallbacks
  and result rows. Selected names use PlayerLink; result buttons never nest links. Hide profile
  numbers and snowflakes; Discord context is @handle. Nameless fallbacks are Unnamed player or
  Unnamed Discord member, never IDs.
- Riot mode previews verified accounts; complete Riot IDs always offer explicit lookup alongside
  profile matches. Failed acceptance requires fresh preview; never fall back to expectation-free
  resolution. Display primaryRiotId separately from matchedRiotIds and never assume a match is primary
  or load accounts per result. Discord mode preserves independent source errors. There is no picker
  league-membership checkbox; the accolade conference filter is separate.
- `league/teams/TeamsSection.tsx` uses Riot mode for starters/subs and Discord for owner/contacts.
  `useRosterPlayerSources.ts` owns authorization, private query cleanup and resolver invalidation.
  `rosterInput` is ID-only for writes/dirty checks; refreshed summaries update presentation by ID
  without replacing unsaved identities/order. Retain legacy selections; mobile logo/name has its own row.
- `api/teamAdmin.ts` owns team writes and roster adapters. Private lookups are no-store,
  viewer/conf keyed, zero retention and no automatic retry. Public profile-search keys include mode.
  Discord wire group website maps to profiles; guild results carry nested profile presentation.
  The sibling API implements create/edit, Riot preview/acceptance and Discord resolution; deployment
  must be verified, and primary-Riot-ID enrichment is not assumed available.
- `api/playerSummary.ts` shares PlayerSummary mapping across search, resolution and roster
  slots. Preserve API-selected avatars/sources/verification; missing fields become null/false.
  `profiles.ts` exports account mapping for previews. Upstream
  `database/profiles/riotAccounts.ts` has batched cached details; never call live Riot per search hit.

## Profiles and account settings

- `api/profiles.ts` owns presentation constraints/writes, career/account reads and targeted
  refresh. `ranked: []` means unranked; `ranked: null` means unavailable. Refresh keeps cached
  data visible and distinguishes every status. Profile documents/accounts share queryRoots.profiles,
  with one-minute document and ten-minute account freshness.
- Career teams use full TeamRecord/mapTeamRecord; opponents use compact TeamMetadata plus
  opponentCode. Lane matchups stay per-conf in the API mapper and are keyed by conf/profileId.
  Accolades remain career-wide even when conf scopes statistics.
- `pages/PlayerProfile.tsx` renders the public cross-season profile from one payload and map
  lookups, never extra join fetches. Preserve served totals/bests/breakdowns/order.
  Both rail/wide columns need min-w-0; game-grid overflow stays inside its scroller, never the
  document. Career tiles do not repeat header games/record/win rate/KDA.
- `profile/profileUi.tsx` owns RailCard/ProfileSection, TeamLogo/TeamChip, useConfLabel and
  numeric helpers. All KDA goes through kdaText (Infinity means Perfect). Only win rate/KDA use
  stat color scales; win/loss row tints match MatchResultList.
  `MatchupCard.tsx` may sum opponent counts across conferences but shows gd14 only for a single
  contributing league, since its averaging denominator is not served.
- `profile/MatchHistory.tsx` joins games through matches[].gameIds. Keep API series order and
  G1-first games. Both teams and score are separate link targets; team chip hitboxes hug names.
- `profile/RiotAccountCards.tsx` renders the highest-ranked verified account tall, others compact.
  `primaryAccount`/`rankScore` own ranking; tierLabel hides meaningless apex I. Peak rank is not
  available because no history is stored. ProfileHeader uses the primary verified account's icon.
  Exported RiotAccountCard also serves single-account previews. Claims in unverifiedAccounts cannot
  establish roster identity or verification.
- `profile/ProfilePresentationForm.tsx` is the only nickname/pronouns/pronunciation editor,
  shared by Setup and Settings. All three are required despite nullable legacy API values.
  `settings/profile/AccountSection.tsx` adds read-only Discord identity;
  `ConnectionsSection.tsx` owns linked Riot accounts.
- `settings/profile/UnverifiedAccounts.tsx` + `IconVerification.tsx` implement claims and icon
  proof. Store the 15-minute challenge, 10-second cooldown and 30-check limit as wall-clock state.
  Riot's copy can lag about two minutes; pending after a save is expected and copy must keep saying
  to wait. Preserve an unexpired challenge, including exhausted state, rather than silently restarting.
  `lib/riot/verificationIcons.ts` supplies English client names for IDs 0–28 from Community
  Dragon; unknown IDs fall back to artwork, and known names survive artwork load failures.

## Matches, schedules and games

- `pages/MatchDetail.tsx` + `match/TournamentCodes.tsx` render API tournament codes below the
  header in served game order. `api/feed.ts` result reads send the session with no-store;
  queries.matchResult is keyed by viewer ID with zero retention. Omitted codes render nothing.
  `api/schedule.ts` shares mapMatchCode with admin reads; `CopyAction.tsx` owns copy feedback.
- `home/UpcomingSchedule.tsx` takes the first viewer fixture from the five served upcoming
  matches. Reuse queries.teamsForConf and join teams by conf/code; `lib/roster.ts`'s teamMembers
  includes starters, subs, contacts and owners and is also used by delivery reports.
  Anonymous/nonmember viewers get no extra card. Remove the featured fixture by feedMatchKey and
  hide an empty remainder. UpcomingMatchCard shows team badges/names, phase, relative match day and
  best-of; only that card checks viewer-scoped tournament-code availability. No draft URL is served;
  never infer one from a code.
- `league/schedule/CodeDeliveryControl.tsx` shares day/match Discord actions and reports.
  sendDayCodes/sendMatchCodes POST an empty object and do not mint codes. A 409 not_ready means
  nothing sent; show readiness issues. HTTP 200 may have partial failures, so retain every recipient
  status. Explicit retries skip successes; unknown/in_progress need inspection, not automatic retry.
  Delivery changes no read model. Key DayPanel by conf/day so reports cannot follow another selection.
- `match/TeamMatchHistory.tsx` uses served scheduleMatchId/phase without an extra schedule read;
  legacy matching falls back to seasonDay/opponent. Match result rows keep a consistent grid and
  contained overflow. SeriesTotals computes rates from totals, not averages of rates.
  BanIcons preserves -1 as no ban and passes ChampionIcon both ID and source; SeriesGameCard labels
  each team's Victory/Defeat.
- `pages/GameDetail.tsx` and `components/game/` render the match/timeline/context reads.
  Shared RiotIcons/ChampionIcon handle assets; RiotText tokenizes supported markup rather than
  injecting HTML. Scoreboard density templates use subgrid, responsive name columns and inner
  scrolling floors; preserve shared timeline selection state.
  `lib/gameAssets.ts`/`hooks/useGameAssets.ts` supply Community Dragon item/spell lookups.
- `lib/game/events.ts` + `game/timeline/EventText.tsx`: DRAGON_SOUL_GIVEN with teamId 0 means
  the map became an elemental Rift and has no side. TeamId 100/200 means that side claimed the Soul.

## Season day is internal

`seasonDay` is a join key, never a new reader-facing label. Use served `PhaseRef` and
`api/phaseRef.ts`'s `placementLabel`: bracket round number first, then served round name;
matchDay is relative to its phase. Otherwise use the kickoff date. Do not infer phases, semifinal
labels or bracket depth. Keep existing explicit legacy/admin/stat-column exceptions confined to
their current callers; never extend them to new public surfaces.
