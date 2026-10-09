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
- `lib/utils.ts` owns local clock and ISO conversions for date/time editors (`toLocalClock`,
  `fromLocalClock`). Empty values mean null; never use a UTC substring as a local input value.
  Every date/time field is `components/DateTimePicker.tsx`: ISO-or-null value, local calendar and
  time, named zone, explicit Clear, Apply-to-commit draft, refuses DST-skipped times and asks which
  instant a repeated time means. `suggested` opens an inheriting field on the inherited time.
- `profileId` is durable identity. Any player name with a usable ID uses `PlayerLink`;
  otherwise render plain content. Reuse `TeamLink`, `ChampionIcon` and profile/account components.
- `teams.id` is durable team identity: selections, keys, joins, links and query keys use it
  (`teamId`, `winnerTeamId`, `opponentTeamId`, a team row's `id`), read through `normalize.ts`'s
  `teamIdOf`. Codes are display strings that renames change and other teams can reuse; never join,
  link or decide a side on one. A null ID is unresolved legacy evidence and stays unlinked.
  `TeamLink` takes `teamId` (or a view-model `team`) and links `/teams/:teamId`. `leagueTeamId` on
  game participants is separate from Riot's 100/200 side `teamId`.
- Every query key/options object lives in `src/lib/queries.ts`. Explain staleness choices and reuse
  owning roots. Mutations invalidate their root; await invalidation when the next step reads it.
  Never mutate in a mount effect: StrictMode can detach the mutation observer and strand pending UI.
  Start mutations from user events in a component that outlives the request; mount-time reads use queries.
- API errors render verbatim through `errorMessage`/`ErrorLine`. Gate league controls with
  `hasScope`; preserve its legacy behavior when the API supplies no effective scope list.
- Anything that could be a shared component should be one. Search for an existing component before
  writing markup; never copy a pattern into a second file. When a second caller appears, move the
  first copy into a shared module and migrate every caller in the same change.
- Reuse `PageShell`, `SectionFrame`, `SettingsGroup` and `SettingsRow`. Controls are shadcn/ui primitives adapted
  through tokens with their upstream structure kept: `Button` (`default` primary, `outline`,
  `destructive`, `size="sm"`; `quiet` + `size="inline"` beside a caption), `Input`, `Textarea`,
  `NativeSelect` (+`NativeSelectOption`), `Checkbox`, `RadioGroup` (`RadioOptions` for a labelled
  list of named options with details), `Switch` (immediate, reversible
  Booleans only), `Label`/`Field`, `Badge` (`muted` for absent/secondary states), `Alert` for
  persistent notices and failed reads, `Empty`, `Spinner`/`Skeleton`, `Table` for ordinary tables
  (a truncating name column takes `w-full` on its head and `max-w-0` on its cells, so it gets the
  spare width). Dense stat grids, standings and scoreboards keep their own markup.
  `SettingsRow` takes a render prop for one control (`{field => <Input {...field} />}`) so label,
  hint and `error` are wired by id; other content is labelled as a group. Season/schedule editors
  mark refused fields with `invalidAt` (sets `aria-invalid`). `LABEL_CLASS` is only for captions
  that are not control labels. Transient confirmations are `toast.success` from `sonner` (one
  Toaster in `main.tsx`); failures stay inline. Hover hints use `TooltipHint`, never `title`; one
  `TooltipProvider` wraps the app. Modal, layered and focus-trapped UI uses shared Radix wrappers,
  never handmade overlays, `window.confirm` or `window.alert`. Destructive confirmation uses
  `ConfirmButton`; confirmations that need input first use `FormDialog`. `MoveButtons` is every
  Move up/Move down pair for a list whose order is saved (`quiet` beside other quiet row actions).
- Shared page pieces: `BackLink` is every page-level back link (history-aware `fallback`, or an
  explicit `to` + label); in-panel back buttons use `BackButton` from `admin/adminUi.tsx`.
  `league/DivisionPicker.tsx` is the single-choice Toggle Group that picks one concurrent division
  on Standings, Teams, Stats and Predictions (held locally, never `setSelection`); its optional
  `all` item adds an every-division choice.
  `UnderlineTabs` is the brand-underlined strip (Link mode for URLs, button mode for local state;
  hidden under two tabs); `PillTabs` is the bordered switch inside admin sections. Local view and
  filter switches (`PillTabs`, `stats/FilterBar`'s `PillGroup`, `ViewToggle`, `StatGroupSwitcher`)
  are Toggle Groups; genuine local tab panels use `ui/tabs`. `stats/FilterBar`'s `FilterField`
  labels one filter (`group` for a pill row). `match/MatchupHeader.tsx` is the two-team header
  card. `CursorPager`/`ShowMore` page cursor lists on `hooks/useCursorPage.ts`; numbered URL pages
  use `ui/pagination` (router links). `stats/StatTile.tsx` is the headline-number tile.
  `TimeZonePicker` is the searchable IANA zone picker on `ui/combobox` (Popover + Command), the
  combobox for stable local option lists. Its options can be `disabled` with a `detail` reason so
  server-reported unavailable choices stay listed.
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
  `BareLayout`. Home is eager; other pages are lazy. Profiles are `/players/:profileId` and teams
  `/teams/:teamId`; former `/teams/:conf/:code` URLs are not found. First-time identity setup is
  `/setup`. The predictions hub (`/predictions`, `/predictions/results`,
  `/predictions/leaderboard`, `/my-predictions`) is one `PredictionsHub` layout route inside the
  ticker group, with its own Suspense around the outlet.
- `components/layout/SiteLayout.tsx` owns ticker, nav, footer, mobile bar and Suspense.
  `PageShell.tsx` publishes page width/extra bottom padding; pages never mount the ticker.
  `home/ScoreboardTicker.tsx` hides its scrollbar and opens on now, so edge buttons page it while
  it overflows; a vertical mouse wheel cannot reach the earlier results.
  The inner content scroller must stay `relative` so hidden absolute inputs/menu triggers cannot
  escape its overflow boundary. Keep flex/grid children shrinkable and overflow inside the page.
  Scroll the actual content container, not the window; it reserves a stable scrollbar gutter so
  the centered column never changes width with page height. `#root` has no `100vh` floor: on
  phones that exceeds `h-dvh` while the toolbar shows and lets the document scroll. `FullBleedScroller` uses the nearest
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
- `auth/UserMenu.tsx` + `AuthControl.tsx` share desktop/mobile account actions; the desktop menu
  is a Radix `DropdownMenu` whose trigger and the drawer's name row show the session's Discord avatar
  through `PlayerAvatar` (20px in the trigger so it matches the neighboring buttons). Join CCS uses
  `DISCORD_INVITE` from `lib/siteLinks.ts`; Apply Now links to `/register` while
  applications are open (public home flag for anonymous visitors, open-seasons read when signed in).
  `useHasInvitations` offers Team Invitations for a nonempty inbox,
  including answered invitations; the private query is keyed by viewer profile ID. Keep the
  bot-linked `/team-invitations` route stable. `useHasLiveApplication` gates My Applications.

## Search and shared controls

- `components.json` configures shadcn (style `radix-vega`: always Radix primitives, never Base UI;
  Tailwind v4; `utils` is `@/lib/cn`). Native selects use `ui/native-select`. Humans add primitives
  with `pnpm exec shadcn add <component>`. `@/` resolves to `src/`; generated imports use
  `@/lib/cn`, never the unrelated npm `cn` package; review generated files for that, Base UI
  imports and `next-themes`, none of which this site uses. Import primitives as
  `@/components/ui/<name>`. Preserve CCS theme mappings: `dark:` follows `data-theme`, and sidebar
  tokens alias CCS tokens. `ui/sidebar.tsx` has no Ctrl/Cmd+B shortcut or cookie and uses the
  `useWindowSize` breakpoint.
- `components/search/SiteSearch.tsx` mounts one provider/dialog and Ctrl/Cmd+K handler per
  SiteLayout, with lazy `SearchResults.tsx`; its context and `useSiteSearch` live in
  `searchContext.ts` so Fast Refresh keeps one context. Triggers serve desktop, mobile bottom bar and
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
  code, block quote, code block, table, table of contents and horizontal rule. Heading options share styling.
  `TableSizePicker.tsx` shares an 8x8 pointer/keyboard grid in a Popover; dimensions include the
  header row. CodeMirror styling is scoped Tailwind; overriding unlayered defaults needs importance.
  A Templates toolbar menu and context submenu list `hooks/useEditorTemplates.ts`'s templates in
  served order, only for the content or site admin role and only when the read returns some (a
  failed read hides them). `insertTemplate` adds a block, one undo step, turning the single
  `{cursor}` placeholder into the caret or `{cursor:Text}` into a selection of Text.
- `api/editorTemplates.ts` maps `GET /editor-templates` (content role or site admin) and the
  site-admin whole-list `PUT /admin/editor-templates`, mirroring limits and the placeholder pattern.
  A list it cannot map whole has a null revision and cannot be saved, since a dropped row would read
  as a deletion. `queries.editorTemplates` is private, viewer keyed, under `queryRoots.editorTemplates`.
  Site Admin > Editor templates (`admin/EditorTemplatesSection.tsx`) edits a local copy and saves it
  in one request; a newer served revision (including after a 409) shows Load the latest instead of
  replacing edits. Local checks mirror upstream's; 422 issues use `admin/season/issues.tsx`.
- `components/Markdown.tsx` is the sole renderer for articles, Info, application notes and
  previews. Raw HTML stays disabled. `patches/` removes remark-gfm's email-autolink regex
  lookbehind, which throws on Safari before 16.4; re-check it when upgrading. Exact image title `width=N` (1–9999) sets display width,
  capped by container with automatic height; other titles remain tooltips.
  `rehype-slug` IDs headings behind `anchorPrefix` (default `section-`, so none collide with page
  IDs; Info adds the conf because several documents share the page). `lib/rehypeToc.ts` expands
  the first top-level `[TOC]` paragraph (`lib/markdownToc.ts`) into links to those IDs, three
  levels from the shallowest heading; the stored body keeps the marker and excerpts strip it.
  `#` links stay in the tab. `hooks/useHashTarget.ts` scrolls to a shared hash once a body loads.
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
  Use crawlable `ui/pagination` links (`rel` prev/next) and no previous-page placeholder data.
  Redirect page 1 to `/news`; invalid or empty later pages use noindex.

## SEO

- `src/lib/seo/` owns URL policy, metadata, excerpts/JSON-LD and sitemap output.
  `components/seo/MetadataProvider.tsx` is the only client head writer, outside SetupGate/lazy
  routes. Overrides are keyed by navigation identity; navigation clears stale tags, dates, image
  dimensions and JSON-LD. Private/unknown routes and content error states use client noindex.
- Season/profile canonicals retain conf; news and team pages ignore it and tracking. `VITE_SITE_ORIGIN` is
  validated HTTPS with the public CCS origin as fallback, never the browser host.
  Vite fills the shell's CCS_METADATA marker with generic Open Graph/Twitter tags and the 512 px
  CCS logo. The shared shell has no canonical, og:url, noindex or homepage JSON-LD.
- `queries.publicTeamDetail` is anonymous and separate under the teams root; TeamPage uses it
  for public body/metadata while staff panels retain their read. Sessions may expose unpublished
  teams, so public metadata must omit cookies. Both detail keys are `teams.id` under the teams root.
  `api/client.ts`'s `teamDetail` reads `GET /teams/by-id/:id`, then the roster row from the conf
  it names. Identity is always on the page; stats arrive once the team has played. Player artwork
  uses ProfileHeader's primary verified account. Tournament codes never enter metadata.
- `scripts/generate-sitemap.ts` imports pure `api/publicArticleInventory.ts` directly to
  avoid browser API initialization. Strict anonymous 50-row reads omit conf and require two
  matching complete inventories. HTTP/shape/duplicate/order/unstable-inventory failures abort before
  deployment. Only native articles, archive pages and explicit landing pages enter the sitemap.
  No body reads, lastmod, priority or changefreq.
- Humans run `pnpm seo:check` (offline fixtures, Node 24), `pnpm build`, and
  `pnpm build:production` for live generation. CI is offline; production generates XML/text
  before rsync. Sitemap freshness depends on deployment; there is no content scheduler.
- `.github/workflows/deploy.yml` deploys static build output and prunes old assets; it does not
  manage nginx configuration. Hostname and page trailing-slash redirects belong in the hosting
  configuration, which is not stored in this repository; canonical metadata does not enforce them.
  Hosting redirects should match the configured HTTPS/www origin, preserve query strings and
  encoded paths, and leave `/assets/` outside page slash normalization. Use a file-only SPA
  fallback (`try_files $uri /index.html`) to avoid conflicting directory slash redirects.
  Search Console sitemap submissions must use the final HTTPS/www `/sitemap.xml` URL without
  a trailing slash. Diagnose fetch failures with its live URL test and hosting access logs;
  successful local requests, including a Googlebot user-agent, do not prove Google can fetch it.
- `Home.tsx` leads with news and competition, without a promotional introduction. Participation
  guidance lives below the league-specific documents on `Info.tsx`, outside their loading/error
  branches: North America, teams register together, and eligibility, schedules and fees vary by
  league/season. Reuse its quick links for applications and the optional Discord invite.
- Participation details are still being decided. Defer Info expansion and direct visitors to
  the existing Discord invite for updates; do not publish unconfirmed rules, fees or schedules.
  SEO baseline collection can begin alongside implementation and is not a prerequisite.
- Rendering/hydration, automatic refresh, staged releases and request-time metadata are deferred.
  `createRoot` and SetupGate remain. Future prerendering must handle browser globals in
  `useWindowSize`/`useThemeColors`, PageShell's layout effect and relative dates. A generated
  homepage needs a separate SPA fallback to avoid leaking its canonical/body/hydration to other
  routes. The API has no complete public profile inventory; roster IDs are not a substitute.
- The Open Graph plan assigns entity metadata and later sitemap generation to the existing
  Express backend; this migration is not implemented. Keep the SPA and homepage layout. The
  website should consume additive metadata fields through its sole head writer once available.
  Initial article/player/team tags should use anonymous public reads.
  Player artwork must use cached verified-account data, not live Riot enrichment or the
  Discord-first profile-summary avatar. Team previews must enforce listed-season visibility
  even when the visitor has a staff session.

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
- `pages/LeagueAdmin.tsx` filters section registries before SettingsShell. Info, Applications,
  Accolades and Tiebreakers need league admin; Teams and Discord need roster; Schedule/Bracket/Predictions need schedule; site
  admins see all.
  Hidden direct links redirect to the first allowed section; no allowed sections shows a notice.
  The `production` scope is the broadcast crew's read-only view of codes and draft rooms on match
  pages; it opens no section here.
  The API permits roster on application review, while this UI requires admin; UI filtering is not
  an authorization boundary. Do not link ordinary league staff to inaccessible site-admin controls.
- `SettingsShell` renders section registries for profile, site and league areas; add sections
  through their registry. Settings pages take the full width; desktop navigation is a sticky
  `ui/sidebar` column (`collapsible="none"`) anchored at the page's left edge. A section's
  `maxWidth` (default `SECTION_WIDTH`) caps the section, which is centered in the space beside the
  sidebar, so the sidebar never moves between sections. Mobile keeps the list-to-detail drill-down.
  Shared area links live in `lib/settingsAreas.ts`.
  `RequireAuth` treats `allow: null` as loading, not denied.
  `league/bracket/BracketSection.tsx` owns the sticky standings reference, a Card + Scroll Area
  left of its bracket canvas (above it below `xl`).
  Site Admin owns Boolean `bracketView` (true for bracket, false for manual rounds)
  through the additive phase API contract. Missing or invalid values stay null in the client.
  Its Phase view field stays disabled until the server supplies a valid saved value; saves omit
  unsupported values. Omission preserves existing choices, including false; new brackets default to
  true upstream. The view is presentation only: both views take every kind of source, so a seeded
  playoff can pair later rounds by hand.
  `admin/season/PhaseViewField.tsx` appears only at the top of Bracket wiring, using `PillTabs` on the
  shared shadcn Toggle Group. `PillTabs` supports disabled/unavailable selections and group labeling
  for this saved setting. Its separate Save phase view action reads the current whole phase list
  before replacing only that phase's choice, awaits season/schedule invalidation, and requires contents changes to be
  saved or discarded first. View saves disable contents controls while pending.
  `season/BracketPhaseView.tsx` follows that choice, with a wiring-based fallback
  only for older servers and no viewer switch. Mobile uses round stacks. Desktop rounds break out through `FullBleedScroller` like the canvas (not inside League Admin's panel). Rounds order fixtures by the
  served bracket match `ordinal` (sorted in `api/seasonView.ts`; never node ids) and omit terminal
  emphasis. Unlabeled feeders read `Match <day>·<ordinal>` in both views. Both views reuse `BracketRoundHeading` and `BracketMatchCard`.
  League Admin reuses the same immediate-save entry-slot team pickers in both layouts; there is no
  separate round editor. Resync appears only with derived slots; derived slots show provenance in both;
  changing the presentation never clears wiring. Structure and byes remain API constraints.
  MatchEditor saves await season, schedule and standings invalidation.
- Bracket standings tables and seed sources: Boolean `standingsTable` on bracket summaries (null when
  unserved; staged as a Checkbox in each Phase list bracket row, independent of the view) ranks the
  phase as a table counted only through `lockedThrough`. A slot's `src` may be a seed source
  `{ phase, group, place }` (`group: null` for a bracket table); a side's `from` may be the seed branch
  with names, or null for a source the caller cannot see. The branches have no discriminator: always
  test with `isSeedSource`/`isNodeSource` (`api/season.ts`) and `isSeedFrom`/`isNodeFrom`
  (`api/seasonView.ts`). `place` is a row `position`, never `rank`; seed sources draw no edge and
  bracket walks skip them. `lib/seeding.ts` owns every label (`ordinal`, `roundIndex` over fixture
  days, captions, table status chips, held reasons, suggested `seed` labels, propagate summaries).
  `season/BracketStandings.tsx` renders a served table as the `leading` first column of `BracketPhaseView`'s strip (scrolls and breaks out with the rounds or canvas; stacked above on mobile) on the Standings tab through
  `GroupTable` (`scenarios={false}`). Site Admin's bracket editor offers Entry / place in an earlier
  table / winner or loser, prefills `seed` (`"1"`, `"A1"`), disables rows this document already reads
  (another phase's reader is the save's refusal), derives `incomplete`/`no_team`/`tied` from
  candidates, and in a table phase's rounds after the lock suggests the bare position (`"3"`) from the season read.
  A phase with a table can also seed its own later rounds: `src.phase` is the phase itself (`group:
  null`), read over the rounds before the slot's match day; offered only after the save's earliest
  match day, unique per round (`placeKey` carries the round), its `seed` prefilled with the bare number and "Seed N" in pickers, slots and
  held notes (`seedFromLabel`/`heldLabel` take the own phase). League Admin's reference panel includes
  the phase's own table for picks.
  Candidates panels show `position` and a status chip; bracket rounds come from source documents.
  `propagatePhase` answers `{ updates, held }`; only League Admin's Resync names held slots, and
  only `frozen` needs it. Phase list 422s at `phases` name the read phase from `subjects`; the group
  editor offers to restore a deleted group that is read.
- `league/info/InfoSection.tsx` edits a whole Info document. Preserve `applicationBody` on
  Info saves, and preserve other fields when application notes save; invalidate both relevant roots.
  `rulebookUrl` is required and prepended as the first public quick link, keeping remaining link
  order. The open-seasons endpoint supplies rulebook/applicationBody before Info publication.
  `pages/Info.tsx` renders selected conferences but never applicationBody.
- `api/tiebreakers.ts` maps `GET`/`PUT /tournaments/:conf/tiebreakers`: the order in force, the
  defaults and the served catalog (`available`, which supplies every label and description; ids
  outside it drop). Every ranked read orders by it; the site never ranks. `queries.tiebreakers` is
  the anonymous public read and `queries.manageTiebreakers` the editor's session read, both under
  `queryRoots.tiebreakers`. League Admin > Tiebreakers (`league/standings/TiebreakersSection.tsx`)
  edits a working list (in use and available are disjoint; the last rule cannot be removed), saves it
  whole, adopts the response, and invalidates tiebreakers, standings, season and schedule (a save
  re-seeds table-sourced slots in the same transaction). A 422 marks rows by
  sent index; a 403 locks the editor. Its preview is the saved order's `/standings` through
  `queries.manageStandings` (credentialed, keyed apart from the public read); a live what-if needs an
  upstream endpoint. `season/GroupPhaseView.tsx` adds `season/TiebreakerNote.tsx` ("How ties are
  broken") after its tables and legend, omitted when the read fails, and `GroupTable` adds desktop-only
  rule columns from `ruleColumns(doc, only?)`, in the league's order, for rules it ranks on that W/L/Win %/Games
  do not show (series and game differential, game win %, Avg win/Avg loss via `season/AvgGameTime.tsx`).
  Group tables pass only the two time rules; bracket tables pass every one. Head-to-head has no column.
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
  modes and typed external adapters. `PlayerIdentity.tsx` owns labels, badges and result rows;
  its `PlayerAvatar` (on `ui/avatar`) is every face on the site, including Riot icons (`square`). Selected names use PlayerLink; result buttons never nest links. Hide profile
  numbers and snowflakes; Discord context is @handle. Nameless fallbacks are Unnamed player or
  Unnamed Discord member, never IDs.
- Riot mode previews verified accounts; complete Riot IDs always offer explicit lookup alongside
  profile matches. Failed acceptance requires fresh preview; never fall back to expectation-free
  resolution. Display primaryRiotId separately from matchedRiotIds and never assume a match is primary
  or load accounts per result. Discord mode preserves independent source errors. There is no picker
  league-membership checkbox; the accolade conference filter is separate. `DiscordSearch` is the
  Discord mode's search body; callers that need the chosen account rather than a resolved profile
  (esubs) use it directly.
- `league/teams/TeamsSection.tsx` uses Riot mode for starters/subs and Discord for owner/contacts.
  `useRosterPlayerSources.ts` owns authorization, private query cleanup and resolver invalidation.
  `rosterInput` is ID-only for writes/dirty checks; refreshed summaries update presentation by ID
  without replacing unsaved identities/order. Retain legacy selections; mobile logo/name has its own row.
  Tag edits are ordinary: history stays with the team ID, so there is no rename warning. Details
  saves refresh the teams, standings, season and schedule roots.
- `league/discord/DiscordSection.tsx` is League Admin > Discord over `api/teamDiscord.ts` and the
  private `queries.teamDiscord` status read (under the teams root, refreshing while syncs are
  pending). Provision, staff roles and teardown need `admin`; role resync and esubs need `roster`.
  Roster/profile-link events reconcile existing role membership upstream, so roster saves never
  trigger a sync from here. Members
  render through served `profile`/`handle` and esubs name `grantedByProfile`; staff roles are named
  from served `staffRoles` and picked from `assignableRoles`. `members` are freshly confirmed role
  holders; `unconfirmedMembers` carry `not_in_guild`, `missing_role` or `unavailable`, including
  individual lookup failures while Discord is connected. `DiscordMemberList` shares both lists'
  presentation and esub removal in served order. Unconfirmed recipients flag collapsed team cards
  for attention; Check again rechecks membership. Per-person warnings' `profileIds` are
  named through `lib/roster.ts`'s `rosterNames` over `queries.teamsForConf`, as delivery reports are.
  Provision creates missing resources, preserves IDs/messages and manual branding/placement, and
  never deletes resources. Missing channels reuse surviving peers' shared parent (mixed placements
  are preflight blockers); new text and voice channels use team names. Staff-role saves update
  existing channel access during the request. `resyncTeamDiscordRoles` uses `/roles/resync` for
  existing role membership only and remains available despite resource preflight blockers; missing
  roles require provision. Both actions support all teams or one team and never retry automatically.
  Resync awaits teams-root invalidation and answers the report `DiscordOperationReport` renders.
  Provision answers a queued job (`ProvisionSection.tsx`, `useProvisionJobs.ts`): each click sends a
  new `requestId`, kept in memory and `sessionStorage` (`provisionRequest.ts`) until a 2xx, 4xx or
  503 answers; a lost response offers an explicit resend of the same id and selection and blocks
  other starts. `queries.teamDiscordProvisionJobs`/`teamDiscordProvisionJob` sit under the status
  key; the job polls 2 s while a team runs, 5 s while queued, paused while hidden, and stops at
  `finished` or a 4xx. The panel follows `?job=`, else the newest unfinished job, else shows the
  newest finished one collapsed. `ProvisionJobView.tsx` shows counts (no ETA), elapsed from served
  `now` through `hooks/useServerClock.ts`, the waiting reason, a progress page title while running,
  and one final toast only on an observed transition to `finished`. `ProvisionTeamRow.tsx` keeps
  every stage visible, so partial success survives a failure, plus history and per-team retry.
  Retry (admin, `retryable`, not superseded) is not idempotent and only rereads after failure.
  `CategoryAdoption.tsx` adopts a pasted category ID for a kind that is missing or never recorded;
  Teardown deletes adopted categories. `DiscordResourceBadge`
  shares resource diagnostics across categories and teams, preserving uncertain creates as needing
  inspection. Status also exposes category issues and queued membership/resource scopes.
  `api/teamDiscord.ts`'s `teamDiscordWorkState` shares pending/held classification between polling
  and status presentation. Queue depth includes held failures (`attempts > 0`), which have no timed
  retry and cannot keep polling alive; only unattempted work with a pending scope polls. Resource
  failures need a Provision job retry or a new Provision; membership failures need another team
  change or Resync roles. Teardown reports `superseded` queued attempts and closes earlier jobs.
  Recovery copy is shared in `discordLabels.ts`. Endpoint paths and payload shapes remain compatible.
  The Discord section is keyed by conference/viewer so reports cannot follow a league switch.
  Teardown sends the typed conference code and offers force only after a `season_active` refusal.
- Discord's Results panel (`league/discord/ResultsPanel.tsx`, `api/resultsWebhooks.ts`) requires
  league `admin` or site admin; admin-only grants can reach Discord without roster scope.
  Teams and Results use local Radix tabs and stay mounted across tab changes so pending mutations
  and request IDs survive. Results reads are private no-store, viewer/conf keyed, zero retention
  and explicit refresh under `queryRoots.resultsWebhooks`, independent of team provisioning.
  One destination card holds test and disconnect; setup picks Create or Paste. Create uses
  `ResultsChannelPicker` (the Combobox, served order, ineligible channels disabled with the reason
  and reserving league's name) and sends `webhookName` only when `/channels` serves
  `defaultWebhookName`, since upstream refuses unknown keys. Results and tests post embed-only under
  the webhook's own Discord name; tests use a sample series. Pasting takes a canonical Discord
  webhook link; the secret stays in the field only and clears after save. Every configuration write sends the
  saved revision; DELETE carries a JSON body. The current destination stays visible during creation.
  Generation (including its name) and test UUIDs retain their exact bodies after uncertain failures; checking those
  requests never repeats a committed attempt. `ResultsOperations.tsx` reads attempt status and
  explicitly rechecks original audit evidence, never creates another webhook. Unresolved creations
  block replacement until resolved or disconnected. Uncertain tests require Discord inspection
  before an explicitly confirmed new test. Configuration changes never replay old results.
  `credentialed.ts` keeps field-issue 422s as `SaveRejected` and other `{ error }` refusals as
  `ApiError` so Discord error codes render verbatim.
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
- `api/opgg.ts` maps the OP.GG `links` served on profiles and every hydrated team (lists, team
  page, both match sides). Team links cover the five starters only; `opggComplete` is Riot ID
  resolution, not slot coverage. `OpggLink` is a team's card-header link (team page Roster card,
  match Preview Starters cards, Teams tab cards); the profile Accounts card keeps its branded OP.GG
  button. `views/TeamsView.tsx` reads only the picked division's `queries.teamsForConf` (Home loads the
  league for its Home tab only) and renders at most three cards a row in `LEAGUE_VIEW_COLUMN`,
  the column it shares with Standings: roster, then owner/contacts as Staff. Each row shows the
  slot's avatar, pronouns, `VerifiedMark`, cached Discord `handle` through the SVG
  `players/DiscordHandleCopy` icon (tooltip and copy action), `primaryRiotId` on its own line,
  and a fixed-width solo rank badge: tier and division without LP, colored by
  `lib/riot/rankTiers.ts` from the `--tier-*` tokens, or Unranked; `unavailable` leaves the slot
  empty. Every field is omitted when null; a missing handle proves nothing.
- Career teams use full TeamRecord/mapTeamRecord; opponents use compact TeamMetadata plus
  opponentCode. `TeamIndex` resolves rows' served `teamId` against `career.teams`. Lane matchups stay per-conf in the API mapper and are keyed by conf/profileId.
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
  available because no history is stored. ProfileHeader uses the primary verified account's icon
  and shows the served cached Discord `@handle` (no visible caption) beside pronouns and pronunciation.
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

## Predictions

- `api/predictions.ts` maps the documented sibling API prediction, rule and calendar schemas.
  Event pools and wallet amounts are `{ minor, display }`; use `minor` as a string and keep
  display/input logic and quick-amount presets in `lib/predictionPoints.ts`. Never calculate
  payouts; pool shares are display only.
  Events have a `kind`: `match` markets have exactly two outcomes, `outcomes[0]`/
  `result.score.teamA` being team A; `custom` markets are staff questions with a title, plain-text
  details and 2 to 16 outcomes in served position order. Stakes, estimates, positions and winners
  are keyed by `outcomeId` (`winnerOutcomeId`); `teamId` is only a match projection. Review, skip
  and ledger-kind values are enums and unknown values drop; a candidate with any served skip
  reason stays unavailable. Read camelCase result/worker fields.
  `components/predictions/predictionLabels.ts` owns every label; `outcomeLabels.ts` owns plain-text
  outcome/event names and `rewardPolicyText`. `OutcomeLabel` (in `MatchupLabel.tsx`) renders any
  outcome with its team or player link; `OutcomeShares` (in `PoolBar.tsx`) is a custom market's
  pool, while `PoolBar` stays the two-sided match bar.
- The hub (`pages/PredictionsHub.tsx`) renders `PredictionsHeader` (wallet chip, Link tabs, the
  public reward rule from `/settings`) over Open (`Predictions.tsx`), Results
  (`PredictionResults.tsx`), `PredictionLeaderboard.tsx` and `MyPredictions.tsx`; tabs read the
  wallet, filtered confs and labels through `usePredictionsHub`. `usePredictionWallet` reads only
  `me/summary` and owns enroll/claim; enrollment is per leaderboard season. Open and Results share
  `PredictionFeed` and follow the nav season picker: per conf, match and custom markets together,
  Open by `sort=closesAt`, Results every closed state by `sort=-closesAt`, each with Show more and
  no `kind` filter. With several confs the hub shows a `DivisionPicker` (with All divisions) on
  those two tabs, held in the hub so the pick carries between them; division headings appear only
  while several confs are shown.
  "Your pick" comes from `me/positions` per loaded page (`usePredictionPositions`), never public
  reads. `PublicPositions.tsx` shows anonymous participant picks on prediction detail as one
  column per outcome, through the proposed `GET /predictions/:eventId/picks` contract (backend
  pending; the deployed `/positions` pages by profile ID and cannot rank an outcome). The API ranks
  each column by paid points; never sort locally. `queries.publicPredictionPicks` reads every
  outcome's first page, polls successful open-event reads every 15 seconds and stops on
  errors/absence; stake invalidation refreshes it. Each column's Show more pages
  `queries.publicPredictionOutcomePicks` without polling and keeps a player's first row. Absent
  routes render an unavailable notice, not an empty list. Picks are public immediately, including
  existing and closed-event picks; only paid principal is public, not private wallet/ledger data.
  `PUBLIC_PICKS_NOTICE` appears before participation. `/me/positions` remains session-only.
  My predictions lists `/me` holdings with picks from positions, then the ledger; its reward
  tile follows the served cadence, mode, streak cap and upcoming policy. Settled events live on the
  Results tab. The leaderboard's `?season=` (omitted for the open season) selects a closed
  season's frozen board from `queries.predictionSeasons`. Detail, leaderboard and My predictions
  are seasonless in the nav; Results is listed in NavBar's `SEASONAL_PATHS` despite its
  `/predictions/` prefix.
- `predictions_unavailable` (503: no prediction settings or no open season) is site-wide, not per
  league (`predictions_disabled` is), and public event reads keep working through it.
  `isPredictionsUnavailable` reads it from either transport (both parse the JSON error envelope) and
  stops query retries. The hub (calendar or summary) and leaderboard show `PredictionsUnavailable`,
  detail replaces only `PredictPanel`, staff sections show its `audience="staff"` Alert, and
  prediction error lines go through `predictionErrorText`.
- `PredictionDetail.tsx` uses `MatchupHeader` for match markets and its own header card for custom
  ones, `PredictPanel` (the only place that places a prediction; the estimate is the debounced
  read-only `queries.predictionEstimate`) and `PositionBreakdown`. Uncertain stake, claim, publish,
  action, settlement and rollover failures keep their request ID for an identical retry; 4xx
  answers drop it. `PredictionCard` (full/compact), `PoolBar`/`OutcomeShares` and
  `PredictionStatusChip` are shared by the hub, Home's `home/OpenPredictions.tsx` (same
  `queries.openPredictions` keys, hidden when empty or failing) and admin rows.
  `MatchPredictionPanel` shows a fixture's prediction on the match Preview tab via the anonymous
  `queries.predictionForMatch`. All keys are under `queryRoots.predictions`; private keys include the
  viewer ID and auth changes remove old private prediction caches.
- `league/predictions/PredictionsSection.tsx` is a shell over `WeekNavigator`, `PublishPanel`,
  `CustomMarketPanel` (custom market publication with local checks mirroring the API's rules) and
  `EventsPanel` (with `EventActionDialog`, whose custom reopen sends a new `closesAt`, and
  `SettlementDialog`, which resolves unpaid custom markets and corrects paid results through a
  preview token). Publication needs a listed conference, so a hidden league
  (`useAdminAccess().isListed`) shows a warning and read-only Publish/Custom panels; event actions
  stay available. `lib/predictionWeek.ts` derives
  Monday labels from public `/settings`; the API owns exact week instants. Publication sends only
  `scheduleMatchId` and the candidate's `expectedRevision`; `publication_preview_changed` clears
  the selection and reloads. Site admins get a link to the switch; league staff do not. The API lets
  `schedule` staff read the week and publish; retrying processing and event actions need `admin`,
  so the section hides those controls unless `hasScope(league, "admin")` or a site admin.
  `admin/PredictionsSettingsSection.tsx` is Site Admin > Predictions: operation and per-league
  rules are `Switch` rows (immediate, no confirmation); timezone and reward policy changes are
  previewed and share the next reset as their boundary (a pending policy can be replaced); the
  season rollover loads `queries.predictionRolloverPreview` only on request, lists blocking
  markets, and is a destructive confirmation. Every write is version-checked.
- `admin/TournamentCodesSection.tsx` is Site Admin > Tournament codes (`/admin/tournament-codes`).
  Blind pick and Tournament draft apply immediately to future code generation; existing codes keep
  their configuration. It shares `queries.predictionSiteSettings` and the predictions root with
  Predictions because `/admin/settings` has one version. The API boundary in `api/predictions.ts`
  maps unknown/missing pick types to null and PATCHes only the pick type, expected version and
  `preview: false`; no calendar preview or effective boundary is needed. Saves and 409s refresh the
  shared root; missing pick type/version disables editing until the API supports it.

## Matches, schedules and games

- `pages/MatchDetail.tsx` + `match/MatchLobby.tsx` render the served `draftUrl` and API tournament
  codes below the header (`match/MatchupHeader.tsx`), codes in served game order. The two are
  independent: a room can be served before codes. The Preview tab adds the fixture's
  prediction panel when one is published. `api/feed.ts` result reads send the session with no-store;
  queries.matchResult is keyed by viewer ID with zero retention. Omitted codes/room render nothing.
  `api/schedule.ts` shares mapMatchCode with admin reads; `CopyAction.tsx` owns copy feedback.
- `home/UpcomingSchedule.tsx` takes the first viewer fixture from the ten served upcoming
  matches. Reuse queries.teamsForConf and join teams by team ID; `lib/roster.ts`'s teamMembers
  includes starters, subs, contacts and owners and is also used by delivery reports.
  Anonymous/nonmember viewers get no extra card. Remove the featured fixture by feedMatchKey and
  hide an empty remainder. UpcomingMatchCard shows team badges/names, phase, relative match day and
  best-of; only that card checks viewer-scoped code and draft room availability. Only the served
  `draftUrl` is a draft link; never infer one from a code or registration.
- `league/schedule/CodeDeliveryControl.tsx` shares day/match Discord actions and reports.
  sendDayCodes/sendMatchCodes POST an empty object and do not mint codes. A 409 not_ready means
  nothing sent; show readiness issues (`no_draft` when no matching ready room exists, since DMs
  link the room). HTTP 200 may have partial failures, so retain every recipient
  status. Explicit retries skip successes; unknown/in_progress need inspection, not automatic retry.
  Delivery changes no read model. Key DayPanel by conf/day so reports cannot follow another selection.
  `codeReports.ts`'s `scheduleMatchLabel` names a day's matches in every schedule report.
- Drafter rooms: `api/drafts.ts` maps settings, fixture registrations, flattened game rows, day
  batches, rechecks and the issues inbox; refusals are category codes read by `draftRefusal` and
  worded by `drafts/draftLabels.ts` (unknown codes verbatim). Links pass `draftLink` (HTTPS only).
  `league/schedule/DraftPanel.tsx` (per match, `queries.fixtureDraft` under the schedule root, viewer
  keyed, zero retention) creates a room with explicit labels and the schedule's resolved best-of,
  shares it, rechecks results and lists games through `drafts/DraftGames.tsx` (two physical-side
  columns, bans as icons above picks labeled with their locked position, null bans as no-ban art).
  `DayDraftsControl.tsx` posts `{}` for the day and reports per fixture.
  A fixture holds one registration and the API cannot replace it: failed, uncertain and mismatched
  rooms end at a notice, and room creation never retries automatically. Site Admin > Drafts
  (`admin/drafts/`) saves the revisioned global settings (409 reloads) and pages receipts and
  creations independently; only receipts can be reprocessed. Receipts have no retry timer: failed
  and lease-expired `processing` receipts both take Reprocess. Room writes invalidate the schedule
  and drafts roots. Its Game issues list (`queries.draftGameIssues`, opaque cursor) opens
  `DraftCorrectionEditor.tsx` in place; `draftCorrection.ts` owns form state and mirrors the
  server's checks. The list catches only champion mismatches and missing drafts, so the editor is
  addressed by `?series=&game=` (`draftCorrectionLink.ts`) and site admins reach any game from
  `DraftGames` and the game page's Draft tab. A correction sends picks, bans, first pick and all ten roles (required), with
  the read's `draft.updatedAt` verbatim (null creates a game); a 409 reloads the editor. There is no
  revert. Fearless repeats are saved warnings. Saves invalidate drafts, game and schedule roots;
  statistics catch up on their own refresh about 30 seconds later.
- Draft statistics: no league flag decides them. Champion `seriesPresence`/`blindPickRate` show in
  the Draft group when any row has a `seriesPresence`. A response with any `prioScore` is fearless:
  pick rate, ban rate and presence are hidden, prio score takes presence's anchor column and the
  default sort, and `avgFearlessGame` joins the Draft group. Decided per response through
  `StatCell.shownWhen`, `availableGroups`/`availableCells` and `defaultChampionSortKey`; null cells
  render as a dash. `sortByCell` puts nulls last in both directions,
  and stat headers carry `hint` text through `TooltipHint`. Outside the champion statistics, draft
  information appears only in the match page's draft card, the game page's Draft tab and ban
  slots: the match box score's bans arrive as Drafter's upstream, and the game scoreboard's
  `TeamFooter` takes the draft side whose picks that map side played. Blind tags and pick order
  stay on the Draft tab and card, not the box score. The First pick chip appears on the draft card,
  the Draft tab and staff `DraftGames`, never the box score, and only when `firstSelection` is true,
  since without it blue always picks first. `match/SeriesDraftSummary.tsx` is the Results tab's one draft card: each played game's
  `queries.gameDraft` read, in chronological order through `lib/draftSequence.ts` (bans 1–6, picks
  1–6, bans 7–10, picks 7–10, by the API's turns), edged by draft side; games without a draft are
  omitted and the card hides when none has one.
- `views/ScheduleView.tsx` reads one 200-row `/schedule` page. Its search box sends the feed's `q`
  (two characters, debounced, `FEED_SEARCH_MAX`), which upstream applies to team, group, phase and
  league labels before `limit`; never re-filter locally. Disclose capped pages from served
  `truncated`, not the row count. Feed rows carry `groupId`/`group`, derived upstream from team
  membership; `FeedMatchRow` shows the group beside the phase.
- `match/TeamMatchHistory.tsx` uses served scheduleMatchId/phase without an extra schedule read;
  legacy matching falls back to seasonDay/opponentTeamId. Match result rows keep a consistent grid and
  contained overflow. SeriesTotals computes rates from totals, not averages of rates. The box score,
  totals and header orient sides on `lib/seriesStats.ts`'s `FixtureTeam` IDs; recorded codes only label.
  BanIcons preserves -1 as no ban and passes ChampionIcon both ID and source; SeriesGameCard labels
  each team's Victory/Defeat.
- `pages/GameDetail.tsx` and `components/game/` render the match/timeline/context/draft reads.
  The Draft tab (last, `needsDraft`) is listed only when `queries.gameDraft` returns a draft; a 404
  or the hidden-conference 400 hides it without an error. It names sides "Blue draft"/"Red draft" by
  team (the draft's sides need not be the lobby's); each side groups its bans as icons and lists its
  picks as centered splash tiles (the scoreboard's crop), without turn numbers, game or patch (the
  header has those), and flags a drafted role that differs from Riot's.
  Shared RiotIcons/ChampionIcon handle assets; RiotText tokenizes supported markup rather than
  injecting HTML. Scoreboard density templates use subgrid, responsive name columns and inner
  scrolling floors; preserve shared timeline selection state. Secondary panels (the Graphs stat
  picker, the Timeline map) sit on the left at wide widths so switching tabs does not move them.
  `lib/gameAssets.ts`/`hooks/useGameAssets.ts` supply Community Dragon item/spell lookups.
- `lib/game/events.ts` + `game/timeline/EventText.tsx`: DRAGON_SOUL_GIVEN with teamId 0 means
  the map became an elemental Rift and has no side. TeamId 100/200 means that side claimed the Soul.

## Season day is internal

`seasonDay` is a join key, never a new reader-facing label. Use served `PhaseRef` and
`api/phaseRef.ts`'s `placementLabel`: bracket round number first, then served round name;
matchDay is relative to its phase. Otherwise use the kickoff date. Do not infer phases, semifinal
labels or bracket depth. Keep existing explicit legacy/admin/stat-column exceptions confined to
their current callers; never extend them to new public surfaces.
