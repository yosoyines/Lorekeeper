# LOREKEEPER — Master Specification
**Last updated: October 30, 2026 (session 46b)**

**This file describes how the app works now.** Three documents, and it matters which one you open:

| Looking for | Open |
|---|---|
| How something works, or a constraint not to break | **this file** |
| What to build next, and what was decided or rejected | `lorekeeper-roadmap.md` |
| What happened in a past session, and why | `lorekeeper-sessions.md` |

The split happened in session 37. This file had reached 220 KB, a third of it a session-history table with rows up to 5,700 characters, which made document previews fall back to raw markdown.

---

## Working Files
- Project files at `/mnt/project/` are **no longer synced**. Load `index.html`, `main.js`, `preload.js` and the three documents from the project at the start of a session.
- Source now also includes `github-backup.js`, `github-ipc.js` (session 37) and `rclone-backup.js` (session 38).
- `compile-check.js` sits at the repo root (session 45). Earlier versions of this file told the next session to run it while **the file did not exist** — it was written in a session, quoted here, and never saved. It needs a dev-only dependency that is deliberately NOT in `package.json`, because the app loads Babel from a CDN and must keep doing so: `npm install --no-save @babel/standalone@7.23.10`. It refuses to run against a version that does not match the one pinned in `index.html`, since otherwise it checks something the app will never execute.
- `vendor/rclone/rclone.exe` is **not** in the repo and must be placed by hand before building — see Backup.
- **Test environment removed (session 35)** — `I:\Test` was deleted once the build was running stably, so `DATA_DIR` is now `I:\Lorekeeper` in dev and next to the exe in production, with no separate test path. Consequence: untested builds now touch live data directly. Hit **Back up now** (Import/Export) before installing a new build, so a bad session is recoverable from the backup repo rather than only from a ZIP.
- Backup repo working copy at `I:\LorekeeperBackup` (see Backup). Only the optional extras script uses it now; the app uploads over the API and needs no local clone. It is a **separate git repo from the source repo** — `I:\Lorekeeper` is already the source working tree and two repos cannot share one folder.

---

## Platform & Stack
- **Runtime:** Electron (desktop app, Windows)
- **Renderer:** Single HTML file — React 18.2.0, Babel standalone 7.23.10, Tabler Icons 2.44.0 (all pinned — do not change, newer Tabler breaks Electron)
- **Data:** Auto-saves to `I:\Lorekeeper\lorekeeper-data.json`; async write, debounce configurable in Settings
- **Images:** Stored as `image_relpath` file paths relative to `I:\Lorekeeper\` — NOT base64 in JSON (legacy base64 fields still read for backward compatibility)
- **Launch:** `start-silent.vbs` (no terminal); `start.bat` for debugging
- **npm packages:** `adm-zip` (backup/restore)
- **Repository:** Private GitHub repo at Ine's account (set up June 2026)

---

## File Structure
```
I:\Lorekeeper\
  lorekeeper-data.json
  start.bat
  start-silent.vbs
  .gitignore
  lorekeeper-master-spec.md
  src\
    main.js
    preload.js
    index.html
  assets\
    icon.ico / icon.png / icon.svg  <- REMOVED (assets/ now holds only icon.ico and icon.png)
  Companions\
    CharacterName\
      companion.json      <- auto-saved on every edit if companion_folder is set
      portrait.avif ...
  Lorebooks\
    lorebook.json         <- auto-saved on every edit if lorebook_filename is set
    cover.jpg
  Collections\
    collection.json       <- auto-saved on every edit if collection_filename is set
    banner.jpg
  Worlds\
    WorldName.jpg         <- world banners
  Personas\
    PersonaName.jpg           <- persona portraits
    PersonaName-persona.json  <- per-persona backup, auto-saved (session 35)
  Notes\
    WorldName.md           <- per-world notes backup, auto-saved independent of lorekeeper-data.json
    _global.md             <- global scratchpad backup
  Templates\
    TemplateName.json       <- per-template backup, auto-saved independent of lorekeeper-data.json
  node_modules\
    adm-zip\
```
`lorekeeper-data.lastgood.json` and `lorekeeper-data.SUSPICIOUS.json` also appear at the root alongside `lorekeeper-data.json` once the app has run — see Data Safety Architecture. `lorekeeper-data.pretty.json` appears there too (session 35) — the git-diffable copy, written on shutdown and on Sync Now; it is in the source repo's `.gitignore`.

**Note the `character.json` trap.** Auto-save wrote `character.json` before session 31 and `companion.json` after. Both names sat side by side in every companion folder until session 35 cleared 34 stale `character.json` files. If old ones reappear, something is writing under the pre-31 name.

---

## IPC Methods (preload.js -> main.js)
| Method | Description |
|---|---|
| `loadData()` | Load lorekeeper-data.json |
| `saveData(data)` | Async write to lorekeeper-data.json (compact JSON, no pretty-print) |
| `exportFile({defaultName, content, folder?})` | Save dialog -> write file. Filter is chosen dynamically from `defaultName`'s extension (json/md/txt/fallback to All Files) — fixed session 17, was previously hardcoded to always show "JSON" even for `.md` exports. `folder` (added session 17/18) defaults the save dialog to the relevant subfolder (`Companions`/`Lorebooks`/`Collections`/`Personas`/`Templates`) instead of always `I:\Lorekeeper\`; creates the folder if it doesn't exist yet. |
| `saveNotesFile(filename, content)` | Write a standalone `.md` backup to `Notes\{filename}.md`, independent of the main data file — see Data Safety Architecture |
| `syncToGit()` | **Retired route.** Runs the old batch script and waits for it. Superseded by `githubSync()` — see Backup |
| `getSyncInfo()` | **Retired route.** Status for the old script panel |
| `getDataDir()` | The data FOLDER. `getDataPath()` returns the data FILE — the portrait picker once appended a subfolder onto that, producing a path through `lorekeeper-data.json` that could never exist |
| `flushComplete()` | Renderer tells main the final autosave has reached disk, releasing the close handshake (Data Safety layer 4) |
| `setSyncPaths(paths)` | **Retired route.** Pushes the script paths to main and regenerates `sync-paths.cmd` |
| `githubStatus()` | `{hasToken, login, repo, branch, lastSync, tokenExpiry, encryptionAvailable}` for the backup panel |
| `githubSetToken(token)` | Validate against GitHub, then store encrypted via `safeStorage`, outside the data folder. Returns the login and the token's expiry date |
| `githubClearToken()` | Delete the stored token and forget the login and expiry |
| `onGithubSyncProgress(cb)` | Subscribe to per-file progress during a backup; returns its own unsubscribe function |
| `githubListRepos()` / `githubCheckRepo(repo)` | What the token can reach, and whether it can write to one |
| `githubSync({provider, repo, folder})` | Run a backup. Same `runBackup` the scheduled `--backup` run uses |
| `githubPreview()` | What a backup would send, without sending it |
| `rcloneStatus()` | `{binaryFound, bundled, version, backends, backend, folder, destination, connected}` for the cloud setup panel |
| `rcloneConnect({backend, folder})` | Browser sign-in, save the remote, then **prove it works** with a round-trip write before reporting success. A destination that fails the check is removed again |
| `rcloneDisconnect()` | Delete the saved remote and clear the staging directory |
| `onRcloneConnectProgress(cb)` | Progress during sign-in; returns its own unsubscribe function |
| `openBackupFolder()` | Opens `I:\LorekeeperBackup` in Explorer |
| `saveTemplateFile(filename, data)` | Write a standalone JSON backup to `Templates\{filename}.json`, independent of the main data file — same reasoning as `saveNotesFile`, added session 17/18 |
| `saveImage({base64, defaultName, folder?})` | Save a binary image via a Save dialog (session 26 image tools). `folder` (session 45) defaults the dialog into a data subfolder the same way `exportFile` does, and creates it if absent; **omitting it keeps the old Desktop default**, which is what the three image tools (Format Converter, Paste & Save, Crop) still rely on. Added because a SillyTavern card belongs beside the character it came from. |
| `pasteImage()` | Read an image from the clipboard (session 26) |
| `getLastgoodInfo()` | Returns metadata about the rolling lastgood backup — see Data Safety Architecture |
| `restoreLastgood()` | One-click restore from the lastgood backup (session 22) |
| `savePersonaFile(filename, data)` | Write a standalone JSON backup to `Personas\{filename}.json` — see Auto-Save to Disk, added session 35 |
| `importFile()` | Open dialog -> read JSON string |
| `importImage()` | Open dialog -> returns `{base64, srcPath}` |
| `importImages()` | Multi-select -> returns `[{name, base64, srcPath}]` |
| `readImagePath(relPath)` | Read `I:\Lorekeeper\{relPath}` -> base64 |
| `scanCompanions()` | Scan `Companions\` -> folder results with JSON + image list |
| `scanLorebooks()` | Scan `Lorebooks\` -> JSON results + `imageRelPath` if image found alongside JSON |
| `scanCollections()` | Scan `Collections\` -> JSON + thumbnail + `imageRelPath` |
| `openFolder(relPath)` | Open in Windows Explorer |
| `getDataPath()` | Returns full path to data file |
| `saveCompanionJson(folderName, data)` | Write to `Companions\FolderName\companion.json` (renamed from `character.json` in session 31 to match Saucepan); **strips app-only fields, so this is an export shape and not a complete local backup** — see Auto-Save to Disk for the full strip list and what it means for recovery |
| `saveLorebookJson(filename, data)` | Write to `Lorebooks\filename.json`; strips app-only fields |
| `saveCollectionJson(filename, data)` | Write to `Collections\filename.json`; strips app-only fields |
| `copyImageToFolder(srcPath, destFolder, filename)` | Copy image locally; returns `{relPath, base64}`. Skips the copy only when the source is **already inside** the data folder. **It does NOT skip when the destination exists — it overwrites, unconditionally** (read in session 45; this row claimed the opposite for months). Anywhere several items share one flat destination folder, the caller must make the filename unique or one item silently takes over another's picture — which is why persona portraits are prefixed with the persona's name. |
| `writeImageFromBase64({base64, destFolder, filename})` | Write base64 to image file; checks dest exists first; returns `{relPath}` |
| `exportBackup({worldId?})` | Create zip — full or per-world; returns `{success, size, path}` |
| `exportPlatformZip({defaultName, files[], folder?})` | Save dialog -> zip pre-built JSON strings; returns `{success, size, path}`. `folder` (added session 18) defaults to `Worlds\` for the world Export ZIP. |
| `restoreBackup()` | Open zip picker, extract files, return data for merge/replace |
| `saveDataAllowShrink(data, reason)` | **Session 32.** Write the data file bypassing the Layer 2 shrink-refuse check, for legitimate bulk shrinks (base64 migration/cleanup). Copies the current file to `lorekeeper-data.preshrink-{ISO}.json` first, then writes, then **resets `lastgood` to the new content**. Returns `{success, snapshot}`. Only the image migration/cleanup paths may call this — see Data Safety Architecture. |
| `importImage(opts?)` | **Changed session 33.** Now accepts `{defaultPath}` so the picker opens in the character's own companion folder. Relative paths resolve against `DATA_DIR`. `importImages` already had this; the single-image picker did not, which is why Set Portrait always opened wherever Windows last left off. |
| `listFolderImages(subfolder)` | **Session 32.** List image files in any top-level data folder (`Lorebooks`/`Collections`/`Worlds`/`Personas`) -> `[{name, filename, relPath}]`. Added so the base64 audit can offer a link-existing-file picker for non-companion types, which previously only companions had. |
| `onFlushBeforeClose(cb)` / `flushComplete()` | **Session 32.** Shutdown handshake. Main intercepts window `close`, sends `flush-before-close`, and holds the window open until the renderer replies with `flush-complete` (8s timeout). |

---

## Data Model

### initData shape
```js
{ worlds:[], characters:[], lorebooks:[], collections:[],
  gallery:[], schedule:[], notes:'', personas:[], templates:[],
  release_cycle:[], schedule_notes:{}, lorebook_templates:[],
  map_positions:{}, world_order:[], cycle_head_world_id:null,
  cycle_skipped:[], settings:{} }
```
*(Regenerated from the real `initData()` in session 35b — the previous copy had drifted.)*

**`relationships` is deliberately absent.** It is a real field the Relationship Map writes to, but `initData()` never creates it; every read goes through a defensive `data.relationships || []`. Do not "fix" this by adding it to `initData` without checking the map code first — the fallback is the contract.

**`schedule[]`** is initialised but dead — nothing reads it. See the Schedule section.

**`map_positions{}`** (session 24) is what the Relationship Map persists node positions to. It exists only in the main data file, like the rest of the organisational layer.

**Root fields added since the original shape:** `world_order[]` (session 30 drag-to-reorder), `cycle_head_world_id` (session 31, release cycle position), `cycle_skipped[]` (session 31, world names skipped this cycle — stores names not IDs, matching the cycle's name-based matching), `map_positions{}` (session 24).

### World
- `id`, `name`, `short_description`, `tags[]`, `fandom_tags[]` (**vestigial as of session 35b** — still set on world creation and still migrated on load, but no editor UI and no display anywhere. Do not build a tag editor for these; they were deliberately removed. Any data left in them is unreachable from the UI.)
- `image` — base64 (legacy); `image_relpath` — `Worlds\WorldName.ext`
- `emoji` — single emoji shown in sidebar
- `pinned` — sorts first everywhere
- `notes` — per-world freeform scratchpad (shared between World Info tab and right-panel Notes tab)
- `plot_archetypes[]` — custom plot archetype strings for the Plot tool

### Character
- `id`, `name`, `display_name`, `short_description` (max 140), `full_description`
- `card` — character sheet / system prompt
- `example_dialogue`
- `tags[]` — max 25; CW tags excluded from cap (21 CW tags defined)
- `fandom_tags[]` — max 3
- `sus`, `very_sus` — boolean spicy flags (NOT tags)
- `image` — `{ relPath }` or `{ id }` (platform UUID)
- `companion_profile_banner_image` — `{ relPath }` or `{ id }`
- `portraits[]` — up to 10: `{ name, description, very_sus, relPath, data, image:{id} }` — `relPath` and `data` are app-only (local file reference / base64 cache); both are stripped from every Saucepan export (session 23)
- `starting_scenarios[]` — `{ title, message }` (max 7500 chars each)
- `formatting_instructions`, `advanced_prompt`, `example_dialogue`
- `access_level`, `open_definition`, `external_model_policy`
- `locked_starting_message`, `unlocked_portraits`
- `temperature_offset_percentage` — default 0
- `hide_on_owner_profile`, `suppress_companion_profile_banner`, `preserve_existing_chats`
- `posted_at`, `created_at`, `updated_at`, `voice_catalog_id`, `author_id`, `author_handle`
- **Local-only, stripped on export (14 fields, identical list in all four export paths):** `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `export_filename`, `lorebook_entry_text`, `lorebook_entry_title`, `voice_catalog_id`, `reworked_at`, `source_url`
- `source_url` — **session 45.** The companion's own page on Saucepan, pasted by hand. Edited on the Settings tab under Companions Folder, with a copy button, and shown as a copy row in the sidebar Quick Info. App-only and stripped like the rest, but it **does** travel into a SillyTavern card as V3 `source[]` — see SillyTavern Export. Both import paths preserve it without being told to (`{...existing}` in `updateCharFromJSON`, `Object.assign(existing, …)` in batch import), so a QC re-import does not wipe it.
- `voice_catalog_id` — Saucepan voice name (session 31). The platform has a voice catalogue but **does not export a voice field**, so this is tracked locally for reference only. Field already existed as a dormant `null`; reused rather than adding a second one.
- `reworked_at` — ISO stamp set when the character's JSON is exported; removes it from the dashboard Rework queue
- **App-only:** `status` (draft/ready/posted), `schedule_dates[]`, `posted_dates[]`, `collections[]`, `linked_lorebooks[]`, `world_id`, `companion_folder`, `site_last_synced_at`, `lorebook_entry_text`, `lorebook_entry_title`

### Lorebook
- `id`, `world_id` (null = standalone), `name`, `short_description`
- `content[]` — `{ id, title, text, char_id? }` chapters
- `tags[]`, `fandom_tags[]`, `nsfw`, `very_nsfw`
- `image_id` — platform UUID; `image_relpath` — `Lorebooks\cover.ext`; `image_data` — base64 (legacy)
- `definition_protection` — `'open'` | `'copy_protection'` | `'hidden'` (default: `copy_protection`)
- `access_level` — `'private'` | `'public'`
- `collaboration_type`, `has_been_public`, `posted_at`, `updated_at`, `hide_on_owner_profile`, `site_last_synced_at`
- **App-only:** `lorebook_filename`, `status` (`'draft'` | `'ready'` — added session 18, purely organizational, never sent to the site)
- **Kept in export (required by Saucepan):** `selected_chapter_index` — was incorrectly stripped in sessions 21–22, corrected in 22b; defaults to `0` if not stored locally

### Collection
- `id`, `world_id` (null = standalone), `name`, `definition` — internal field name; the platform calls this `description`, see Platform Export Requirements for the rename that happens at export time
- `tags[]`, `fandom_tags[]`, `access_level`
- `image` — `{ id }` platform ref; `image_relpath` — `Collections\banner.ext`; `image_data` — base64 (legacy)
- `companions[]` — platform IDs for auto-linking on import
- `has_been_public`, `very_nsfw`, `lorebook_display`, `posted_at`, `updated_at`, `site_last_synced_at`
- **App-only:** `collection_filename`
- `is_community` — **local-only, stripped on export.** Saucepan shows a Community badge on collections but does not include any such field in the collection JSON (verified against a downloaded export), so it has to be set by hand here. Drives banner inheritance: a companion in a community collection inherits that collection's `image.id` as its profile banner.

### Persona
- `id`, `name`, `pronouns`, `description`
- `image` — `{ relPath }`; `{ data }` is legacy and base64 is no longer written (see below); `image_relpath` — `Personas\name.ext`
- `portraits[]` — **session 45.** Up to 10: `{ name, description, relPath, data? }`, drag to reorder, any slot promotable to the main portrait. Deliberately **none** of the character portrait's platform fields — no `image.id`, no `very_sus`, no `gallery_only` — because a persona cannot be exported to or imported from Saucepan, and a field that can never travel anywhere only invites being filled in for nothing.
- `linked_lorebook` — single lorebook ID

**Every persona image file lands in ONE flat `Personas\` folder**, shared by every persona, and `copyImageToFolder` overwrites without checking. So portrait filenames are prefixed with the persona's name (`Adrian-ref sheet.png`); without that, two personas each adding a `ref1.png` would end up sharing one picture with nothing reporting it.

**`handlePortrait` used to write base64 AND a relPath** — the session-31 bug in miniature. `update()` deep-clones the whole data tree on every keystroke, so a blob in the data file is a cost paid per character typed anywhere in the app. Two personas were holding **3.08 MB** between them while already having working relPaths. Fixed in session 45: the relPath is stored and base64 is kept only as the fallback for a copy that actually failed, where it is the difference between a picture and no picture. Re-setting a portrait replaces `image` wholesale, which is how the two stale blobs were cleared without any migration code.

### Template (character creation)
- `id`, `name`, `world_id` (null = global)
- `fields` — any subset of: `display_name_format`, `short_description`, `full_description`, `card`, `formatting_instructions`, `advanced_prompt`, `access_level`, `sus`, `very_sus`, `temperature_offset_percentage`, `locked_starting_message`, `open_definition`, `tags[]`, `fandom_tags[]`

### Lorebook Template (per-world entry templates)
- `id`, `world_id`, `name`, `title_template`, `template_text`, `lorebook_id`
- **Storage note:** unlike `plot_archetypes` (nested directly on the `World` object, see above), this is a **flat top-level array** at `data.lorebook_templates[]`, with each entry tagged with its own `world_id` to associate it. Both patterns correctly scope content per-world functionally, but they're structured differently — worth knowing when writing any code that touches both, since "copy the world object" (which `plot_archetypes` rides along with automatically) does **not** also carry `lorebook_templates`. This caused a real bug — see Backup & Restore.

### Relationship (relationship map edges)
- `id`, `worldId`, `charA`, `charB` (character IDs), `label` (free text, e.g. "rivals", "siblings")

### Settings
- `anthropic_api_key` — for Claude panel
- `claude_model` — default `claude-sonnet-4-6`
- `font_size` — `'small'` | `'normal'` | `'large'` | `'xlarge'` — applied via CSS `zoom` on `document.documentElement` (see CSS Gotchas — NOT root font-size, that does nothing given the app's hardcoded-px CSS)
- `theme` — `{ accent_hex, mode }` where `mode` is `'dark'` | `'light'`; `null`/absent = default theme. Added session 20, see Theme System section.
- `autosave_debounce` — ms; default 600

---

## Saucepan Tags
659 tags embedded in the app across 15 categories. Valid for characters, lorebooks, and collections.

**Content Warning tags are derived live, never hardcoded.** `CW_TAGS` is computed as `Object.keys(SAUCEPAN_TAGS).filter(id => SAUCEPAN_TAGS[id].c === 'Content Warnings')`, so the count follows the tag data automatically. **Currently 31.** Do not re-hardcode the list: it was written here as 21, the session-34 changelog implied 23, and the live value is 31 — it has drifted twice already. Read it from the code when the number matters. CW tags are shown in red and exempt from the 25-tag cap.

---

## Navigation (Sidebar)
- **Dashboard** — calendar, today banner, upcoming, release cycle, site checklist, lorekeeper checklist, and the in-progress panel split into Drafts and Ready to schedule
- **Worlds** — world card grid; click -> WorldDetailPage (Characters / Lorebooks / Collections / Gallery / **Timeline** / World Info tabs)
- **Characters** — world filter dropdown + status filter dropdown (Draft/Ready/Posted), both via shared `WorldFilterDropdown`/funnel pattern (added session 18 — scales to any number of worlds without the filter row wrapping or growing); click -> CharDetailPage (11 tabs)
- **Lorebooks** — world filter dropdown (includes Standalone), same shared component; click -> LorePage (Chapters/Settings/Export tabs)
- **Collections** — world filter dropdown (includes Standalone), same shared component; click -> CollPage (Edit/Export tabs)
- **Personas** — player characters, independent from worlds; click -> PersonaDetailPage; "New Persona" button in topbar (added June 19 — was missing entirely, only Export/Delete existed once a persona was already selected)
- **Templates** — global and per-world character creation templates; card list grouped by world, with a world filter dropdown to narrow the grouped sections shown (added session 18)
- **Import/Export** — renamed from "Batch Import" session 19. Scan folders, import, rescan images, backup/restore, the continuous-backup panel, plus a "Quick Import / Backup" card at the top for single-file import and full-app backup (moved here from the sidebar footer — see below)
- **Settings** — AI provider and key, font size (applied globally), debounce, theme/colorblind, backup destination; full-width layout
- **Help** — 20 collapsible sections covering all features
- **Worlds list** — pinned first, emoji icon, right-click -> pin/unpin
- **Sidebar collapse** — icons only mode (52px wide). No footer (removed session 19 — see below). **Collapse/expand button fix, session 19:** at 52px collapsed width, the header's padding (24px) plus the logo icon (28px) already consumed the full available space, squeezing the collapse/expand toggle button to zero width — it was still technically in the DOM but invisible and unclickable, making the sidebar impossible to re-expand once collapsed. Fixed by stacking the logo and the toggle button vertically when collapsed instead of competing for horizontal space.
- **Topbar action button separator, added session 19:** a thin vertical divider now sits between page-specific action buttons (Delete, Export, Update from JSON, etc.) and the Notes panel toggle button on the far right of every page's topbar. Previously a destructive Delete button could sit directly adjacent to the panel toggle with only the standard 8px gap, on Characters/Lorebooks/Collections in particular — easy to misclick. The divider is positioned globally in the topbar layout (not per-page), so it applies consistently everywhere a topbar exists.
- **Logo** — clickable -> Dashboard

### Detail Pages
All four content-type detail pages share the same `char-detail` layout: a 260px left sidebar (image, quick info, tags) plus a main content area on the right with a tab bar.
- **CharDetailPage** — sidebar (portrait, platform image UUID, banner, quick info, tags) + main (11 tabs: Identity, Full Description, Character Card, Formatting, Scenarios, Portraits, Lorebooks, Collections, Settings, Schedule, Lorebook Entry)
- **LorePage** — sidebar (cover image, image ID, quick info) + main (Chapters, Settings, Export)
- **CollPage** — sidebar (banner image, quick info) + main (Edit, Export)
- **PersonaDetailPage** — sidebar (portrait, quick info incl. portrait count) + main (Profile, Portraits — second tab added session 45)

### Navigation helpers (defined in App)
- `openChar(c, tab?)` — sets selectedChar, sets selectedWorld to the character's world if not already set, navigates to `page='char'`
- `openLore(l)` — same pattern for lorebooks, `page='lore'`
- `openColl(c)` — same pattern for collections, `page='collection'`

All three exist so that opening any item — from the dashboard, quick find, a card grid, or anywhere else — always loads the correct world context, which the right-panel Notes tab depends on.

**This guarantee only holds if every call site actually uses the helpers.** Fixed session 19: the top-level `Characters` nav page (`page==='characters'`, i.e. clicking "Characters" in the sidebar directly rather than through a world) had its own separate, never-updated inline call — `setSelectedChar(c)=>{setSelectedChar(c);setPage('char')}` — that bypassed `openChar` entirely and never set `selectedWorld`. This wasn't a sync regression; it was a call site that was simply missed when `openChar` was introduced and never got audited until a user reported the Notes panel showing the wrong (global) notes when opening a character from that specific page. If "wrong notes panel" or "wrong world context" bugs resurface, audit every `setSelectedChar`/`setSelectedLore`/`setSelectedColl` call site for a raw bypass like this one before assuming it's a deeper bug — search for `setSelectedChar=c=>` / `setSelectedChar={c=>` etc. and confirm each one routes through `openChar`/`openLore`/`openColl`.

### Right Panel (toggle button in top bar)
- **Notes** — world notes (synced with World Info tab's Notes field) or global scratchpad when no world is active; auto-saves
- **Tools** — see Tools Panel section below
- **Claude** — AI chat assistant with full world context
- **Map** — Relationship Map; panel expands to 640px while this tab is active

---

## World Detail (sub-tabs)
**Characters - Lorebooks - Collections - Gallery - World Info**

**Characters** — card grid; home-world chars + chars belonging via the world's collections (cross-world membership)

**Lorebooks** — card grid (cover image, name, access badge, chapter count, tags); click opens full-page LorePage

**Collections** — card grid (banner, name, description preview, tags); click opens full-page CollPage

**Gallery** — **a derived view, with no upload.** Composed from everything in the world that owns an image: character main images, portrait slots, character banners, lorebook covers, collection banners and the world banner, each read by its relPath. Hover shows name, dimensions (WxH px), full Windows path (click to copy) and an extension badge. The Upload tile was removed in session 46b — see the Base64 section for why a gallery that stores its own images is the wrong shape.

**World Info** — full-width form: banner upload, name + emoji (side by side), short description, tags, lorebook templates, plot archetypes, notes, delete world

---

## Character Detail (tabs)
Tab count reduced 13 → 11 in session 25: Example Dialogue merged into Formatting; Export merged into Settings.

1. **Identity** — name, display name, short desc (140), world, tags (TagSelector, X/25 + CW), fandom tags (X/3), world tag suggestions
2. **Full Description** — markdown preview toggle
3. **Character Card** — markdown preview + macro reference panel
4. **Formatting** — formatting instructions, advanced prompt, example dialogue
5. **Scenarios** — max 7500 chars, markdown preview, macro reference, drag to reorder (drag handle is the grip icon only — not the whole card)
6. **Portraits** — up to 10 slots, drag to reorder, platform image ID per slot
7. **Lorebooks** — cross-world lorebook picker
8. **Collections** — cross-world collection picker
9. **Settings** — access level, temperature %, spicy flags, booleans, companion_folder; **Update from JSON / Export JSON / Export MD** (moved here from old Export tab, session 25); Delete Character button
10. **Schedule** — status (draft/ready/posted), schedule dates, posted date. Setting status to "Posted" auto-stamps today's date into `posted_dates` if empty
11. **Lorebook Entry** — fill world lorebook template for this character; save directly to lorebook

Quick Info sidebar shows: World, Status, Content rating, Access, Scenarios count, Lorebooks count, Collections count, **Last updated** (added session 18 — local `updated_at` date only, no site-sync framing, since this is purely "when did I last touch this in Lorekeeper").

---

## Lorebook Detail (tabs)
1. **Chapters** — chapter list (left) + editor (right); add/delete chapters; **drag-and-drop reordering** (added session 18 — was click-to-select only, no way to reorder without manually re-creating chapters); each chapter has a title and a markdown body
2. **Settings** — name, short description, world, **Status** (Draft/Ready — app-only, not sent to the site, added session 18 to fill a gap where new lorebooks had no way to signal "still in progress" since `access_level` only has private/public), Access Level, Definition Protection, auto-save filename, tags
3. **Export** — Export JSON and Export MD, both with warnings (added session 18 — previously only characters had pre-export warnings; lorebooks silently exported with a missing image UUID, no tags, or Open definition protection with no nudge). MD preview toggle, fixed session 18 (previously the preview button called a hardcoded no-op — see `lorekeeper-sessions.md`). Export tab is now full-width (fixed session 19 — `.export-panel` CSS, shared by this, `CollExportPanel`, and `CharExportTab`, had a leftover `max-width:600px` that made the tab look half-width on a wide page).

Quick Info sidebar shows: World, **Status** (added session 18), Access, Chapters count, Updated date. **Image ID field, fixed session 19:** the cover image UUID field used to be `readOnly` and only rendered at all if a UUID already existed (`{lore.image_id && <div>...}`) — meaning there was no way to ever set one in the first place, only to view/copy one that somehow already got there. Now a real editable input matching the character "paste UUID…" pattern.

## Collection Detail (tabs)
1. **Edit** — name, description (labeled "Description" in the UI; stored internally as `definition`, see Collection data model), world, access level, tags, auto-save filename, character picker. **Image ID field, added session 19:** collections had no editable UUID field at all anywhere in the app — only a checklist warning telling you it was missing, with nothing to actually fix it. Added an Image ID card matching the lorebook/character pattern.
2. **Export** — Export JSON and Export MD; full-width (same `.export-panel` fix as Lorebook Export, session 19)

---

## TagSelector Component
- 540-tag list with descriptions, search + browse by category
- CW tags shown in red with warning badge, excluded from 25-tag cap
- Freeform custom tags supported
- Click outside to close
- Wired to: Character Identity tab, Template editor, LoreSettingsTab, CollSettingsTab
- Tag chips in Batch Import scan results (all three types) with CW highlighting via `ScanTagChips` component

---

## World Tag Suggestions
- Character Identity tab shows "Common in this world" suggestions when search is closed
- Frequency computed from all other characters in same world
- Up to 10 sorted by frequency, excluding already-selected; CW tags get red badge
- Click to add instantly

---

## Import/Export (sidebar page, renamed from "Batch Import" session 19)

### Quick Import / Backup (added session 19)
A card at the top of the page for actions that aren't bulk folder scans:
- **Import single file** — the existing smart importer (`importJSON`) that auto-detects a character/lorebook/collection/full-data-restore JSON and routes accordingly
- **Backup everything** — full app backup zip (`exportAll`)
Both of these used to live as buttons in the sidebar footer. The footer was removed entirely in session 19 (it was contributing to the sidebar-header-scrolls-off-screen bug — see Babel/CSS notes — and competing for space at the bottom of a long Navigate+Worlds list); moving these two actions onto this page instead both fixed that and gave them more room to be properly labeled instead of cryptic icon-only buttons.

### Batch Import (folder scan)
1. Place files in `Companions\`, `Lorebooks\`, `Collections\`
2. **Scan Folders** — finds JSONs + images; badge: **new** / **update** / **local newer** / **up to date**
3. Auto-links characters to collections via `companions[]`
4. Sets `companion_folder`, `lorebook_filename`, `collection_filename`, `image_relpath` from scan
5. Tag chips shown per item with CW highlighting

### "Local newer" override
Items flagged "local newer" are skipped by default to protect local edits. Two ways to override:
- **Per-item:** an "Import anyway" button next to the badge on that specific item
- **Global:** a "Force import all (overwrite local edits)" checkbox at the top, with an amber warning banner while active

This matters for the real use case of restoring from a Saucepan companion-backup export — without an override, freshly re-importing a site backup would be silently skipped entirely if Lorekeeper's local timestamp looked newer (which it could, incorrectly, before the `parseTimestamp` fix — see Data Safety section).

### What gets carried over from a companion import (fixed June 19)
Previously, importing a companion from a folder discarded two things it shouldn't have:
- **Portrait UUID** — `obj.image.id` (the platform UUID, present in any site export) was being thrown away in favor of rebuilding `image` from a locally-matched file path only. Now: if the import JSON has `image.id`, it's preserved; local file path is only used as a fallback when there's no UUID.
- **Posted date** — characters imported with `access_level: 'public'` correctly got `status: 'posted'`, but `posted_dates` was left empty, requiring a manual "Add Posted Date" afterward. Now: if the character is posted and has no local posted date yet, one is derived from the import's `posted_at` (or `updated_at` as fallback).
- **`updated_at`** was being overwritten with `now()` on every import instead of using the site's actual value — this silently broke every future "local newer" comparison for that item. Now uses `obj.updated_at` from the import.

### Image Storage Audit
- **Rescan images** — scans folders, links images via `image_relpath`
- **Audit base64** — finds legacy base64 items; shows relpath status
- **Migrate** — writes to files, sets `image_relpath`, clears base64; no duplicates

### Backup & Restore

**Import/Export page layout (session 25, revised session 29) — three cards:**

**Backup card** — Export full ZIP backup; per-world ZIP via dropdown. These are app backups for disaster recovery, NOT for uploading to Saucepan. World **Export ZIP** (in world topbar, separate) — platform-ready zip of posted characters + public lorebooks + public collections, stripped of app-only fields, stamps `site_last_synced_at`; this is what gets uploaded to Saucepan.

**Restore card (session 29)** — two actions:
- **Import & merge from backup** (primary) — reads a backup ZIP, shows a preview of what will be added/updated/conflicted, then merges without deleting local data. See merge strategy below.
- **Restore from last good backup** (emergency only) — replaces all data with the auto-saved lastgood file. No zip needed.
- Destructive "Restore from backup zip" (full replace) removed in session 29 — the merge path covers the main use case safely; the lastgood restore covers emergencies.

**Import card** — single-item JSON import + batch folder scan.

**"Import from backup" merge strategy (decided + built session 29):**
- Content (`worlds`, `characters`, `lorebooks`, `collections`, `personas`, `templates`, `lorebook_templates`, `gallery`) — merge by `id`; newer `updated_at` wins. Items only in backup are added; items only local are preserved (merge never deletes).
- `schedule_notes` — merge by date key; local wins on conflict.
- `map_positions` — merge by world/char id; local wins on conflict.
- `release_cycle` — keep local order; append new world IDs from backup at end.
- `notes` — if local empty → take backup; if both have content → append with `--- Merged from backup [date] ---` separator; if backup empty → keep local.
- `settings` — never merge (personal preference).
- `schedule` — dead field, ignored.
- Conflicts (same `id`, `updated_at` identical or missing) — per-item choice: **Keep local** (default) or **Take backup**. Shown in the preview modal before committing.

Requires `adm-zip` (`npm install adm-zip` in `I:\Lorekeeper\`).

**`lorebook_templates` per-world backup gap, fixed session 19:** the per-world backup in `main.js` was missing `lorebook_templates` from its export object — fixed on both export and restore sides.

### Notes Backups
See Data Safety Architecture section — independent `.md` backup per world plus the global scratchpad, separate from the main data file.

---

## Backup

### Why this exists
Layers 1-5 of the Data Safety Architecture all defend against **software** failure — an autosave race, a bad write, a killed process. None of them defend against **losing the disk**, because every one of them writes to the same drive as the data they protect.

Session 35 opened with exactly that: an `I:` drive failure. Companions, lorebooks and collections survived (they are also on Saucepan). Templates were rebuildable. **Notes were not**, and neither were the ComfyUI workflows or LM Studio presets on the same drive. The drive came back after a reseat, so nothing was permanently lost, but the gap was real.

The full backup ZIP already contained everything including notes. The problem was that it also contained every image, which makes it gigabytes and therefore something you export occasionally rather than continuously. **The backup that held the notes was the one too heavy to run often.**

### The core insight
Images are re-downloadable from Saucepan. Notes are not. Text-only, the entire corpus — notes, templates, every per-item JSON, and the main data file — is small enough to push after every session.

### Destinations
`backup_provider` in Settings is the seam, shaped like `ai_provider`:

| Value | What it does |
|---|---|
| `none` | **The default.** Nothing is copied, nothing is uploaded, and the pretty-printed data file is not written either. A fresh install must do nothing rather than something wrong. |
| `github-api` | Uploads to a GitHub repository over the REST API. |
| `rclone` | Uploads to Google Drive, OneDrive or Dropbox through the bundled rclone. |
| `folder` | Copies into a folder on this machine — one another program keeps in sync, another drive, a network share. |
| `github` | **Retired.** The batch-script route. Kept only so an install still set to it is not silently switched; it disappears from the dropdown once changed. |

**Where the chosen provider comes from, and nowhere else: `settings.backup_provider` in the data file.**

`main.js` keeps a module-level `syncPaths` cache holding the retired script's paths, and `activeProvider()` used to read `syncPaths.provider` before falling back to the data file. That looked like a harmless shortcut and was a fresh-install bug. `resolveSyncPaths()` runs a one-time migration that adopts the legacy constants — `provider: 'github'` among them — whenever `I:\LorekeeperBackup\lorekeeper-sync.bat` happens to exist on the machine. So on any machine that had ever had the old setup, a brand-new install whose UI correctly showed **None** reported the retired script route to main, wrote a 33 MB pretty data file on close and launched a batch script it had nothing to do with. Found by running the packaged build (session 41).

**A cache of where some paths are must never answer the question of what the user chose.** `activeProvider()` now reads the data file and nothing else. The startup regeneration of `sync-paths.cmd` is gated on it as well, so an install on any current route never writes a generated file into a folder it does not use.

**Three places had to be fixed, not one, and the first fix looked like it had failed.** After `activeProvider()` was corrected, a fresh packaged build *still* wrote `sync-paths.cmd` into `I:\LorekeeperBackup`. The other two writers:

- **`set-sync-paths` wrote the file unconditionally.** The renderer pushes paths to main on every Settings change, and main regenerated the file whatever the route. It also read an absent provider as `'github'`. It now defaults to `'none'` and writes only for a script route.
- **The renderer seeded `backup_repo_dir` from the legacy migration.** `getSyncInfo().backupDir` comes from `resolveSyncPaths()`, so a fresh install copied `I:\LorekeeperBackup` into its own settings while the provider correctly read `none`. The comment four lines above that seed already argues that seeding the *provider* would "hand a fresh install a destination it never chose"; the same argument applies word for word to the folder, and was not applied to it. Now gated on the install already being on a script route.

**The diagnostic that found them: the generated file names its own author.** Its `SRC=` line is whatever `DATA_DIR` the writing process had. `SRC=I:\Lorekeeper\dist3\win-unpacked` proved a packaged build wrote it and ruled out the dev instance in one command. **When something writes a file it should not, read the file before reading the code.**

One dead value survives in all three gates: `legacy-folder` is checked alongside `github`, and nothing in the app has ever written it. Harmless, but do not read it as evidence that such a provider exists.

### The GitHub engine (session 37)
`src/github-backup.js`, with the IPC wiring in `src/github-ipc.js`. **No git binary, no cloned repo, no script, no terminal** — which is what makes it installable by someone who is not Ine.

A sync:
1. Read the remote tree for the branch, one recursive call.
2. Hash every local file with git's own blob hash — `sha1("blob <length>\0" + bytes)`.
3. Upload only the files whose hash differs.
4. One tree, one commit, one ref update.

**A sync with nothing changed costs four API calls and uploads nothing.** Confirmed on the real repo: the first run against an existing backup repo uploaded 1 file of 176, because it recognised the 175 the script route had already pushed as identical.

**Deletions are scoped, and this is stricter than the script was.** `robocopy /MIR` deleted anything in the destination not present in the source. The engine removes only paths under the folders it owns — Notes, Templates, Companions, Lorebooks, Collections, Worlds, Personas, and `lorekeeper-data.pretty.json`. A `README.md`, a `.gitignore`, the `ComfyUI/` and `LMStudio/` folders, the sync scripts and the stamp files are left alone. This is what lets the engine and the extras script share one repository.

**Pull guard, lighter than the script's.** The script had to abort outright, because mirroring ran first and would have deleted pulled commits off the disk. Here nothing local is at risk: the last commit this machine pushed is recorded, and if the remote head is something else, uploads proceed but **deletions are held back for that run** and the panel says so. Relevant to the mobile app.

**A truncated tree is refused.** GitHub stops listing past roughly 100,000 entries. Comparing against a partial listing would re-upload files that are fine and, worse, read a present file as missing, so the sync stops rather than guessing.

**Credentials.** The token is encrypted with Electron `safeStorage` and written to `app.getPath('userData')` — **never** the data folder, which is what gets backed up; a token written there would be pushed to the repository and stay recoverable from git history permanently. If `safeStorage.isEncryptionAvailable()` is false the token is refused rather than stored in plain text.

**`main.js` pins the app name with `app.setName('Lorekeeper')`, and that line is load-bearing.** Electron derives `userData` from the app name, and the name depends on how the app was launched: `electron .` reads `package.json` and gets `lorekeeper`, while `electron src/main.js` has no `package.json` beside the entry file and falls back to `Electron`. Both launchers exist in this repo, so one install had two app-data folders — and the token lives in one of them. Saved from one launcher it was invisible to the other, and to the scheduled run. Pinned, every launch path resolves to the same folder.

**A token cannot be moved between those folders.** `safeStorage` generates a key and protects it with DPAPI, but the generated key itself lives in a `Local State` file *inside* the userData folder. Move folders and the token travels while the key does not, so the blob stays intact and permanently unreadable. `readToken` therefore treats an undecryptable file as **absent** rather than as an error, which is what lets the panel ask for the token again instead of insisting it is connected. Changing the app name again would cost one re-paste.

**Token scope: fine-grained, one repository, Contents read and write.** Nothing else. Lorekeeper deliberately **cannot create a repository**, because creating one needs `Administration: write` or a classic `repo` token — blanket access to every repository on the account. The repository is made by hand, once. A backup tool should not hold the wider permission.

**Expiry.** A fine-grained token expires on a date chosen when it was made, and the backup stops when it does. GitHub returns the date on every response; the panel warns inside three weeks and turns red after.

The panel cannot warn about the **scheduled** run, which has nobody watching it: a token that lapses unattended produces a failed task and no visible sign. **Decided session 46b: a notification on task failure is enough** — no stamp file for the panel to read, and no second mechanism to keep in sync. The current token runs to 8 October 2027.

### Why `lorekeeper-data.pretty.json` exists
`saveData` writes compact single-line JSON. Git cannot diff a single line, so every commit of the data file would store a whole fresh blob rather than a delta. `writePrettyData()` in `main.js` emits a pretty-printed, **recursively key-sorted** copy alongside it.

Key sorting matters as much as the line breaks: without it, JavaScript reordering keys shows up as a full-file rewrite even when nothing changed. With both, a one-note edit diffs to two lines.

It is **not** written on every autosave — stringifying tens of MB is far too slow. It is written on close and before every backup. Trade-off: after a hard crash it is one session stale, which is acceptable since the compact file is intact.

The pretty file lands in `DATA_DIR`, which is the **source** repo's working tree, so it must stay in the source repo's `.gitignore`.

At 33 MB it is by far the largest thing in the backup, and the only file the API sends in full on most runs — measured at 15-20 seconds. If it ever becomes a problem the fix is to stop committing it: the per-item files already hold everything it contains.

### When a backup runs
- **The button**, on the Import/Export page.
- **The scheduled task**, via `Lorekeeper.exe --backup` — no window, runs the backup, exits with a code. It goes through the **same** `runBackup` the button does. Two implementations is how the old setup ended up with a panel reporting healthy pushes while the scheduled run had been failing for days.
- **On close**, the pretty file is refreshed and nothing else. Uploading is deliberately not done here: a 15-20 second push inside an 8-second close window would be killed halfway every time while appearing to have run.

### Image and model exclusion is layered on purpose
A wrong path here does not fail loudly — it silently sweeps up tens of GB. So exclusion happens at every level: only text-bearing folders are ever walked; an extension filter drops image, video, audio and archive types; a per-file size cap refuses anything over 40 MB; and the repository `.gitignore` repeats all of it as a second lock.

**Keep the engine's extension list in sync with `IMAGE_EXTS` in `main.js`.** The script's first run leaked a `.avif` because its list had png/jpg/jpeg/webp/gif/bmp while `IMAGE_EXTS` includes `avif`. A single 100 KB file did not matter; the silent gap did.

### The rclone engine — Google Drive, OneDrive, Dropbox (session 38)

`src/rclone-backup.js`. **Confirmed working against Google Drive on 11 October 2026**, including the browser sign-in and the round-trip connection check. Everything else was already tested against the real rclone binary — see Verified Behaviour.

**Why rclone rather than a native integration.** Drive, OneDrive and Dropbox issue no user-pasteable credential the way the AI providers do. They require OAuth, where the *application* is registered with the provider — so natively that application would have to be Ine: her Google Cloud project, her consent screen, her quota, her name on verification, carrying other people's backups, three times over. rclone is already registered with all of them, owns the OAuth itself, and keeps its tokens in its own config. **Lorekeeper never handles a cloud credential at all**, which is also why `safeStorage` has nothing extra to protect on this route.

**`rclone sync` deletes everything at the destination that is not in the source.** Verified, not assumed: a test sync wiped a `README.md` and an unrelated folder. That is the same footgun as the old `robocopy /MIR`. So **this engine never syncs a whole destination.** It runs one `sync` per owned folder, each to its own path, and `copy` — never `sync` — for the loose `lorekeeper-data.pretty.json`. Deletion is therefore confined to folders Lorekeeper created, and anything else on the account survives. Same ownership rule as the GitHub engine and the folder mirror; all three now behave identically on this point, which is the whole reason they can share a destination.

**File selection is not reimplemented.** A sync first calls `mirrorToFolder()` into a staging directory, then rclone uploads that directory. The alternative was re-expressing the folder list and the image exclusion in rclone's filter syntax, and every piece of logic this project has kept in two places has drifted within a few sessions. Staging costs a second copy of the text corpus on disk, but only changed files are rewritten, so after the first run it is kilobytes.

**Config and staging are isolated.** Every rclone call passes `--config` pointing at `userData/rclone.conf`. Without it rclone reads `%APPDATA%\rclone\rclone.conf` — the user's own, which may already hold remotes for something else. A backup tool has no business writing there or depending on what it finds. Staging lives at `userData/rclone-stage`, **not** in the data folder, because the data folder is what gets backed up and a second copy of the corpus inside it would be backed up too.

**Sign-in avoids rclone's interactive config entirely.** `rclone authorize <backend>` opens the browser, takes the user through consent, and prints the token between two markers; the token is captured from stdout and written with `rclone config create ... --non-interactive`. The marker parser **fails closed** — an unrecognised output is an error, never an empty token — because it is screen-scraping and the alternative is a remote saved with no credential.

**The connection proves itself before being kept.** The OAuth flow could not be tested without a cloud account, so the first person to connect one *is* the test. Rather than trust that a saved token means a working destination, `verifyRemote()` writes a small file, reads it back, compares the contents and deletes it. **A connection that fails this is removed rather than kept**, because a connection that cannot store anything is worse than none: the panel would report healthy backups. Tested against a working destination, an unwritable one and a nonexistent remote.

**The binary.** `resolveRclone()` looks in `process.resourcesPath/rclone/` first, then falls back to any `rclone` on `PATH`. `package.json` carries an `extraResources` entry mapping `vendor/rclone` → `rclone`, so **a build requires `vendor/rclone/rclone.exe` to exist**; without it a packaged build has no uploader and the UI says so plainly rather than failing oddly. The PATH fallback is what makes the route testable in dev before any build exists.

**Finding the binary in DEV needs the vendor folder, and that was missed once.** `process.resourcesPath` points inside `node_modules/electron/dist/resources` when running from source — Electron's own folder, nothing to do with this project — so a binary placed at `vendor/rclone/rclone.exe` was never looked at and the resolver fell through to `PATH`. `main.js` now passes `vendorDir` as well, and the "could not be started" message lists every folder it checked rather than only asserting that the install is incomplete.

> **Still not verified: a packaged build's bundled binary.** `extraResources` is configured and the resolution logic is tested against the packaged folder shape, but no packaged build has been made with the binary in place. OneDrive and Dropbox are also untested; only Google Drive has been through a real sign-in. There is no reason to expect them to differ — rclone owns all three flows identically — but they have not been run.

### The extras script — optional, and no longer about Lorekeeper
`lorekeeper-sync.bat` in the backup folder now carries **only folders belonging to other programs**: ComfyUI workflows and settings, the ComfyUI-Manager snapshot list, and LM Studio `config-presets`. Those were lost in the same disk failure and neither app can trigger Lorekeeper's shutdown hook.

It is entirely optional. Nothing in Lorekeeper requires it, a fresh install does not have it, and deleting it costs nothing but those extras. Its configuration lives in `sync-extras.cmd`, which Lorekeeper never reads or writes — the app has no business knowing about software it does not use, and a copy given to someone else must not carry fields for programs they may not have.

**`.lmstudio\credentials` is deliberately never copied.** It holds API keys. A secret committed once stays recoverable from git history forever, even after the file is deleted, so it is excluded in the script *and* in `.gitignore`.

**It pulls now rather than aborting.** The old version aborted whenever the remote was ahead, which was correct then: it mirrored Lorekeeper data with `/MIR`, so pulling and then mirroring would have destroyed what was just pulled. Now that it only touches `ComfyUI/` and `LMStudio/`, there is no such pass, and `git pull --rebase --autostash` is safe. Without this change it would have aborted on every run forever, since the app pushes directly and the clone is behind on nearly every one.

**Keep these files plain ASCII, with no `chcp` line.** Changing the codepage mid-script makes cmd re-read the remainder under a different encoding and lose its byte position; it then executes fragments of its own comment lines as commands. That is what broke the sync on 8 October 2026.

### Notes on operation
- The backup repo's `.gitignore` is roughly the **inverse** of the source repo's. The source repo excludes `Companions/`, `Notes/`, `Templates/` as personal data; in the backup repo those folders are the entire point. Copying one over the other produces a repo that faithfully syncs nothing.
- `.gitattributes` sets `* -text` to disable CRLF conversion. Without it, git rewrites line endings on checkout, producing phantom full-file diffs on every note.
- Run `git gc` occasionally. Repo growth is essentially the pretty JSON's history; everything else combined is under 2 MB.
- Rejected, with reasons, in `lorekeeper-roadmap.md`: a Google Drive folder as the primary destination, a desktop-client folder as the answer for shared builds, native OAuth for Drive/OneDrive/Dropbox, and in-app repository creation.


## Auto-Save to Disk
- Characters -> `Companions\{folder}\companion.json`
- Lorebooks -> `Lorebooks\{filename}.json`
- Collections -> `Collections\{filename}.json`

> **These per-item files are Saucepan export shapes, not complete backups.** `saveCompanionJson` strips `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `export_filename`, `lorebook_entry_text`, `lorebook_entry_title`, `voice_catalog_id`, `reworked_at` and portrait `relPath` before writing. Restoring from them recovers a character's *content* but not its world membership, collection membership, linked lorebooks or schedule state — as happened in session 16, where that had to be rebuilt by hand. Those fields live only in `lorekeeper-data.json` (and now, via the pretty copy, in the backup repo). Any future two-way sync needs a `local.json` sidecar holding exactly the stripped fields; see Mobile Companion App.
- Personas -> `Personas\{name}-persona.json` (session 35) — debounced 800ms from `PersonaDetailPage`, same pattern as Notes and Templates. `image.data` base64 is stripped before writing; `image_relpath` is the real reference and the blob would only bloat the backup. Personas are a Saucepan concept but **cannot be exported from Saucepan**, so Lorekeeper holds the only recoverable copy. The pre-existing `.md` files in that folder are manual exports, not backups — markdown is a formatted document and cannot be reimported.

- Timelines -> `Timelines\{world}.json` (session 43) — one file per world, carrying the world name and id, a `saved_at` stamp, that world's lanes and its events.

> **Timeline data lives at the top level of the data object**, not inside the world it belongs to: `data.timeline_events` is one flat array for the whole app with a `worldId` on each event, and `data.timeline_lanes` is an object keyed by world id holding that world's strand names (default `['Main']`). The per-world file is assembled from those two on write.
>
> **ONE writer, not one per mutation.** `TimelinePanel` changes timeline data in five places — add, edit, delete, reorder, rename a strand — and a save call in each is this project's oldest recurring bug. Instead a single `useEffect` watches the world's computed slice and writes it debounced, so all five land in it and a sixth added later does too. It skips the render that merely opened the tab, and skips re-renders whose content is unchanged.
>
> **Adding a data folder means changing four lists, and missing one fails silently.** The startup folder creation in `main.js`, the restore/scan folder list, `MIRROR_FOLDERS` in `github-backup.js` (which rclone shares), and the **source repo's `.gitignore`** — that last one matters most, because the source repo is public and the data folders sit inside its working tree.

> **Worlds still have NO per-item file, deliberately.** There is no `save-world-json` handler and none is wanted: world metadata is a name, an emoji, a description and some tags — small, visible and quick to retype. A timeline is weeks of dated events across parallel strands and can be re-derived from nothing, which is why it got a file and the world did not. `Worlds\` holds **only banner images** — verified against the real folder, session 42: nine images, no JSON.

- New items auto-get folder/filename from name (sanitized, no trailing underscores); clearable to opt out
- `updated_at` stamped on every edit
- Writes happen async (`fs.promises.writeFile`) and are debounced (default 600ms) to avoid disk thrashing during typing
- A pending debounced save is flushed on window close (session 32) — main holds the window open until the renderer confirms the write. See Data Safety Architecture, Layer 5.

---

## Image System
- All uploads copied to local folder via `copyImageToFolder`; stores `image_relpath`
- **`copyImageToFolder` takes positional args** — `(srcPath, destFolder, filename)`. `preload.js` wraps them into the object the IPC handler expects. Passing a single object silently breaks it: `srcPath` receives an object, `path.normalize()` throws in main, the catch returns `null`, and callers fall through to their base64 fallback. This was the cause of the session-31 190 MB data file (see Performance Notes).
- `ImgFromPath` component resolves both relPath (via `readImagePath` IPC) and base64 data URIs
- `RelPortrait` (relationship map) does the same resolution for SVG `<image>` elements
- Supported formats: jpg, jpeg, png, gif, webp, avif
- Export strips all base64
- **The base64 migration is over, and its machinery was removed in session 35j.** `ImageMigrationPanel` is now **Rescan images and nothing else**. Audit base64, Migrate and Clean up leftover are gone — they were one-time tooling for a migration that completed in session 32, and they cost about 14 KB of a Babel block that sits under a hard ceiling. Anything describing four audit buckets (`relpath_ok`, `relpath_broken`, `needs_migration`, `leftover_data`) is describing code that no longer exists.
- **Rescan survived because it is not migration machinery.** It repairs a lorebook or collection whose `image_relpath` went missing after a restore or a merge, by matching files on disk back to their records. It writes only that one field, and only when it is absent, so it cannot overwrite a working link.
- **The removed functions are recoverable from git if base64 ever reappears.** The IPC they depended on — `scanLorebooks`, `scanCollections`, `listFolderImages`, `writeImageFromBase64`, `saveDataAllowShrink` — is all still present in `main.js` and `preload.js`, untouched. `saveDataAllowShrink` is what any future bulk shrink must write through; an ordinary save is refused by the Layer 2 guard.

### Base64 — resolved, and the data file went from 29.68 MB to 3.78 MB

The migration out of base64 completed in session 32, and the **write paths that put it back were never fixed with it.** Found in session 45 by measuring the live data file: **23.45 MB of 29.68 MB was base64**, in nine items. Every writer is now corrected and **the data file holds no base64 at all.**

**Measured end state (30 October 2026): 3.78 MB, zero blobs, nothing lost** — every world, lorebook and collection still carries an image reference, and the counts are unchanged at 13 worlds, 76 characters, 31 lorebooks, 12 collections, 6 personas. That is an 87% reduction in the thing `update()` deep-clones on every keystroke.

**The blobs were duplicates, not originals.** Eight of the nine items already had a working `image_relpath` pointing at a real file; the ninth, the Standalones collection, had no relPath but its 3.54 MB of base64 decoded to exactly the 2.66 MB `Collections/standalones.png` that was already on disk. So nothing ever had to be written out — clearing was pure subtraction. **Check that before building a migration**: the expensive version of this job writes blobs to disk, and the cheap version discovers it does not have to.

| Where | Blob found | Writer |
|---|---|---|
| Lorebook covers | 15.48 MB | fixed, session 46 |
| World banners | 4.43 MB | fixed, session 46 |
| Collection banners | 3.54 MB | fixed, session 46 — **was the same inline closure duplicated twice**, on the clickable banner and on the button under it; consolidated into `handleCollImage` rather than patched in both places |
| Character portraits | 2.45 MB | fixed, session 46 — one character held all of it |
| Character banners | 0 | fixed, session 46; latent, had never fired |
| Personas | was 3.08 MB | fixed, session 45; blobs cleared by re-setting the portraits |

### The second bug, which is not the same as the first

Storing the blob **and** the path was one defect. The other was that the collection and lorebook handlers **gated the copy itself on the auto-save filename**:

```js
if(col.collection_filename){           // the AUTO-SAVE setting
  const res = await copyImageToFolder(…);
  if(res){ …store relPath…; return; }
}
setCol(c=>{c.image_data=r.base64;});   // everything with no filename lands here
```

`collection_filename` decides whether a collection auto-saves its JSON. It has nothing to do with whether an image can be written to disk — it was only being used as a *name* for the file. But with it empty the handler fell straight through and stored base64, writing no file at all. **Three collections had it empty** (Standalones, Events, The Modern Takarabune), so setting a banner on any of them could only ever produce a blob.

**This is why re-uploading the Standalones banner appeared to do nothing.** The code was doing exactly what it was told, every time.

Both handlers now fall back to the item's own sanitised name — `Standalones.png` — which is what the world banner and persona handlers already did. The lorebook handler had the identical gate; latent, because all 31 lorebooks have a filename set, and fixed in the same pass.

**The general rule: never gate an operation on a setting that governs something else.** A field used as a *name* must not decide whether the write happens.

**The last writer was removed rather than fixed (session 46b).** `handleGalleryUpload` on the world Gallery tab pushed `{data: base64}` into `data.gallery[]` with **no copy at all**, so it never wrote a file.

It was deleted, along with its Upload tile and the orphaned `.gallery-upload` CSS, because **the Gallery tab is a view, not a store.** It already composes itself from images that something else owns — character main images, portrait slots, character banners, lorebook covers, collection banners and the world banner — every one read by its relPath. The upload was a redundant fifth source whose images existed nowhere but inside the data file, which is the opposite of what this app is for.

`data.gallery[]` survives in `initData` and one render line so any legacy item still displays; **nothing writes to it.** There were zero such items when it was removed. Deleting the array as well would mean touching `initData`, the `worldGallery` computation, the prop threading, the render, and the backup merge strategy — not worth it for an empty, harmless field.

**This is the single largest performance item in the app.** `update()` runs `structuredClone` over the whole tree on **every keystroke**, so 23 MB of blobs is a cost paid per character typed anywhere — the same mechanism that produced the 190 MB file in session 31, just at a quarter of the scale.

**The shape of the bug was always identical:** `copyImageToFolder` returns `{relPath, base64}`, and the handler stored *both* instead of just the path. The fix was always the same line — keep `relPath`, pass `null` for the blob, and fall back to base64 only when the copy genuinely failed, where it is the only copy of the picture. **Any new image handler must follow that shape**; it is the single most repeated defect in this project's history.

### How it was cleared, and why no tool was built

By hand, in nine steps: open each item, re-pick the image it already pointed at, done. **No migration code, and `saveDataAllowShrink` was never needed.**

That last point is the one worth keeping. A single bulk clear of 23 MB out of 29 MB is a 79% shrink and the Layer 2 guard would have **refused** it, dumping the result into `lorekeeper-data.SUSPICIOUS.json` — exactly the session-32 trap. Clearing item by item is a small shrink each time and passes normally. Confirmed afterwards: `SUSPICIOUS.json` still carried its July timestamp, so not one of the nine saves was refused.

**Re-picking a file that is already inside the data folder is free.** `copyImageToFolder` early-exits when the source is already under `DATA_DIR`, returning the existing relPath without copying. So no duplicate files, no renames, and the folders came out exactly as they went in.

**A panel to automate this was offered and declined, correctly.** At nine items the manual route is faster than building the UI, and the removed session-35j machinery would have cost ~14 KB of Babel block weight to reinstate for a one-time job. Do not re-propose it at this scale; if base64 ever reappears in volume, the IPC it would need is all still present and untouched — `scanLorebooks`, `scanCollections`, `listFolderImages`, `writeImageFromBase64`, `saveDataAllowShrink`.

**Every image consumer must read `*_relpath`, not just the base64 field (session 32 regression).** Clearing the leftover base64 made world and collection images vanish across the app. The relpaths were correct and the files were on disk — the *views* were the problem. Several read the base64 field directly with no relpath fallback, so the base64 had been silently masking a pre-existing gap. Two distinct failures:

1. **Missing fallback.** The Worlds card read `w.image` and fell back to another collection's `image_data`, never touching `w.image_relpath`. Same for the world detail header banner, the 16px world icons, the lorebook picker thumbnail, and the collection detail world fallback.
2. **CSS `url()` cannot resolve a relpath.** The collection cards (both All Collections and the world detail Collections tab) rendered via `backgroundImage: url(...)`. A relpath resolves relative to `src/index.html`, not the data folder, so it could never load even where `image_relpath` *was* in the chain. Any image that might be a relpath must go through `ImgFromPath`, which resolves it via the `readImagePath` IPC — never through a raw `<img src>` or a CSS background.

The Site Checklist was also affected: its "no local image backup" test was `if(!l.image_data)`, which would have flagged every migrated lorebook and collection, with blank thumbnails alongside.

**Lesson:** before clearing a field made redundant by a replacement, audit every *consumer* of that field. Verifying that the replacement resolves is not sufficient — it proves the data is reachable, not that anything actually reads it. Grep for the old field name and check each hit.

---

## Token Estimation — calibrated against Saucepan (session 35o)

`estimateTokens(text)` lives in the plain-JS block. It feeds the Character Card meter (`CARD_TOKEN_CAP` 2600 green / `CARD_TOKEN_MAX` 2900 amber / red beyond) and the Assistant's context readout.

### What it reads in

**Saucepan's own units.** The meter is calibrated so a card reading 2600 in Lorekeeper reads about 2600 in the site's Tokens and Temperature panel. Before session 35o it was calibrated against `gpt-tokenizer` (cl100k) instead, which is not what the site reports.

Saucepan serves four models that tokenize differently, so the site shows a blended estimate of its own rather than any one tokenizer's count. That estimate sits consistently **above** cl100k, which is why a function accurate to cl100k read low on the site.

### The calibration

Measured against six real companions — Dylan, Naka, Nagakura, Sebastien, Rob, Don Pedro — taking both the `card` field and the `example_dialogue` field, twelve texts in all. The pre-35o function undercounted the site on **every one**, by 4.5% to 6.7%. A single scale error, not a shape error.

`SAUCEPAN_CAL = 1.072` corrects it. That is the **top** of the measured ratio range, not the mean (1.062), which preserves the long-standing property that the meter errs HIGH — the safe direction for a cap. Result across the twelve: never under, at most 2.5% over, mean absolute error 0.98%.

Validated on six further texts the site counts separately (the scenario / first-message block): five landed between −0.5% and +4.8%. The sixth, Rob, has four scenarios while the site reported a figure consistent with one — a counting-scope mismatch on the site's side, not an estimator failure.

### Why one constant and not a refit

Three-parameter and seven-parameter least-squares refits were tried and **rejected**. Both beat the single constant in-sample and both **lost under leave-one-out cross-validation**:

| Model | In-sample worst | LOO worst | LOO mean |
|---|---|---|---|
| Single constant × existing function | 1.68% | **1.74%** | 0.62% |
| 3-parameter refit | 1.52% | 2.36% | 0.92% |
| 7-parameter refit | 1.07% | 2.16% | 0.76% |

The seven-parameter fit also produced a **negative newline weight**, which is physically nonsense — proof it was fitting noise rather than structure. With twelve data points one constant is all the data supports.

**If more real numbers are ever collected:** retune `SAUCEPAN_CAL` first, and only add parameters if cross-validation actually improves. Do not trust an in-sample improvement.

### Why the function has the shape it does

`chars/4`, the usual rule of thumb, is tuned for plain English prose and breaks badly on card markdown. Measured at ~2600 tokens of dense markdown (tables, `###`, `**`, `{{macros}}`, dividers) it reads 1953 — a 25% **under**count, so a card at its cap would look like it had 650 tokens to spare. On pure prose it overcounts by 23% in the other direction.

The shipped form models what a BPE tokenizer actually does: short common words cost one token regardless of length, long words split roughly per 4 chars, runs of punctuation collapse, newlines are cheap.

### Consequence of the recalibration

Every card now reads about 6% higher than it did before, because it is no longer reading low. Cards that sat just under 2600 will cross it. Of the six calibration companions, **Nagakura newly crosses the 2600 line** (2558 → 2743). The caps did not change; what changed is that they now measure the same thing the site measures.

### How it was verified

The function was **extracted back out of the shipped `index.html`** and re-run against all twelve site numbers, rather than re-typed into a test. Same method as the crop and cycle simulations, same reason.

---

## Text Highlighting (session 35j)

Marked with `==double equals==` stored in the text itself, so highlights survive saves, land in the per-item files and show in git diffs. Painted as amber bands by a mirror div behind a transparent textarea — a textarea cannot render formatting, and marks visible only in Preview do not help while writing.

**Stripped from every export** by `stripHighlights`, which walks the whole assembled object recursively in all three builders rather than naming fields — a per-field list would drift exactly as the export strip lists did.

Three things that each broke it once, all worth remembering:
- **Multi-line is the main case.** The first version required the whole selection to match the single-line pattern, so any selection crossing a newline silently did nothing. Each line is now wrapped separately, which also means an edit inside a marked section cannot orphan an opening marker.
- **The button stole the selection.** Clicking it moved focus out of the textarea, so `selectionStart === selectionEnd` by the time the handler ran. Needs `onMouseDown` prevented.
- **CSS could not make the textarea transparent.** `.field-block textarea` is more specific than any single class, so the mirror stayed hidden behind an opaque background. The textarea is made transparent at runtime instead, and the mirror copies the textarea's computed font, padding and border so the bands align wherever the field is used.

The pattern requires non-space on both inner edges, so prose like `a == b` is untouched, and a line containing `=` is skipped rather than mangled.

---

## Portrait Fields (session 35)

Each portrait carries four site fields beyond the image itself:

| Field | Meaning |
|---|---|
| `description` | Guides the LLM's portrait selection in chat. Required by the site. |
| `caption` | Shown to users in the gallery. Max 200. Distinct from `description`. |
| `very_sus` | **Extra Spicy** — the site blurs the image until the viewer opts in. |
| `gallery_only` | Image appears in the gallery only; the LLM will not select it in chat. |

All four export in every path, and batch import preserves them (the portrait object is spread wholesale).

**The bug this fixed:** portraits added locally were hardcoded `very_sus: false` with no UI to change it, while the flag is set on Saucepan. So a portrait marked Extra Spicy on the site read as false in Lorekeeper, and the next export **un-blurred it**. Found by diffing Lorekeeper's `companion.json` against Saucepan's own export for the same character — the field was present in both and disagreed.

Editors: chips on the Portraits tab (red Extra Spicy, blue Gallery only) and matching corner badges on the world Gallery tab. Colours differ deliberately — red reads as a content warning, blue as a routing setting.

**Lorekeeper cannot detect these from the site.** Keeping them accurate is manual unless the character is re-imported, in which case the site file wins (correct — the site is where they are actually set).

---

## Image Cropping — TWO models, do not confuse them (session 35k)

### Saucepan crop (characters) — exports to the site
Confirmed from real exports at both extremes, not inferred:

| Field | Range | Notes |
|---|---|---|
| `image_crop_x` / `_y` | **-1 .. +1** | -1 = top/left, 0 = centre, +1 = bottom/right |
| `image_crop_zoom` | **1.0 .. 1.5** | **`null` means 1.0**, not "unset" — the site writes null at minimum zoom |
| `companion_profile_banner_crop_x` / `_y` / `_zoom` | same | separate crop for the profile banner |
| `default_profile_banner_collection_image_crop_*` | same | inherited collection banner |

**The pan range does not scale with zoom** — ±1 is reachable at 1.0 and at 1.5 alike. CSS mapping is `objectPosition = (v + 1) / 2 * 100%`, implemented in `cropToCss`. Edited via `SiteCropControl` under the main portrait.

**Use `??` not `||` on every one of these.** `0` is a legitimate centre value and `null` zoom means 1.0; a truthiness check silently replaces both with defaults. This has bitten twice — the banner-focus slider snapping back at 0% was the same class of bug.

**These were being destroyed on every round-trip until session 35k.** Batch import builds the character from an explicit field list and none of the nine crop fields were in it, so a crop set on the site was dropped on import and absent from the next export. Same shape as the Extra Spicy portrait bug: a field that exists in both systems, is never read by one, and quietly reverts. `companion_profile_banner_very_sus` and `hidden_fields` were going the same way and are now preserved too.

**Still not implemented:** a control for the profile-banner crop (the fields are preserved and exported, just not editable here).

### Lorekeeper banner focus (worlds and collections) — never exported
`banner_focus`, a CSS `object-position` string, is a **local display setting only**. Worlds do not exist on Saucepan, so there is nothing to round-trip; for collections it is explicitly stripped in `buildCollExport` or it would ride along in `...rest` as an unrecognised field.

**Do not merge the two models.** They look similar and mean different things: one is the site's framing, one is what Lorekeeper's own previews show.

---

## Export Shape Builders (session 35d)

**Single source of truth for every Saucepan-shaped file.** Three functions in the plain-JS block, beside `resolveBannerId`:

| Builder | Signature | Used by |
|---|---|---|
| `buildCompanionExport` | `(c, data)` — needs `data` to resolve inherited banners | 5 call sites |
| `buildLoreExport` | `(l)` | 5 call sites |
| `buildCollExport` | `(c)` | 5 call sites |

A **fourth** pair, `buildSillyTavernV2` / `buildSillyTavernV3`, lives beside them and targets a different platform entirely — see SillyTavern Export. It was put here rather than inline in the UI for exactly the reason this section exists.

**Do not inline a strip list anywhere else.** If Saucepan changes a field, change it in the builder and nowhere else.

### Why this exists
The shapes were previously rebuilt inline at every call site: character in 4 places, lorebook in 4, collection in 4. Each carried its own hand-maintained field list, and they drifted — three times (sessions 18, 31, 35b), each "fixed by matching" one copy to another, each time leaving copies unfixed. By session 35b the damage was:

- `setCol` never received the `definition` -> `description` rename that `exportColl`'s own comment documents having fixed. **Every auto-saved collection file had been shipping with no description text.**
- `exportChar` and the ZIP character loop still leaked portrait `relPath` two sessions after that fix was written — the two paths that actually reach Saucepan were the two still broken.
- `updLore` was five fields behind `exportLore` and omitted the derived `collaboration_type` and `selected_chapter_index` entirely.
- `handleCollBackup` destructured without `definition`, so `rest` still carried it while the code also added `description` — **that file shipped both fields.**

### How the copies were found, and why each method was insufficient
Worth recording, because each step found things the previous one missed:

1. **Reading the code** (the app audit) found 4 character, 2 lorebook, 2 collection copies.
2. **Comparing the strip lists as sets** — `grep -o` the destructure patterns, check each type collapses to one distinct field set — found three more: a fifth lorebook copy in `handleLoreBackup`, and `export_filename` unstripped in `saveCompanionJson` and `updChar`.
3. **Consolidating** found `handleCollBackup`, which both earlier methods missed because its strip list was shorter *and* differently ordered, so it matched none of the grep patterns.

**The lesson: cross-checking finds the copies you already know how to look for. Removing the copies is what finds the rest.** If a similar duplication is suspected elsewhere (`ResolvedImg` / `ImgFromPath` are the remaining candidate pair), consolidate rather than audit.

### Verification status
**Companions and lorebooks: verified end to end (session 35e).** Exported from Lorekeeper and uploaded to Saucepan successfully — not just inspected on disk, but accepted by the platform. These were the two shapes carrying the most drift, so this clears the bulk of the risk.

**Collections: verified**, after the `lorebook_display` fix. Collections had the worst of the drift — `handleCollBackup` was shipping `definition` and `description` together, and `setCol` had been omitting the description text entirely — so this was the one that most needed confirming.

**World Export ZIP: verified.** Its three per-type loops were the paths that had diverged the furthest, which is why they were checked separately rather than assumed to follow the individual exports.

All three shapes and both export routes are therefore confirmed. Nothing in this section is outstanding.

The builders are strictly stricter than the code they replaced, so the residual failure mode is a field missing from an export rather than a bad field reaching the site.

---

## Export Filename Convention
All exports follow `{name}-{type}.{ext}` — consistent across all content types:
- Character JSON: `{name}-character.json`, **but `companion.json` when the character has a `companion_folder`** — it exports into its own folder, so the name is already unambiguous and matches what auto-save writes there
- Character MD: `{name}-character.md`
- Lorebook JSON: `{name}-lorebook.json`
- Lorebook MD: `{name}-lorebook.md`
- Collection JSON: `{name}-collection.json`
- Collection MD: `{name}-collection.md`
- Persona MD: `{name}-persona.md` (manual export only — a formatted document, **not** reimportable; the auto-saved `{name}-persona.json` is the recoverable copy)
- Full backup ZIP: `lorekeeper-backup-{date}.zip`
- World backup ZIP: `lorekeeper-world-{date}.zip`
- Platform export ZIP: `{worldName}-platform-export-{date}.zip`

**Exports remember their filename.** Each item carries an `export_filename` field, and `exportChar`/`exportLore`/`exportColl` default to it rather than to the current title — deliberately, so renaming an item does not silently start exporting to a new file alongside the one already on Saucepan. Consequence worth knowing: deleting an exported file from disk does not stop it coming back, because the remembered name is still in the data and the next export recreates it.

## Platform Export Requirements
All three export paths — `exportChar`/`exportLore`/`exportColl` (single-item Export JSON buttons) and `exportWorldPlatformZip` (world topbar Export ZIP) — must stay in sync with each other. They duplicate the same stripping/field-mapping logic rather than sharing one function, so a fix applied to one must be applied to both; this has been a repeated source of bugs (see session 18).

**Characters:** `display_name`, `name`, `short_description`, `full_description`, `card`, `tags[]` (min 5), `image.id`, `portraits[]`, `starting_scenarios[]`
Strips: `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `export_filename`, `lorebook_entry_text`, `lorebook_entry_title`, `voice_catalog_id`, `reworked_at`; from portrait objects: `data` (base64) and `relPath` (app-local path) — session 23
`exportChar` was missing `posted_dates`/`companion_folder`/`site_last_synced_at`/`lorebook_entry_text`/`lorebook_entry_title`/`voice_catalog_id` from its strip list until session 18 — only `exportWorldPlatformZip` had the complete list. Fixed by matching `exportChar`'s strip list to `exportWorldPlatformZip`'s.

**Lorebooks:** `image_id` (mandatory — export now warns if missing, see below), `tags[]` (mandatory — warns if empty), `definition_protection` != open (warns if Open)
Strips: `world_id`, `lorebook_filename`, `image_data`, `image_relpath`, `site_last_synced_at`, `status` (app-only draft/ready field, added session 18)
Includes (required by Saucepan import validator — session 22b): `selected_chapter_index: l.selected_chapter_index || 0`
`collaboration_type` is **derived fresh at export time** from `access_level` (`'public'` → `'public'`, else `'private'`) rather than passed through whatever stale value was stored locally — fixed session 18 after a real lorebook was found exporting `collaboration_type:'private'` while `access_level:'public'`, an internal contradiction.
`exportLore` had no warning system at all before session 18 (unlike `exportChar`) — a lorebook with no cover image UUID would silently export `image_id: null`. Now warns (same confirm-to-proceed pattern as characters) for: missing image UUID, no tags, Open definition protection.

**Collections:** `image.id` (mandatory), `tags[]` (mandatory), `description` (mandatory — see field rename below)
Strips: `world_id`, `collection_filename`, `image_data`, `image_relpath`, `site_last_synced_at`
Includes (required by Saucepan import validator — session 22c): `lorebooks: c.lorebooks || []`
**Field rename, fixed session 18:** Lorekeeper's internal field is `definition`; the platform's field is `description`. The export was passing `definition` straight through unrenamed for the entire project history up to this point — meaning **every collection export before session 18 had no description on Saucepan's side** (or silently kept whatever stale `description` value was already there from a previous successful import). Both `exportColl` and `exportWorldPlatformZip` now explicitly map `definition` → `description` at export time.

### How to verify an export is actually clean
Don't assume the strip lists above are exhaustive just because they're documented — diff an actual Lorekeeper export against the corresponding Saucepan export for the same item (`Settings → Export` on the site, vs `Export JSON` in Lorekeeper) and look for: (1) keys only in the Lorekeeper file (these are app-only fields that leaked through), (2) keys with different *names* but the same intent (field-mapping bugs, like `definition`/`description`), (3) keys with different *values* that should logically agree (derived-field bugs, like `collaboration_type`/`access_level`). This is exactly how the session 18 bugs were found — by diffing real exported files rather than re-reading the strip list and assuming it was complete.

---

## SillyTavern Export (session 45)

Exports a character as a **SillyTavern character card** — a PNG carrying the card JSON in a `tEXt` chunk. Lives on the character's **Settings** tab beside Export JSON and Export MD, not in the Tools panel: the tools roll things up out of nothing, and this reads real data.

Renderer-only apart from one `main.js` line (the `saveImage` `folder` parameter). No new IPC, no new dependency.

### Where the code lives
Everything that does work is in the **plain-JS block**: the two builders, the macro resolver, CRC32, the chunk splicer, the canvas re-encode and the summary counter. Only `SillyTavernExportCard` is in a Babel block. That was not tidiness — the block it would otherwise have grown was already near the split threshold.

### Both specs are written, into one file
`ccv3` holds V3 (`chara_card_v3` / `3.0`), `chara` holds V2 (`chara_card_v2` / `2.0`), both base64 of UTF-8. A V3-aware reader prefers `ccv3`; anything older falls back to `chara` and sees an ordinary V2 card. Writing both costs about fifteen lines. V3 adds `nickname`, `source[]`, `assets[]`, `creation_date` / `modification_date` and the **required** `group_only_greetings` array — required meaning a strict reader rejects the card without it, even empty.

Existing `chara` / `ccv3` chunks are dropped on the way through. Re-exporting a card that already carried one would otherwise end up with two, and a reader taking the first would see the stale version.

### Field mapping — none of it forced by either spec
| Saucepan | SillyTavern |
|---|---|
| `display_name` / `name` | `name` / `nickname` (V3 resolves `{{char}}` to `nickname`) |
| `card` | `description` — the system prompt, the bulk of the card |
| `advanced_prompt` | `system_prompt` |
| `formatting_instructions` | `post_history_instructions` — injected at depth 0, where formatting rules belong |
| `example_dialogue` | `mes_example`, verbatim |
| `starting_scenarios[0]` | `first_mes`; the rest become `alternate_greetings[]` |
| `short_description` + `full_description` | `creator_notes` — neither is model-visible on Saucepan and SillyTavern has no equivalent surface |
| `source_url` | V3 `source[]` |

`personality` and `scenario` are left **empty** rather than invented. **Scenario titles have no SillyTavern equivalent** — there is no per-greeting label — so they are listed in `creator_notes` instead of being silently lost.

**Nothing is stamped on the character.** An ST export is not a Saucepan export, so `export_filename`, `site_last_synced_at` and `reworked_at` are all left alone. In particular `export_filename` must not be written, or an ST export would hijack the filename the Saucepan export remembers.

### Macros are resolved, because SillyTavern prints them literally
This is the substance of the feature. Saucepan resolves pronouns by grammatical role at chat time; SillyTavern has no equivalent and would render `{{their}}` as the word "their". So they are resolved to real words against a pronoun set chosen in the export panel (he/him default).

The resolver keys on the **role**, not the word typed, so every alias works: `{{they}}` / `{{he}}` / `{{she}}` all resolve to the subjective form. Also handled: `{{mfx|male|female|person}}`, `{{cn}}` / `{{yn}}` → `{{char}}` / `{{user}}`, `{{day_of_week}}` → `{{weekday}}`. `{{char}}` and `{{user}}` pass straight through — both platforms have them.

**`{{s?a:b}}` and `{{p?a:b}}` are inverses and getting them backwards is silent.** The first value is used when the prefix matches the chosen set's number: `s?` gives its first value for a singular set, `p?` for a plural one. A resolver that always took the first value would invert every `p?` conditional in the catalogue and read perfectly fine until someone exported a they/them character.

**Unrecognised macros pass through UNCHANGED.** Same rule that stops a linter being built against `MACROS`: it is a reference, not an allowlist.

Three judgment calls, none forced:
- **Sentence-start capitalisation.** `{{their}} hands shake.` exports as `His hands shake.` Saucepan has the same blind spot and renders it lowercase, but a lowercase sentence opening is a visible defect in every greeting it lands in.
- **`{{her}}` resolves as objective, `{{his}}` as possessive.** Both are genuinely ambiguous in English and Saucepan's own reference lists each under two headings. The narrow cost: `{{her}}` in a possessive position resolves as if objective.
- **`_text_` is left alone.** It renders as italics in SillyTavern rather than underline — mildly wrong, where stripping it would lose the emphasis entirely.

Markup that does convert: `~text~` → `~~text~~`, and the alignment (`>>text<<`, `>>text>>`) and spoiler (`>!text!<`) tags lose the tags and keep the text, having no SillyTavern equivalent.

**`stripHighlights` runs over the whole assembled card.** `==marks==` must not reach another platform any more than they reach Saucepan.

### source[] — traceability, and why it needed a field
V3 `source[]` exists so a card can say where the original lives. Two routes, in order:
1. **`source_url` if set.** Always wins.
2. **Derived as `ST_SOURCE_BASE + c.id`**, but *only* when `c.author_id` is non-empty.

That guard matters. A companion created in Lorekeeper gets a locally generated UUID and the site assigns its own on upload, which Lorekeeper never learns unless the companion is later re-imported from a Saucepan export. `author_id` is the tell: imports carry it, locally created records have `''`. Measured against the real catalogue, **48 of 52 published characters** have it, so most get a correct link for free; the other four need the field. Guessing from a local UUID would have produced a confident dead link on every copy of the card.

**`ST_SOURCE_BASE` is `https://saucepan.ai/companion/`** — confirmed in session 45 against a real companion URL *and* against that record's stored `id`, which matched. The pattern alone would not have been enough; the id has to be the platform's.

The panel never omits the link silently — it states the reason (not published, no id, or the id is local) and points at the field.

### Portraits and CHARX
`assets[]` declares exactly one `icon` named `main` with `uri: 'ccdefault:'`, which means the PNG the card is embedded in. **Extra portraits cannot ride along in a plain PNG** — the spec's `chara-ext-asset_` chunks are explicitly discouraged for new apps, and the supported route is **CHARX**, a zip with `card.json` at the root and images under `assets/images/`. Not built; a sensible third step if the ten-portrait gallery ever needs to travel.

### PNG mechanics, written by hand
A `tEXt` chunk is length + type + keyword + NUL + data + CRC32, and CRC32 is about fifteen lines — cheaper than adding a dependency to an app whose CDN versions are pinned on purpose. The portrait goes through a canvas before embedding, which both guarantees the output really is a PNG (a `tEXt` chunk spliced into a JPG produces a file nothing reads) and gets AVIF, WebP and JPG decoding for free.

**73 of 76 characters can export a PNG** — the other three have no local portrait file, and the button disables with that stated. A platform image UUID is not enough; the picture has to be on disk.

### Verification status
Unit-tested against code **extracted from the shipped file**: 77 assertions on macro resolution, conditionals in both directions, markup, the source guards and the PNG round trip, with CRC32 checked against `zlib.crc32` including the empty-input case. End-to-end against the real Ryōta record and his real 1.4 MB portrait: 23 IDAT chunks and 2 pre-existing `tEXt` chunks preserved in order, every CRC validated, image bytes identical, card read back byte-for-byte.

> **Not yet verified: SillyTavern actually importing one.** The canvas re-encode path that AVIF, WebP and JPG portraits take can only run in Electron, and nothing has been dropped into a real SillyTavern install. In the roadmap.

---

## Dashboard

### Calendar
- Monday-start; overflow cells navigate months; click outside/re-click to deselect
- Purple chips = scheduled; green checkmark chips = posted (current month only, matched by posted_dates)
- Expanded day: scheduled chars + note input + Schedule button

### Today Banner
- Fires for any `ready` char whose schedule date is **on or before today** (corrected session 32); mark posted / reschedule / dismiss
- Marking posted stamps `posted_dates` and sets `status = 'posted'`
- **Trigger is the schedule date only — never the day the status was set.** Scheduling happens on Saucepan and posts run whether or not Lorekeeper was open, so a date that has already passed is the normal case, not an error. It gets no warning icon or overdue styling. The pre-session-32 filter matched on `d.split('T')[0]===todayStr` (exact day), so a companion whose scheduled day went by without the app being open sat at `ready` indefinitely with nothing ever prompting again. Marking a month of companions ready long after their dates must behave identically to marking them on the day.
- Banner text reads `is scheduled for Jul 23` (short date, no year) for past dates and `is scheduled for today` for the current day. Sorted oldest scheduled date first. Dismiss (x) is session-only state, so dismissed items return on restart.
- **`posted_dates` is stamped with the *scheduled* date, not the click date** (fixed session 32). The old handler always pushed today's date, so marking a companion late recorded it on the wrong calendar day. That value also feeds `getNextCycleWorld`'s head detection, so a wrong date skewed release-cycle ordering as well as the calendar.

### Site Checklist
- Shows items edited since last export: characters (`status==='posted'`), lorebooks/collections (`has_been_public` **or** `access_level==='public'`)
- Character condition: stale (`updated_at > site_last_synced_at`) **or never synced** (`site_last_synced_at` doesn't exist yet). The "never synced" half was added June 19 — previously an item that had never been through Lorekeeper's export flow (e.g. posted some other way, or batch-imported already-posted) would never appear here no matter how many times it was edited, since the old condition required `site_last_synced_at` to already exist.
- Lorebook/collection condition (fixed session 18): same stale-or-never-synced logic, but the eligibility check used to require `has_been_public===true` — which only becomes true *after* a successful first export. A **brand-new** lorebook or collection set to `access_level:'public'` for the first time had no way to ever appear here, since it had never been public before and thus had no chance to flip `has_been_public`. Now also catches `access_level==='public'` directly, independent of `has_been_public`, so new public items get caught for their first export.
- Export button stamps `site_last_synced_at` -> item disappears from list
- Help button explains the workflow
- Implemented as its own component, `SiteChecklistPanel`, rather than an inline IIFE inside `DashboardPage`. This is a hard requirement, not a style preference: the panel's "show help" toggle needs a `useState`, and a `useState` called conditionally inside an IIFE that early-returns (`if (pending.length===0) return null`) violates React's Rules of Hooks — the hook count differs between renders depending on whether `pending` is empty, which crashes the entire Dashboard the moment `pending.length` changes between 0 and 1+. This crashed in production once. Any future "list panel with a local UI toggle" pattern on the Dashboard must be its own component for the same reason.
- **Note on "why is X flagged but I didn't change anything important":** the checklist tracks `updated_at`, not "did a platform-relevant field change." Any edit bumps `updated_at`, including changes to app-only fields. If a character/lorebook/collection is flagged but feels like nothing meaningful changed, it's usually because `updated_at` was already stale from before a related export bug was fixed (see Platform Export Requirements) — re-exporting once should resolve it for good going forward.

### Lorekeeper Checklist
- Characters: posted with no `posted_dates`
- Lorebooks: no `image_id`, no local image, no tags, definition protection open
- Collections: no `image.id`, no local image, no tags, no description
- Only flags public or previously-public items

### Upcoming Panel + Release Cycle
- Next scheduled characters; configurable world posting order; drag to reorder

### In Progress panel — two groups: Drafts, and Ready to schedule
`InProgressPanel` + `InProgressRow`. Takes every character with `status !== 'posted'`, so ready-but-unpublished ones are included, and splits them into **two headed groups rather than one sorted list, because they are different jobs**: drafts are work to finish, ready ones are work to schedule.

- **The split is by gap count, not by status.** `progressMissing(c).length > 0` puts a character under **Drafts**; zero gaps puts it under **Ready to schedule**. So a character whose status is already `ready` still appears under Drafts if a field is missing — which is the point, and matches the status dropdown's own `incomplete-status` gate.
- **Drafts sort by fewest gaps first**, then by name, so nearly-done work surfaces above barely-started. Before that they were unsorted, so the order was just the underlying array order and the collapsed top five showed the five oldest rather than the five most actionable.
- **Show all gates the drafts list only.** The ready pool is the shorter one and is what you scan when scheduling, so hiding it behind a click adds nothing. Drafts collapse at 5.
- Each row shows the portrait, name, title, an intro-text preview, the world and schedule state, a status badge using the real status (`status-draft` / `status-ready`), and amber chips naming what is missing — `example dialogue`, `tags (3/5)`, `voice`, `intros`. A complete character shows a single green `✓ ready to post`.
- **Must stay its own component, not an inline IIFE.** Same Rules-of-Hooks constraint as `SiteChecklistPanel`: the Show all toggle needs `useState`, which cannot live in an IIFE that early-returns on an empty list — the hook count would differ between renders. That crashed the Dashboard in production once.

### Rework panel (session 31)
- Queue of published companions to revisit and improve. Lists **every** `status === 'posted'` character that has no `reworked_at` stamp — deliberately *not* filtered by missing fields, since a posted character already has the required fields filled, which would leave the list permanently empty.
- Each row shows all seven depth checks as a checklist (green ✓ = filled, amber = missing): full desc, personality (`card`), formatting, example dialogue, advanced prompt, intros (`starting_scenarios`), voice (`voice_catalog_id`).
- Sorted by gap count desc, then oldest published first (`reworkPostedKey`) so the back catalogue is worked front to back.
- **Exporting a character's JSON stamps `reworked_at`, which removes it from the queue permanently.** A new field was used rather than the existing `site_last_synced_at` because every posted character already has that stamped from past exports, which would have emptied the queue on day one.

---

## Lorebook Entry Templates (per-world)

Separate from character creation templates. Used to create structured lorebook chapters.

**Setup (once per world):**
1. World -> World Info -> Lorebook Templates -> New template
2. Set name, chapter title template (e.g. `{{CHARACTER NAME}} | POSITION | ROLE`), body template, target lorebook
3. Use `{{CHARACTER NAME}}` (uppercase) and `{{CHAR}}` (normal case) as placeholders

**Per character:**
1. Character editor -> Lorebook Entry tab
2. Template pre-fills with character's name; edit title + body
3. Save to Lorebook — creates or updates chapter (matched by `char_id`, never duplicates)

---

## Relationship Map

Lives in the right panel's **Map** tab (panel expands to 640px while active).

- **World picker** at the top — relationships are scoped per world
- **Character filter** matches `WorldDetailPage` logic: home `world_id` OR membership via a collection that belongs to the world (so cross-world cast members like Gabriel in Swim Team + Dom/Sub Verse appear correctly)
- **Nodes** — portrait (resolved via `RelPortrait`) + name (uses `name`, not `display_name`); freely draggable; auto-arranged in a grid whenever the world changes or the character list changes
- **Drawing a connection** — click "+ connect" under a character, then click another; a modal prompts for a label (e.g. "rivals", "siblings")
- **Editing a connection** — click the line or its label pill to open an edit popup; the popup is draggable via a grip handle (uses `getBoundingClientRect()` on mousedown so it doesn't jump on first drag); edit the label text or delete the relationship
- **Labels are fixed** to the line midpoint — they are not independently draggable (this was tried and reverted; only the edit popup is draggable)
- **Reset layout** button re-runs the auto-grid if nodes drift off-screen
- Data stored in `data.relationships[]`

---

## AI Integration (multi-provider since session 31)

Right panel **Assistant** tab (renamed from "Claude" session 31) — full AI chat with world-aware context.

### Providers
All calls go through one shared helper, `callAI(data, systemPrompt, messages, maxTokens, opts)`, which branches on `settings.ai_provider` and returns `{text}` or `{error}` — it never throws. Used by both the Assistant chat and the Image Prompt Generator. `opts` is optional and carries sampler values; the Image Prompt Generator omits it and is unaffected.

| Provider | Endpoint | Auth | Model setting |
|---|---|---|---|
| `anthropic` (default) | `api.anthropic.com/v1/messages` | `x-api-key` header | dropdown |
| `openai` | `api.openai.com/v1/chat/completions` | `Authorization: Bearer` | dropdown |
| `google` | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | key in query string | dropdown |
| `openrouter` | `openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer` | free-text model slug |
| `lmstudio` | `{base_url}/chat/completions`, default `http://localhost:1234/v1` | none | free-text model id |

Endpoints are hardcoded per provider — the user only ever pastes an API key. Google differs structurally (system prompt goes in `systemInstruction`, messages become `contents` with `role:'model'` for assistant turns), which is why the branch exists rather than one generic OpenAI-shaped call.

Settings stores one key per provider (`anthropic_api_key`, `openai_api_key`, `google_api_key`, `openrouter_api_key`) so switching providers doesn't lose the others. `hasActiveKey(settings)` checks only the selected provider's key — used for the "no API key set" nudge in the Assistant panel.

**Bug found session 31:** the Image Prompt Generator had been calling the Anthropic endpoint without ever sending the API key header, so it silently failed for everyone. Fixed by routing it through `callAI`.

### Local models via LM Studio (session 31)

LM Studio exposes an OpenAI-compatible server, so the branch reuses the same request shape with no auth header. Settings has a Server URL field, a Model field, and a **Test connection** button that hits `/v1/models` and renders each loaded model as a click-to-fill chip.

**Two Content-Security-Policies have to be changed, not one.** `main.js` sets a CSP header at window creation, *and* `index.html` line 5 has a `<meta http-equiv="Content-Security-Policy">` tag with the same value. Browsers enforce both and the most restrictive wins, so fixing only `main.js` changes nothing and the console keeps quoting the old policy verbatim — which reads exactly like the file wasn't copied. Both now allow `http://localhost:*` and `http://127.0.0.1:*`.

Note the CSP header is applied in the main process at window creation, so it needs a full app restart, not a reload.

### Task presets (session 44)

A preset is a complete system prompt plus sampler values aimed at one kind of output. Chosen from a **Preset** dropdown at the top of the Assistant panel; edited in Settings → AI Provider → Task presets. Three ship built in: Character Sheet, Example Dialogue, Intro Scenario.

**A preset replaces the assistant preamble and `ASSISTANT_HOUSE_RULES` outright.** This is deliberate and is the one thing a future session is most likely to "fix". A task prompt that opens *"output only the prose, no preamble"* and a preamble telling the model to be a concise helpful assistant are two different briefs, and the model splits the difference. Everything below that point in `buildSystemPrompt` — world, lorebook, house format, current character — is still appended, which is the entire reason for running the task from inside Lorekeeper rather than pasting the card into LM Studio by hand. `ai_custom_instructions` is still appended too.

**Samplers have to be sent or they do not exist.** LM Studio's own presets are client-side: nothing on its Inference tab — temperature, Min P, repeat penalty, the preset system prompt — reaches `/v1/chat/completions`. Only Load-tab settings (context length, GPU offload, cache quantization, chat template) apply to server requests. So `preset.params` travels in the request body.

Each provider builds its own subset rather than sharing one object, because sending `min_p` to Anthropic is a 400, not a silent ignore:

| Provider | Accepts |
|---|---|
| `anthropic`, `openai` | `temperature`, `top_p` |
| `google` | `temperature`, `topP` (inside `generationConfig`) |
| `lmstudio` | `temperature`, `top_p`, `min_p`, `repeat_penalty` |
| `openrouter` | `temperature`, `top_p`, `min_p`, `repetition_penalty` |

**A blank sampler field is not sent.** That is how Top P stays off without having to send `top_p: 1`. Zero *is* sent — the normaliser tests for empty string and `NaN`, not falsiness.

Storage: `settings.ai_presets` (array of `{id, name, instructions, params}`) and `settings.ai_active_preset` (id, or `''` for the default Assistant behaviour). **Deleting every preset falls back to the built-in three rather than leaving an empty dropdown** — a floor, not a bug. Editing any preset first materialises the built-ins into `settings.ai_presets` so they become the user's own copies.

`DEFAULT_AI_PRESETS` and `PRESET_PARAM_FIELDS` live in the **plain-JS block**, not a Babel block — data arrays always do, and the prompt text alone is ~12 KB.

Not built, deliberately: auto-filling output into a character field (needs field targeting, a confirm step and an undo path), and per-preset model selection (switching models means an eject and reload, which is slower than picking from the dropdown).

### LM Studio-only settings (session 44)

**Extra assistant instructions** (`ai_custom_instructions`) and **Context window** (`ai_context_window`) render only inside the `ai_provider==='lmstudio'` fragment in Settings, and both are now gated on the provider in code as well.

They were not before. `buildSystemPrompt` appended the custom instructions on every provider, so a rule written for a local model rode along invisibly on an Anthropic call, with no field anywhere in that provider's panel to see or edit it. The context window was worse in the other direction: its 8192 default painted the Assistant's token readout amber against a 200k cloud window.

Now the instructions apply under LM Studio only, and the readout drops its `/ 8k` suffix and its warning threshold (`ctxLimit = Infinity`) on any other provider, showing a bare estimate instead. **If either setting is ever made global, the gate in `buildSystemPrompt` and `ctxIsLocal` in `ClaudePanel` must move with the UI** — three places, not one.

### Assistant context scope (session 31)

The Assistant prompt sends world description, every lorebook with full chapter text, collections, sibling characters and the current character. Measured on Guideverse: **27,327 tokens**. Fine for cloud, impossible locally.

`buildSystemPrompt(scope)` now takes a scope, persisted as `settings.assistant_context_scope`:

| Scope | Contents | Measured (Guideverse) |
|---|---|---|
| `character` | current character only, world skipped entirely | ~1–2k |
| `world` | world + lorebook names, short descriptions and chapter *titles*; chapter bodies only for chapters the user picks | 3,116 base |
| `full` | everything, previous behaviour | 27,327 |

**Selection is per-chapter, not per-lorebook.** Lorebook-level was built first and was useless — a single Guideverse lorebook is ~10k and Shinsengumi ~14k, so picking even one still overran an 8k window. Chapters are the right granularity: Guideverse's thirteen chapters run 1.1k–6.2k each, so Espers + Guides + Guiding is ~9.3k total. Unpicked chapters are still listed by title so the model knows they exist. Stored as `settings.assistant_chapters` with keys `loreId::chapterIndex`.

The panel shows a live `≈N tok` estimate (`chars/4`) that turns amber past 7000, and each chapter chip carries its own token cost so the budget is visible while picking.

**The world's template is injected as a HOUSE FORMAT block.** If a template exists for the current world, its `full_description`, `card` and `formatting_instructions` fields go into the prompt with an instruction to match the structure exactly and replace only placeholder text. Templates already supported these fields and per-world scoping — the only thing missing was the Assistant knowing they existed. Generated text now comes back already shaped to the catalogue's house style.

### Reference hardware (Ine's machine, updated session 44)
RTX 5070 Ti 16 GB, i7-14700KF. **VRAM is the binding constraint, not RAM.** Blackwell needs the CUDA 12.8 runtime — in LM Studio that is the engine listed as "CUDA 12 llama.cpp", and the GGUF runtime *selector* can sit on an older installed version than the newest one present, which looks like a slow model rather than a misconfiguration.

Current models, all community fine-tunes for fiction:

- `thedrummer_cydonia-24b-v4.1` **IQ4_XS** (12.8 GB) — holds structure, macros and template fidelity. The one to use for anything with a shape. ~18 tok/s; IQ4_XS dequantizes slower than a K-quant, so that is expected, not a fault. IQ4_XS over Q4_K_M because 14.3 GB of weights plus a 16k cache plus Windows' own overhead does not fit 16 GB.
- `unslopnemo-12b-v4.1` Q5_K_M (8.7 GB) — livelier prose, loses constraints. First drafts only.
- `mn-12b-mag-mell-r1` Q5_K_M (8.7 GB) — worldbuilding. **ChatML template, not Mistral**, despite the Nemo base; LM Studio guesses wrong and the result reads as weak writing rather than an obvious error.

**Stock instruct models are the wrong tool and were all removed.** They are trained to be assistants: asked for a scenario they return a tutorial about writing one. A base model with no instruct tuning (`gemma-2-9b`, no `-it` suffix) cannot follow an instruction at all.

Working config: **Cydonia at context 16384 / 40 layers; the 12Bs at 24576 / all layers; K and V cache Q8_0 and Flash Attention on for all three.** KV cache is ~160 KB/token at fp16, so 16k costs ~2.6 GB — Q8_0 halves it, which is the difference between loading and not. The cache-quantization dropdowns sit behind checkboxes that leave them inert until ticked, so the setting looks absent rather than off. Context length and offload are load-time; the model must be reloaded. The "Customized" badge only means the config differs from defaults, not that it is unapplied.

**Default context length is a global setting and ships at 8192**, which a 2,600-token card plus a system prompt plus a long reply overruns. When context overflows, the system prompt is the first thing dropped — so the instructions genuinely stop reaching the model, and it reads as the model ignoring them.

### System prompt includes
- Current world: name, description, tags, notes
- All lorebooks in the world with full chapter text
- All collections with descriptions
- All other characters: name, display name, short desc, tags
- Current character: all filled fields

### Behavior
- Chat resets on character/world switch (context key = world_id + char_id)
- Suggested prompts on empty state; copy button on every response
- Enter to send, Shift+Enter for newline
- Uses model from Settings (default `claude-sonnet-4-6`)
- API key from Settings -> Claude API; amber nudge if not set, with a working "add in Settings" link that navigates there (fixed June 19 — was previously a dead `onClick={()=>{}}` stub; `setPage` is now threaded through `RightPanel` -> `ClaudePanel`)
- CSP allows `https:` so API calls work from Electron
- **Missing required header, fixed session 19:** the fetch call to `api.anthropic.com/v1/messages` only ever sent `Content-Type` and `x-api-key` — the Anthropic API also requires an `anthropic-version` header (`2023-06-01`) on every request, and it was missing entirely. This made every Claude panel request fail regardless of whether the API key was valid, with an error about the missing header rather than anything key-related — easy to misdiagnose as "my key isn't working" when the key was never actually checked.

---

## Settings Page
Full-width layout (no max-width cap).

**AI Provider** — provider dropdown (Anthropic / OpenAI / Google / OpenRouter / LM Studio) plus provider-specific key and model fields, shown conditionally on the selection. See the AI Integration section for the provider table; detail is deliberately not duplicated here, since the two copies disagreed for four sessions.
**Appearance** — Font size (Small/Normal/Large/XLarge, applies immediately and globally via CSS `zoom` on `document.documentElement` — see CSS Gotchas section for why `zoom` rather than root font-size); **Theme** (accent color → generated dark + light theme pair, live preview, Apply/Reset — see Theme System section, added session 20); **Colorblind mode** (Off / Red-Green / Blue-Yellow — built session 24; adds `html.cb-rg` or `html.cb-by`, which remaps specific colour variables. `cb-by` also remaps green, which the Theme System section used to omit)
**Data** — Data file path + Open Folder; Auto-save debounce (Fast 300ms / Normal 600ms / Slow 1s / Very Slow 2s). The path is discovered at startup, never configured, which is why it is the one machine-specific string allowed to appear in the UI.
**Backup** — Destination selector (None / GitHub / a synced folder), and the fields each one needs. See the Backup section.
**About** — Version info and dependencies. **No API-key link** — it used to carry a single "Get Anthropic API key" link, which implied Anthropic was the only option; all five providers are covered in Help instead.

Five sections in total: AI Provider, Appearance, Data, Backup, About.

---

## Tools Panel

| Tool | Icon | Description |
|---|---|---|
| Height | `ti-ruler` | cm <-> ft/in bidirectional; click to copy |
| Names | `ti-user-circle` | Masc/Fem/Neutral/Any; international pool |
| Physicals | `ti-sparkles` | Eyes, Hair, Build; roll individually or all |
| Nationality | `ti-world` | 100+ nationalities; region filter; languages + currency |
| Color | `ti-palette` | HSL sliders + 6 harmony modes; click swatches to copy hex |
| Text Diff | `ti-scan` | Word-level diff; green/red highlights; added/removed counts |
| Personality | `ti-brain` | Literary Archetypes (77), MBTI (16), Jungian (13), Attachment Styles (4); Roll All + Copy All |
| Plot | `ti-books` | 100 global archetypes + per-world custom pool; filter global/world/any. World dropdown only lists worlds that actually have custom archetypes set up (fixed session 19 — previously listed every world including ones with none, labeled "(no custom)", which was just noise). No longer shows an always-visible wall of archetype tags below the roll buttons when a world is selected (the `WorldPlotEditor` sub-component that did this was removed — archetypes are edited from World Info, this tool is just for rolling). |
| Esper Powers | `ti-sparkles` | Rolls ability type, rank (F-S), drawback, codename |
| Hockey | `ti-trophy` | Rolls position, role description, handedness, character trait |
| Swim | `ti-send` | Rolls stroke, event distance, description, swimmer archetype |
| Western Zodiac | `ti-stars` | Rolls sun sign: element/modality, traits, shadow side, vibe |
| Chinese Zodiac | `ti-yin-yang` | Rolls sign: element, reference years, traits, shadow side, vibe |
| Img Prompt | `ti-sparkles` | Generates an image generation prompt using the configured AI provider; auto-populates from the current character (description, tags, card snippet); art style + mood dropdowns; optional extra notes; copy button. **The character's name is deliberately not sent** — every model wrote it into the prompt verbatim, which is dead tokens at best and biases the composition at worst. Content-warning tags and `IMG_SKIP_TAGS` (POV, format and genre metadata) are stripped before the prompt is built. Output passes through `stripWrappingQuotes()`, because all three local models wrapped the prompt in quotes despite being told not to. |
| Img Convert | `ti-transform` | Format converter (session 26) — converts between PNG/JPG/WEBP/AVIF |
| Paste & Save | `ti-clipboard-copy` | Reads an image from the clipboard and saves it to disk (session 26) |
| Crop | `ti-crop` | Crops an image to a chosen aspect/region (session 26) |
| Img UUID | `ti-id` | Extracts the platform image UUID from a Saucepan image (session 33). Saucepan offers three copy formats per image — markdown, an img tag, a CSS background rule — and the UUID is usually the only wanted part. Paste any or all of them; results are deduplicated, so all three formats of one image give one UUID rather than three. |
| Pick from image | `ti-color-picker` | Click anywhere on a loaded image to take the colour there. Averages a small square by default, because one pixel of a JPEG is usually compression noise rather than the colour you are looking at. Keeps the last eight picks |
| Palette | `ti-color-swatch` | Pulls the dominant colours out of an image, or builds a palette from one colour. See Colour Handling below |
| Roll | `ti-dice-5` | A general-purpose picker: paste options one per line or comma-separated, Ctrl+Enter to roll. Keeps a recent-results list, and the button is disabled below two options. |

**21 tools**, registered in one `tools` array in `index.html` — icon, id and label in a single place. Add to that array rather than to the render. **Count the array before writing a number here**: this line has already been wrong twice.

**Icon constraint:** every icon must exist in Tabler Icons 2.44.0 (pinned version). Confirmed NOT in 2.44: `ti-files-diff`, `ti-waves`, `ti-spell-check` — these render blank. The reliable check is to unpack `@tabler/icons@2.44.0` from npm and look in its `icons/` folder, rather than trusting that a plausible name exists.

---

## Colour Handling — OKLCH, and why not HSL

The original Color tool works in HSL. **HSL lightness does not correspond to what the eye sees**, and the gap is not subtle: pure yellow and pure blue are both "50% lightness" in HSL, while measured in OKLCH they are **0.968 and 0.452**. More than double.

That is why mathematically correct harmonies — triadic, complementary — so often look cheap. Rotating hue while holding saturation and lightness fixed makes every colour shout at the same volume. What reads as designed is a deliberate spread of lightness, with only one or two colours carrying real chroma.

So the Palette tool works in **OKLCH** and converts back to hex only for display. `rgbToOklch` / `oklchToRgb` live in the **plain JS block** — pure maths, no JSX, so they cost nothing against the Babel budget. The round trip was verified exact to the byte on red, blue, white, black, grey, amber and a muted purple.

**`fitChroma()` exists because a requested colour may not be displayable.** High chroma at an extreme lightness falls outside sRGB and converts to something clipped and simply wrong. It binary-searches chroma downwards until the colour survives a round trip, so a swatch always shows the colour it claims to.

**Hue names are measured, not guessed.** OKLCH hue angles do not line up with the HSL wheel: pure red sits at **29**, not 0, and yellow at **110**. Naming by RGB intuition put scarlet in the orange bucket. The boundaries in `hueName()` were set from measured reference colours and checked against twelve.

**Palette extraction buckets in OKLCH as well.** That is what makes two shades of one skin tone collapse into a single entry rather than counting as different colours, and a candidate too close to one already chosen is refused — otherwise a photo of one jumper returns six versions of the same blue.

---

## Help System

Content lives in `HELP_SECTIONS` in the **plain JS block** — a JSON array of `{title, icon, items[]}`. `HelpPage` only renders it.

Item types, **read out of `renderItem` rather than described from memory** (an earlier version of this paragraph got `note` wrong and the next session's `note` blanked the Help page):

| `t` | Needs |
|---|---|
| `p` | `x` |
| `tip` | `x` |
| `step` | `x` and `n` — without `n` it renders an empty numbered circle, the easy mistake |
| `warn` | `x` and `h` |
| `note` | `h`, **an `x` even if empty**, and `s` as an array of **`{n, x}` objects** — not an array of strings |

`note` is the one with teeth. `renderItem` calls `parseInline(it.x)` unconditionally, so an absent `x` throws on `.length`; and it maps `s` through `HelpStep`, so string entries render blank. Both faults are invisible in a collapse-by-default page until the item is reached.

**A clean render proves more than it looks.** `HelpPage` passes `{sec.items.map(renderItem)}` as children, which JavaScript evaluates **eagerly** — before `HelpSection` decides whether to show anything. So server-rendering `HelpPage` once runs `renderItem` and `parseInline` over every item in every section, collapsed or not. That is the cheapest full check of the array there is, and it is how the bad `note` was caught.

- **21 sections**, rewritten in session 37 for someone who has never seen the app, with **Export to SillyTavern** added in session 45 directly after Characters: Dashboard, Characters, Export to SillyTavern, Worlds, Timeline, Lorebooks, Collections, Personas, Templates, Lorebook Templates, Relationship Map, Tools panel, Image Tools, Editing conveniences, Import / Export, Backup, Auto-save to disk, Rescan images, Data Safety, Settings, AI assistant.
- Inline help buttons elsewhere: Site Checklist, Batch Import, Lorebook Entry tab, Lorebook Templates manager.

**Count the array, do not read the prose.** Session 32's audit found nine wrong statements here and session 37 found more, all of the same kind: totals stated in words ("11 tabs", "three layers", "15 sections") stay perfectly plausible after the underlying list changes. Every such number in Help should be checked against the array it describes.

**Help can outlive the feature.** Session 37 found Help still documenting Audit base64, Migrate and Clean up leftover — removed in session 35j. When a feature is deleted, grep `HELP_SECTIONS` for it in the same breath.

---

## Full-Width Pages (do not reintroduce max-width caps)
These pages/components were explicitly changed to fill the available content area, removing leftover `maxWidth`/`max-width` constraints from earlier sessions. This reverted itself multiple times across project re-uploads because fixes only existed in chat output and not yet in the synced project files — if a width regression is reported again, check these specific spots first before re-diagnosing from scratch:
- `SettingsPage` — outer wrapper, was `maxWidth:600`
- `.world-info-tab` CSS class (World Info tab) — was `max-width:580px`
- `.tpl-editor` CSS class (TemplateEditor, used when creating/editing a template) — was `max-width:700px`

If any of these show up capped again, it is a sync/regression issue, not a design decision — restore full width.

## Shared Filter Component
`WorldFilterDropdown` (added session 18) is a single reusable component used by Characters, Lorebooks, Collections, and Templates list pages for world filtering. Props: `worlds`, `value`, `onChange`, `includeStandalone` (bool — Characters omits this since every character has a world; Lorebooks/Collections/Templates include it). Renders as a funnel-style button showing the current selection, opening a scrollable dropdown on click (click-outside closes it). This replaced an earlier pattern of one button per world rendered inline in a wrapping flex row, which looked fine with ~8 worlds but would have visibly broken (excessive wrapping, inconsistent row heights) once the world count grew further. Any new list page that needs to filter by world should use this component rather than reimplementing the inline-button-row pattern.

---

## Portrait / main image rules (session 33)

**The main image is not required to be one of the portrait slots.** `Set Portrait` imports a standalone file, so `char.image.relPath` pointing outside the gallery is a normal state. Nothing may re-derive it from the portraits — doing so silently replaced the chosen picture on every restart (see session 33). The load migration's only permitted repair is following a rename: if the path matches a portrait's file under name normalisation, update it; otherwise leave it alone, even if the file is missing.

**`profile_pic` UUID mirroring is one-way.** A portrait slot named exactly `profile_pic` takes its `image.id` from `char.image.id`. The profile pic field is the source and the slot follows, on typing and on load. Never write the reverse direction.

## Tools panel — Img UUID (session 33)

Saucepan offers three copy formats per image — markdown, an `<img>` tag, and a CSS `background-image` rule — all carrying the same UUID, which is almost always the only part wanted. `extractUuids()` (plain JS block) regex-matches the UUID shape anywhere in pasted text and deduplicates, so pasting all three formats yields one result. Includes a clipboard Paste button so the common path is two clicks.

## Ctrl+F find (session 33)

`FindBar` takes `fields: [{tab, label, text}]`; each page supplies its own list via `charFindFields` / `loreFindFields` / `collFindFields` (all in the plain JS block). Renders per-field match counts as buttons that switch tabs.

**This cannot be Electron's `findInPage`.** That searches rendered DOM text and cannot see inside `<textarea>` values, which is where descriptions, cards, chapters and intros all live. Any future "search the current page" feature has the same constraint.

## Saucepan Macros

**`MACROS` in the plain JS block is a REFERENCE, not an allowlist.** Saucepan accepts more than it lists, so **nothing should ever validate text against it.** A checker built on it would flag `{{him}}` as broken — `{{him}}` is valid — and a checker that produces false positives gets ignored within a week, which is worse than not having one.

**Pronouns resolve by grammatical role, not by the word typed.** The canonical names are `{{sub}} {{obj}} {{poss}} {{poss_p}} {{ref}}`. Every pronoun form is an alias for one of those: `{{they}}`, `{{he}}` and `{{she}}` all resolve to the subjective form for that persona, `{{them}}`/`{{him}}`/`{{her}}` to the objective, and so on.

**The they-forms are the ones to use, and not only because they are easier to remember.** A macro that fails to resolve falls back to the literal word. `{{their}}` degrades to "their", which is still correct for anyone; `{{his}}` degrades to "his", which is wrong for half of readers. The fallback behaviour is the argument, not the convenience.

**`{{s?a:b}}` and `{{p?a:b}}` are a pattern taking any two words, and THE FIRST VALUE IS THE ONE THAT GETS USED.** A singular subject is `{{s?was:were}}`; the same sentence for a plural subject is `{{p?were:was}}`. They are inverses — pick whichever reads naturally and put the matching form first. Any verb works, not just was/were. **Getting this backwards reads perfectly fine until someone with plural pronouns opens the chat**, which is why the rule is now stated in the macro panel rather than left to be inferred from two examples.

The panel was rewritten in session 40 because it listed examples without the rules. `MACROS` groups now carry an optional `note` (the rule) and `tip` (the recommendation), and the panel renders them above the chips.

**If a macro linter is ever built**, it can only check *shape*, never names: a conditional with one value instead of two, an empty or unclosed `{{`, or an uppercase-with-spaces leftover like `{{CHARACTER NAME}}` from a lorebook template. Anything that is a plausible single word inside braces must be left alone.

---

## Saucepan Tag System (session 34)

`SAUCEPAN_TAGS` (plain JS block, pure data — not part of the Babel budget) is Lorekeeper's local mirror of Saucepan's tag reference: `{id: {c: category, d: description}}`, 659 entries. `TAG_CATEGORIES` lists the 15 known categories in display order.

**This mirror will drift again.** It was last synced 19 Aug 2026 against a 658-tag PDF export. There is no live sync — if Saucepan adds, renames, or re-categorises tags, Lorekeeper won't know until someone re-runs this audit. Re-running it needs a PDF (or any source with real embedded text) of the site's `All Tags` reference page — a screenshot is not sufficient unless captured at native resolution, since a scaled-down screenshot cannot be recovered by upscaling.

**`mythological` is a known loose end.** It exists in `SAUCEPAN_TAGS` but had no match anywhere in the 658-tag audit — not by id, not by any plausible description similarity. It was kept rather than deleted, since "no match found in this audit" isn't proof it's gone from the site. Worth Ine checking directly; if it's confirmed gone, remove the key and add a `TAG_ID_REPAIR` entry only if there's a real successor, otherwise any character still carrying that tag keeps it as an orphaned string (harmless — Lorekeeper doesn't validate tags against `SAUCEPAN_TAGS`, it only uses it for autocomplete/description lookup).

**`TAG_ID_REPAIR` is migration plumbing, not a permanent structure.** It exists solely to let `migrateTagArray()` (plain JS block) fix up old ids sitting in existing `.tags` arrays on load. Once every affected character/lorebook/collection/world has been opened at least once post-update, every mapped old id is gone from the data and the map does nothing further — it's safe to leave in place indefinitely (the scan is cheap and a no-op once nothing matches), but it should not be extended for anything other than actual id renames confirmed against source data.

**`CW_TAGS` is derived, not hand-maintained**, as of this session: `Object.keys(SAUCEPAN_TAGS).filter(id => SAUCEPAN_TAGS[id].c === "Content Warnings")`. Verified exactly equal to the previous hardcoded 21-tag list before the change. Any future CW tag addition to `SAUCEPAN_TAGS` needs no corresponding edit here.

## Electron Gotchas (session 35m)

**`window.prompt` does not exist.** Chromium removed it and Electron never reinstated it, so the call is **silently ignored** — no error, the button simply does nothing. `alert()` and `confirm()` still work. Use an inline input instead; the Timeline's Add/Rename strand does this.

**`getDataPath` returns the data FILE, `getDataDir` returns the FOLDER.** `get-data-path` resolves to `DATA_FILE` because Settings displays the full file path. Appending `Companions\<folder>` to it produces a path *through* `lorekeeper-data.json`, which cannot exist — so `fs.existsSync` fails, no `defaultPath` is passed, and the file dialog silently falls back to whatever folder Windows had open last. `get-data-dir` was added in session 35m for exactly this.

**Method note worth keeping.** That bug cost three speculative patches against a Windows "last visited folder" quirk that was never happening. One round of logging the resolved path showed the real cause immediately. **When a dialog, path or file operation misbehaves, log the actual value before theorising** — the main process can `fs.appendFileSync` to a scratch file in `DATA_DIR` and the answer arrives in one round trip.

**`main.js` changes need a full app restart.** Reloading the window (Ctrl+R) reloads only the renderer; the main process keeps running the old code, so an IPC or dialog fix appears to do nothing.

---

## Babel Block Budget — SOLVED by splitting (session 35n)

**The ceiling is per SCRIPT BLOCK, not per file.** Babel standalone transforms each `text/babel` script separately, so splitting one oversized block into two puts each comfortably under the limit. This was discovered at 490 KB, when the compiler began emitting `[BABEL] Note: The code generator has deoptimised the styling as it exceeds the max of 500KB` — the canary for the silent app-wide click-handler failure described below.

**MEASURE THE COMPILED SIZE, NOT THE SOURCE.** The 500 KB limit is on the code Babel's generator *emits*, not on what it reads, and JSX expands by roughly 30% on the way through. A block at 300 KB of source is already near 390 KB out — so reading source sizes against the ceiling gives false comfort by about a third. `compile-check.js` reports both and flags any block over 400 KB compiled; a figure quoted without saying which it is, is not usable.

`index.html` now has **three** Babel blocks, split at `CollectionPicker` and at `NotesBackupPanel`. Current, measured (session 45): **block 1 (plain JS) 270 KB source / 291 KB compiled, 58%; block 2 273 KB / 346 KB, 69%; block 3 158 KB / 206 KB, 41%; block 4 147 KB / 194 KB, 39%.** Rules:

- **The `ReactDOM.createRoot(...).render()` call must stay in the LAST block.**
- Split only at a top-level declaration boundary.
- Top-level `function` and `const` declarations in classic scripts share one global scope, so either block can reference the other. Nothing is called until render, so ordering between blocks does not matter.
- **If any block passes 400 KB COMPILED, split again.** Another block is free; this scales indefinitely. **Block 2 is now the largest at 346 KB / 69%** and is the next candidate; nothing is required until it passes 400.
- **The rule above is to split BEFORE a feature lands in a crowded block, not after.** Session 45 got this wrong in a way worth recording: the SillyTavern panel was added to the block that this file already named as needing a split first, taking it to 391 KB, and the session *flagged* that instead of acting on it. Flagging a documented rule is not following it. The split happened the next session, at `NotesBackupPanel`, 50.8% of the way through by source.
- **Verify a split by counting declarations, not by reading it.** A split is the one edit that can silently blank the app, so check: the same set of top-level declarations before and after, the render call still in the LAST block, no name declared at top level in two blocks (that throws on load), and no top-level executable statement anywhere except that one render call. `compile-check.js` checks the last three; the declaration-set comparison is a one-liner worth running by hand.
- **Measure, do not estimate.** `node compile-check.js index.html` extracts the blocks from the shipped file, compiles each with the real Babel and prints both sizes. Any figure in this document that was not produced that way is a guess that has since drifted.
- Do not merge them back. The comment at the top of block 1 says so.

**Consequence for planning:** the Babel ceiling is no longer a reason to adopt a build step. Headroom went from ~11 KB to effectively unlimited. A build step is still worth doing for faster startup, modules and npm packages, but it is no longer urgent.

### History (the reclaims that preceded the split)
Kept because it explains several existing design choices — why `SAUCEPAN_TAGS`, `HELP_SECTIONS`, the export builders and `estimateTokens` live in the plain-JS block rather than beside the components that use them.

## Babel Standalone Gotchas (hard-won, do not relitigate)
These caused repeated regressions across sessions — treat as fixed rules:
- **Never** put `style={{...}}` inside a ternary or `&&` conditional's JSX consequent — Babel standalone reliably fails to parse it. Use a CSS class instead, or extract the conditional content to its own component.
- **Never** put a literal backslash in a JSX string (e.g. a Windows path) — Babel misreads it as a regex/escape sequence. Build the string outside JSX with a `BS = String.fromCharCode(92)` constant and plain string concatenation (see `loreHint`, `charFolderHint` helper functions), then just reference the result in JSX.
- **Multi-line JSX as a ternary consequent** needs parens around the JSX block — bare `{cond?<div>...</div>:null}` spanning many lines can still fail; when in doubt, extract to a named component and call it as `{cond?<MyComponent/>:null}`.
- Apostrophes inside single-quoted JS strings need to become double-quoted strings instead of escaping.
- Double-curly-brace syntax appearing in literal JSX text (e.g. documentation about macro syntax) must be wrapped as a string literal expression, not typed directly into JSX text.
- Use `if(tab==='x') return (...)` pattern instead of nesting deep ternaries when a component has 2+ mutually exclusive views — more reliable than ternaries with multi-line JSX.

- **A complex nested closure in an `onClick` can make the element vanish entirely** — no error, no warning, the button simply never renders. Session 31: a Skip button with `onClick={()=>{const n=x.name;update(d=>{...})}}` produced nothing. Extracting it to a named handler (`onClick={skipNext}`) fixed it. If an element you just added doesn't appear and the syntax looks fine, suspect the handler before anything else.
- **Verify by compiling, not by reading.** Extracting the `<script type="text/babel">` block and running it through `@babel/core` with `preset-react` catches parse errors in seconds and is far more reliable than eyeballing bracket counts. Worth doing before every handoff.
- **Data arrays belong in the plain-JS block** (lines ~348–897), not the Babel block. `SAUCEPAN_VOICES` (3.3 KB) went there alongside `SAUCEPAN_TAGS` for this reason. Babel block is at 456.4 KB of a ~500 KB working ceiling (session 35, post-reclaim).
---

## Theme System (added session 20)

Generates a full dark+light theme pair from a single accent color. Lives in Settings → Appearance → Theme.

### Why this is feasible (and font-size wasn't)
The app's entire color system already runs through ~11 CSS custom properties consistently: `--bg`, `--bg2`, `--bg3`, `--bg4`, `--accent`, `--accent2`, `--accent-dim`, `--text`, `--text2`, `--text3`, `--border`, `--border2`. Unlike font-size (~435 hardcoded pixel values, almost no `rem`/`em`, required the `zoom` workaround — see CSS Gotchas), swapping these 11 variables at `document.documentElement` genuinely re-themes the whole app with zero per-component rewriting needed.

### `generateTheme(accentHex)`
Lives in `index.html` near the existing `hexToHsl`/`hslToHex`/`genPalette` color utilities (reuses them directly — same math the Color tool uses for harmony palettes, applied here to build a coherent ramp instead of 5 contrasting swatches). Takes the accent's hue and saturation (clamped to 45–85% saturation so a very washed-out or oversaturated user-picked color doesn't break contrast), and independently derives:
- **Dark variant** — backgrounds ramp from near-black (`--bg` at ~7% lightness) up through `--bg4` (~20%), accent stays vivid (~68% lightness), text stays light (~92%)
- **Light variant** — backgrounds ramp from near-white (`--bg` at ~97%) down through `--bg4` (~85%), accent is deepened for contrast on light backgrounds (~42% lightness instead of 68%), text is dark (~12%)

Returns `{ dark: {...}, light: {...} }`, each an object with all 11 properties (camelCase keys: `bg`, `bg2`, `bg3`, `bg4`, `accent`, `accent2`, `accentDim`, `text`, `text2`, `text3`, `border`, `border2`).

### `applyTheme(themeVars)`
Takes one of the two variants from `generateTheme` and calls `document.documentElement.style.setProperty()` for each of the 11 CSS variables. This is what actually changes what's on screen.

### `ThemeGenerator` component (Settings page)
- Accent hex input (with live swatch) + Dark/Light toggle
- **Live preview panel** — a small mock sidebar + content area rendered in the currently-selected (not-yet-applied) theme, so you can see it before committing
- **Apply theme** button — disabled when the preview already matches what's saved (`data.settings.theme`); writes `{accent_hex, mode}` to settings on click
- **Reset to default** button (only shown once a theme has been applied) — clears `data.settings.theme` and calls `applyTheme()` directly with the original hardcoded purple dark theme values, so the reset is immediate rather than waiting for the next render cycle

### Persistence
An App-level `useEffect` (same pattern as the font-size `zoom` effect — must live in `App`, not inside `SettingsPage`, or the theme would revert the moment you navigate away) watches `data.settings.theme` and calls `generateTheme()` + `applyTheme()` whenever it changes, including on initial load. This is what makes the theme survive an app restart.

### Known gaps / not yet done
- **Colorblind mode was built in session 24** and is distinct from this feature: theme is accent-colour choice, colorblind mode remaps specific hues that read as identical to some people. It works by putting `cb-rg` or `cb-by` on `<html>` and redefining a few CSS variables — `cb-rg` (deuteranopia/protanopia) sends red to orange and green to blue; `cb-by` (tritanopia) sends amber to red-orange, teal to pink and green to blue. It is a variable remap, not a palette or a filter.
- No "save multiple custom themes" / theme gallery — only one active theme at a time, overwritten each time Apply is clicked
- Generated themes aren't currently exported/backed up anywhere beyond living in `data.settings.theme` inside the main data file (same backup coverage as any other setting — fine for global/per-world backups since those copy `data` wholesale, but worth knowing if a dedicated settings-export feature is ever built)

---

## CSS Gotchas (hard-won, do not relitigate)

**CSS `zoom` on `<html>` breaks every pointer calculation in the app, and it has caused the same bug twice.** The font-size setting applies `document.documentElement.style.zoom` (0.9 / 1 / 1.125 / 1.25). Under CSS zoom, Chromium reports `offsetX` / `offsetY` in the **unzoomed** space while `clientWidth` / `clientHeight` and `getBoundingClientRect()` are in the **zoomed layout** space. Mixing them inflates every coordinate by the zoom factor.

**The error is proportional to distance from the origin**, which is what makes it so hard to recognise: anything near the top-left works perfectly and everything further away drifts. It does not look like a coordinate bug, it looks like "the bottom half is broken".

- First occurrence: crop handles. Only the top-left corner could be grabbed. Measured at zoom 1.125, a click 810 units in registered at 921.
- Second occurrence (session 40): the colour picker refused to sample the lower part of an image. At zoom 1.25 the computed row ran past the end of a 468-row bitmap at about 81% down, so every click below that clamped to the last row and returned the same colour.

**`appZoom()` and `pointerFraction()` in the plain JS block are the one correct implementation.** Every pointer-to-content calculation must go through them. The second occurrence happened precisely because a new tool did its own coordinate maths instead of reusing the fix that already existed — the same consolidation failure recorded elsewhere in this document.


- **`vh` units don't reliably scale with CSS `zoom`.** The font-size feature (Settings → Appearance) is implemented via `document.documentElement.style.zoom` (chosen because the app's CSS uses ~435 hardcoded pixel values and almost no `rem`/`em`, so changing the root font-size alone does nothing — see Performance Notes). `zoom` scales rendered pixels, but `vh` is computed against the raw device viewport in a way that doesn't reliably co-scale with it. `.sidebar` was set to `height: 100vh` to fix a header-scrolls-off-screen bug (session 18) — that fix was correct in isolation, but at any font size other than "Normal," the sidebar's rendered height would exceed the actually-visible area, recreating the exact same header-scrolling bug it was meant to fix (session 19 root-caused this). Fixed by using `height: 100%` instead (inherited from `.app`, itself `100%` of `#root`'s `100vh`) — percentage units are relative to the parent's computed box, not the raw viewport, so they scale correctly under `zoom`. **Any future "fixed-height sidebar/panel" CSS should use `%` chained from a `100vh` ancestor, never `vh` directly on an element that needs to coexist with the zoom-based font scaling.**

---

## Data Safety Architecture (critical — read before touching save/load code)

On June 19 a race condition caused a real data-loss incident: the empty default `initData` was written over a 30MB+ real data file before the async load had finished resolving, destroying months of characters, worlds, lorebooks, collections, personas, and notes. Recovery was only possible via the independent per-character/lorebook/collection auto-save files (which were untouched) — the main data file and all notes were unrecoverable. This is now defended in three independent layers. **Do not remove or weaken any of these without explicit discussion — they exist because of a real loss, not a hypothetical one.**

### Layer 1 — renderer load guard (`index.html`)
A `dataLoaded` state flag starts `false`. The autosave `useEffect` (which writes `data` to disk on a debounce) checks `if (!dataLoaded) return;` as its very first line. `dataLoaded` only flips to `true` after `loadData()` has resolved — successfully or not. If loading throws, autosave stays permanently blocked rather than risk overwriting the real file with the default empty shape.

### Layer 2 — main process shrink-refuse check (`main.js`)
`save-data` compares the byte size of the incoming write against the existing file on disk. If the existing file is non-trivial (>5KB) and the new write would be less than 50% of that size (`SHRINK_REFUSE_RATIO`), the write is **refused**. Instead of overwriting, the would-be content is written to `lorekeeper-data.SUSPICIOUS.json` for manual review, and the real file is left untouched.

**Session 32 — the legitimate-shrink escape hatch.** This guard cannot distinguish a catastrophic empty-state write from an intentional bulk shrink. Clearing base64 out of a 134 MB data file produces a ~95% shrink, so the migration write was refused and silently landed in `SUSPICIOUS.json` while the real file stayed bloated — the change looked applied in the UI and was gone on restart. `saveDataAllowShrink()` exists for exactly this case. It is **not** a blind bypass: it snapshots the current file to `lorekeeper-data.preshrink-{ISO}.json` first, and it **resets `lastgood` to the new content**. That reset is required, not cosmetic — `lastgood` is the second half of this check, so leaving it at the old size would cause the *next ordinary autosave* to be refused for being under 50% of a stale baseline. Only the image migration/cleanup paths call this; do not reach for it to work around any other refusal.

### Layer 3 — rolling last-known-good backup (`main.js`)
Every write that passes the Layer 2 check also writes a copy to `lorekeeper-data.lastgood.json`. This is a second, independent fallback file separate from the main save, useful as a manual recovery point if something Layers 1–2 didn't anticipate ever happens.

> **Layers 1–5 protect against software failure only.** Every one of them writes to the same disk as the data it protects, so none of them survive losing the drive. That is what Backup is for — see its own section. The two are complementary and neither replaces the other.

### Layer 4 — standalone per-item backups: notes, templates, personas (`main.js` + `index.html`)
Notes (global scratchpad and per-world) previously had **no** independent backup — they only ever lived inside the single big data file, unlike characters/lorebooks/collections which each already auto-save to their own JSON. Every world's notes (and the global scratchpad) now also debounce-write to a plain-text file at `Notes\{WorldName}.md` / `Notes\_global.md`, completely independent of the main data file write. A "Notes Backups" panel on the Batch Import page explains this and has an "Open Notes folder" button. Wired from both the right-panel Notes tab and the World Info tab's Notes field (same backend file, same backup).

The same reasoning was applied twice more as the gap was found elsewhere: **templates** to `Templates\{name}.json` (session 17/18) and **personas** to `Personas\{name}-persona.json` (session 35). All three follow the identical pattern — debounced write, independent of the main data file, no base64 in the payload.

Personas are the sharpest case: they are a Saucepan concept but **cannot be exported from Saucepan**, so Lorekeeper holds the only recoverable copy. The `Personas\` folder had existed since early on and looked backed up, but nothing ever wrote to it automatically — the `.md` files in it were manual "Export MD" saves, three months stale by session 35, and markdown cannot be reimported anyway. **A folder containing files is not evidence of a backup; check what writes to it.**

### Layer 5 — shutdown flush (`main.js` + `preload.js` + `index.html`, session 32)
Autosave is a debounced timer in the renderer, and `window-all-closed` previously quit the app immediately. Closing the window inside the debounce killed the pending timer, and any write already in progress died with the process — on a large data file the `JSON.stringify` plus disk write is not instant, so the exposure window was wider than the debounce alone. There was no `before-quit` handler and no `beforeunload` flush anywhere.

Now `mainWindow.on('close')` calls `preventDefault()`, sends `flush-before-close`, and waits. The renderer clears its debounce timer, awaits a final `saveData()` (still behind the `dataLoaded` guard from Layer 1), and replies `flush-complete`. Main then awaits `saveInFlight` — a module-level handle on the current write, added so shutdown can wait for a write rather than sever it — before setting `allowClose` and closing for real. An 8-second timeout ensures a hung or crashed renderer can never trap the window open.

The renderer handler registers once on mount, so it reads `dataRef`/`dataLoadedRef` rather than closing over `data` — capturing state from first render would have made the flush write stale data, which is worse than not flushing at all.

**Provenance note:** this was found while investigating a companion that stayed at `ready` after an apparent mark-posted. It was **not** established as the cause of that — the record had no `posted_dates` key at all, and under the pre-session-32 banner logic there was no banner to click on the day in question. Recorded here as an independent defect that was real on its own terms, not as the explanation for that symptom.

### `parseTimestamp()` — Saucepan date format
Saucepan exports timestamps like `"2026-06-18 03:01:00.455294 +00:00:00"`, which native `Date()` cannot parse (silently returns `NaN`). A `parseTimestamp()` helper near the top of `index.html` normalizes the format before handing off to `Date()`: space→T, truncate microseconds, **strip the whitespace before the offset**, then `+00:00:00`→`+00:00`. All `pts`/`parseTs` local helpers throughout the file alias to this single function — do not reintroduce inline duplicate date parsers.

**The whitespace strip was missing until session 45, and the function returned 0 for the exact format it exists to parse.** `replace(' ', 'T')` swaps only the **first** space, so `"…455294 +00:00:00"` kept the one before the offset and `Date()` refused the whole string. Latent for a long time because Lorekeeper's own records are ISO and parse natively on the first attempt — it only bit on a file downloaded straight from Saucepan, whose timestamp then read as 0, making any local record look newer and **skipping the import as "local newer"**. The protection fired when it should not have, and the only way past it was Force import all. Found by a test asserting the documented behaviour and getting 0.

Verified across the real format with and without the space, without microseconds, with a non-UTC offset (`+03:00:00` lands exactly three hours off UTC), against ISO, and against empty/null/garbage still returning 0.

---

## Performance Notes
- `update(fn)` clones the entire `data` tree before mutating (so React detects the change and undo-safety is preserved). This used `JSON.parse(JSON.stringify(d))` originally, which was slow enough to cause visible lag while typing (e.g. in the Notes textarea) once the character count grew past ~40. Switched to `structuredClone(d)` — same semantics, meaningfully faster, no string round-trip.
- `saveData` in `main.js` switched from `fs.writeFileSync` (synchronous, blocks the main process) with pretty-printed JSON to `fs.promises.writeFile` (async) with compact JSON (no `null, 2`).
- **Data file size, measured 30 October 2026: 3.78 MB**, down from 29.68 MB once every base64 blob was out of it. `update()` clones that whole tree per keystroke, so this is the number that governs typing responsiveness app-wide. If it climbs again, look for a new image handler storing a blob before looking anywhere else — see the Base64 section.
- If typing lag returns as the dataset keeps growing, the next lever is restructuring `update()` to avoid cloning the *entire* tree for small, localized field changes (e.g. per-collection update functions instead of one global clone-and-mutate).

### Session 31: the 190 MB data file
Typing lag returned, identical in every field regardless of which one. Root cause was **not** the save — it was data size interacting with `update()`:

- The data file had grown to ~190 MB. `update()` runs `structuredClone` over the whole tree on **every keystroke**, so each character typed deep-cloned 190 MB. Autosave then `JSON.stringify`d and wrote all 190 MB, and main wrote a second 190 MB copy as `lastgood`.
- The 190 MB was character portraits stored as base64 **inside** the JSON, from two separate bugs:
  1. `handlePortrait` (Set Portrait) never called `copyImageToFolder` at all — it wrote `{data: base64}` unconditionally.
  2. The Add-portraits handler called `copyImageToFolder({srcPath, destFolder})` — an object, when preload takes positional args. The call threw in main, returned `null`, and the code fell through to storing base64.
- The existing "Audit base64" tool only scanned lorebooks and collections, so it had never flagged the actual offender.

**Fixes:** both write paths corrected; the audit extended to cover character main images, portraits, and banners; migration now **links** to files already present in the companion folder (matched by filename) instead of writing duplicates, and applies all changes in **one** `update()` call — the original per-item loop would have deep-cloned 190 MB once per portrait.

**Lesson:** any per-keystroke path is multiplied by total dataset size. Keeping binary data out of `lorekeeper-data.json` is a performance requirement, not just tidiness.

---

## Windows Installer (session 31)

### Verifying a build — and a trap in the verification itself

**A clean electron-builder log does not prove the build is good.** The one file worth checking afterwards is `resources\app.asar`, which holds the entire application: it should be roughly 1.2 MB and dated after the build started. An empty or stale one would mean an installer that puts a codeless app on someone's machine, and nothing in the build output would say so.

**Check it from PowerShell, NOT through any tool that runs inside Electron.** Electron patches Node's filesystem so a path containing `.asar` is treated as an archive rather than a file, and a `stat` through that shim returns a synthetic result — in session 41 it reported **0 bytes with a two-day-old timestamp** for two different builds, both of which were in fact 1,180,600 bytes and minutes old. That reading sent a session into deleting build output and rebuilding to fix a problem that did not exist.

```powershell
Get-Item dist\win-unpacked\resources\app.asar | Select-Object Length, LastWriteTime
```

**Two files reporting the same size AND the same timestamp is the tell.** A freshly written file cannot share an mtime with one from days earlier; that combination means the measurement is synthetic, not that the build is broken.

**`app.asar` is often locked** by antivirus or the search indexer after a build, which makes `dist\win-unpacked` undeletable and unrenamable even from an elevated shell — it is a file-handle lock, so administrator rights do not help. Build somewhere else instead of fighting it:

```powershell
npx electron-builder --config.directories.output=dist2
```

The lock clears on its own; the stray folder can be deleted later.



`package.json` at the repo root (alongside `src/`) with an `electron-builder` NSIS config.

```
npm install
npm run build      ->  dist/Lorekeeper Setup 1.2.0.exe
```

- `allowToChangeInstallationDirectory: true` — the user picks the install folder, and **data lives next to the exe**, so app and data end up on the same drive. This was a deliberate choice over `Documents\Lorekeeper`: a system-drive default gets wiped on a reformat.
- `DATA_DIR` is dynamic: `app.isPackaged ? path.dirname(process.execPath) : 'I:\\Lorekeeper'`.
- **Use `process.execPath`, not `app.getPath('exe')`.** `app.getPath` cannot be called before the app is ready; calling it at module scope to set `DATA_DIR` kills the process before any window opens, with no error and nothing in Task Manager.
- On startup main creates all eight standard folders if missing: root, Companions, Lorebooks, Collections, Worlds, Personas, Templates, Notes.
- Icons: `assets/icon.ico` (installer + shortcuts), `assets/icon.png` (window). Both already existed.
- `dist/` is gitignored; the installer ships as a **GitHub Release asset**, not committed to the repo.

### Versioning

One number, in one place: `version` in `package.json`. electron-builder names the installer from it, and `app.getVersion()` reads the same value back at runtime — exposed over IPC as `getAppVersion` and rendered by the `AppVersion` component at the foot of Settings. So the number on the installer and the number in the app cannot disagree.

**Bump it before any build intended to leave this machine**, so a copy in someone else's hands can be identified. There are no tags, no changelog file and no release notes: `lorekeeper-sessions.md` is the changelog, and the installer ships as a GitHub Release asset where the version in the filename is the whole story.

Current: **1.2.0** — the first build carrying the bundled rclone binary.

### Dependency audit — decided: leave it, and do NOT force it

`npm audit` reports around a dozen vulnerabilities across `electron`, `electron-builder` and its tree, `tar`, `extract-zip` and `adm-zip`. Recorded here, not in the roadmap, because it is a standing decision rather than a task.

**`npm audit fix` without `--force` is safe and has been run** (30 October 2026). It stayed inside the existing semver ranges and `package.json` is untouched: electron `^29.0.0`, electron-builder `^24.13.0`, adm-zip `^0.5.10`.

**`npm audit fix --force` must not be run.** It installs `electron@45` and `electron-builder@26`, both breaking, across four major versions of Electron. Everything about this build is pinned on purpose, and Electron's binary install already fails silently on this machine and needs a manual zip extraction (below). That is a day lost for no gain.

**Why the gain is no gain:** the reports are almost entirely build tooling, and the ones that are not describe a threat this app does not have. `tar` / `extract-zip` / `adm-zip` advisories are about hostile archives — Lorekeeper only ever extracts a backup ZIP it wrote itself. The Electron advisories matter to an app loading untrusted remote content; this one loads a local file and talks to APIs over HTTPS.

**When to revisit:** whenever Electron is upgraded for its own reasons. Not before, and not because the number is large.

### Environment gotcha (Ine's machine)
Electron's post-install binary download fails silently — `node_modules/electron/dist/` ends up containing only `locales/`, and `npx electron` reports "Electron failed to install correctly". Neither `npm install` nor running `install.js` directly produces any error output.

Workaround: extract the cached zip manually and write the path file.
```powershell
Expand-Archive "$env:LOCALAPPDATA\electron\Cache\electron-v29.4.6-win32-x64.zip" -DestinationPath "I:\Lorekeeper\node_modules\electron\dist" -Force
Copy-Item "I:\Lorekeeper\node_modules\electron\dist\path.txt" "I:\Lorekeeper\node_modules\electron\path.txt"
```
`path.txt` must sit at `node_modules/electron/path.txt` (next to `index.js`), **not** inside `dist/` — `getElectronPath()` reads it from `__dirname`.

Also: `npm run build` needs an **Administrator** PowerShell. The winCodeSign package contains macOS symlinks that Windows refuses to create without elevation, and the build retries four times and dies.

---

## Long-term Vision
Lorekeeper as full local backup and source of truth — independent of Saucepan. All content mirrored locally. Images as files. Export-ready even if the site goes down.

---

## Mobile Companion App — designed, nothing built

**Where the live plan lives:** `lorekeeper-roadmap.md`, Stage 4. This section is the design detail that plan refers to.

**The actual need:** the office machine restricts AI tooling, so there is no usable environment there. The phone is the only option for editing on the go — characters, intros, lorebooks and notes.

**Scope decisions already made:**
- **No Saucepan import/export from the phone.** Editing and creating only. This removes the worst risk on the table: the phone would otherwise need its own copy of the export strip list, and the two would drift silently until an import was rejected months later. Export stays a desktop action where the rules already live.
- **Sideloaded APK.** No Play Store. Rebuild and reinstall by hand; fine for one user.
- **Per-item files, not the main JSON.** The phone never reads `lorekeeper-data.pretty.json` (now 33 MB and desktop-authoritative). It works with individual item files, kilobytes each.
- **Never used concurrently.** Realistic worst case is forgetting to close one app, not genuine simultaneous editing. This is what makes the whole design tractable.
- **Storage is not a constraint** (~160 GB free on device). Images are already excluded from the repo, so the whole corpus is small.

**Conflict handling:** given non-concurrent use, conflicts are rare and do not need automatic merging. Present both versions with timestamps and let the user pick one and discard the other. Explicit choice, never silent resolution.

**Babel is not a constraint here — and this is worth understanding.** The 500 KB ceiling exists because `index.html` compiles JSX *in the browser at runtime* via Babel standalone. A mobile app would use a normal build step that compiles ahead of time, so there is no standalone parser, no runtime compile cost and no budget. The corollary: **do not reuse `index.html` as-is inside a WebView.** Runtime Babel on a phone CPU would be markedly slower than on desktop. Reuse React *components* if useful, not the single-file runtime-compiled architecture. Capacitor is the sensible wrapper if components are being reused.

**Build the prototype against the git repo without touching Lorekeeper.** The desktop app works and should not be destabilised for an experiment. The repo is already a complete, readable text corpus, so a mobile client can be developed and tested end to end against it with zero changes to `main.js` or `index.html`.

**Open questions, deliberately unresolved:**
1. Per-item files do not carry world membership, collections or linked lorebooks — `saveCompanionJson` strips them. A character viewed on the phone would appear context-free. Either write a `local.json` sidecar per item holding exactly the stripped fields (keeps `companion.json` Saucepan-clean, and gives those fields an independent backup they currently lack), or accept the missing context on mobile.
2. **Lorekeeper has no import path.** Every file in the repo is written *out* of the app; nothing reads them back. Until desktop-side ingest exists, a phone edit sits in the repo looking applied while the app never sees it. This is the real work, and it is larger than the mobile app itself.
3. Deletions: an absent file is ambiguous between "deleted" and "not yet created". Trust git's diff rather than folder state, or use tombstones.

**Suggested order** (value per unit of effort): notes first — `Notes\{World}.md` is already complete and self-contained, needs no schema work, and covers the loss that started session 35. Then lorebooks (self-contained entry text, no image dependency). Characters last, since the lossy-export problem lands hardest there.

---

## Handing the App to Someone Else

**Terminology, because the old heading caused confusion:** a *packaged* build already exists and works — `electron-builder` + NSIS produces an installer that runs on a machine with no dev tooling. That is done. What this section is about is **safe to hand to another person**, and the blockers were never packaging. The live checklist is in `lorekeeper-roadmap.md`, Stage 3b.

**Resolved session 31 — author IDs are not a blocker.** The concern was that exports would carry Ine's `author_id`. In practice: characters created in Lorekeeper default `author_id` to `''`, lorebooks and collections have no such field, and Saucepan sets authorship from the authenticated session on upload. Exports are already clean.

**Open question:** whether to strip Saucepan-specific fields (tags, platform export, image UUIDs, voice catalogue) for a general-purpose build, or leave them. Current lean is to leave them — the intended audience is Saucepan friends, for whom those fields are the point.

### The backup/restore model still needs rethinking before anyone else uses it

Full backup restore is a **total replace** — it wipes everything and loads the backup. That is safe for a solo user who knows their workflow, and a footgun for anyone else: take a backup, create new content, restore, lose everything made since.

**Option C (built session 29): "Import from backup."** A third path on the Import/Export page, distinct from full Restore. Content fields merge by `id` with `updated_at` as tiebreaker; `schedule_notes` merges by date key; `map_positions` and `release_cycle` merge intelligently; `notes` uses a safe append strategy; `settings` always stays local. Conflicts where `updated_at` is identical or missing prompt for Keep Local or Take Backup. Merge never deletes local-only items.

**Option D (long-term architectural direction):** split `lorekeeper-data.json` into a content file (mergeable) and workspace files (non-mergeable, stored separately — `settings.json`, `Notes/world_id.md`, `Maps/world_id.json`). Full restore would then only touch content by definition. Already partially done: per-world `.md` notes are external. Real cost: every IPC read/write touches multiple files, the data safety system needs rethinking, backup ZIPs get more complex, existing installs need migration. Worth doing properly rather than rushing.

**Note the overlap with the mobile app.** Option D and mobile ingest are substantially the same work. Both need the per-item files to become readable back into the app rather than write-only, and both need the mergeable-content / non-mergeable-workspace split. If ingest gets built for mobile, design it with Option D in mind rather than building it twice.

---

## Verified Behaviour

Confirmed working end to end, not merely read in the code. Kept here rather than in the roadmap, which is only for what is still to do. **Do not re-test these without a reason**, and do not move them back to the roadmap as open items.

**Exports and the platform** — companion and lorebook exports accepted by Saucepan on upload, not just inspected on disk (session 35e). Collection export confirmed after the `lorebook_display` fix. World Export ZIP confirmed separately, because its three per-type loops were the paths that had diverged furthest and could not be assumed to follow the individual exports. Site crop round-trip confirmed: a crop set on Saucepan reads back and previews identically here. Highlight stripping confirmed — `==marks==` never reach an export.

**Editing** — find-and-replace, highlighting, Roll, name generation, the Add strand input on Timeline, drag-to-reorder on collections, and the portrait picker opening in the character's own folder. Crop handles confirmed working on all four corners; the diagnostic readout added while chasing that has been removed, the pixel dimensions stay.

**Dashboard and scheduling** — the Drafts / Ready to schedule split, banner focus, and Timeline strands rendering as columns.

**Token meter** — calibrated against Saucepan's own numbers (session 35o). It had been undercounting the site by about 6%, so cards now read roughly 6% higher than they used to. The caps did not move; they finally measure the same thing the site measures.

**Backup over the GitHub API** (session 37) — first run uploaded 1 file of 176, recognising the 175 the script route had already pushed as identical, which proves the hash comparison works against a repository it did not create. The 32.9 MB pretty data file uploads in 15-20 seconds. A repeat run reports no changes instantly. Files on the remote that Lorekeeper does not own — `ComfyUI/`, `LMStudio/`, `README.md`, the sync scripts — are left untouched.

**Posting through the dashboard banner** (9 October 2026) — a scheduled character posted from the banner and went public. This was the last piece of Stage 0 that needed a real cycle rather than more code.

**Still unconfirmed:** that a cycle skip clears itself after the next post. One item, in the roadmap.

**Backup runs unattended** (9 October 2026) — `Lorekeeper.exe --backup` completes with no window, through the same `runBackup` the button uses. Both scheduled tasks confirmed with `LastTaskResult: 0`.

**The rclone engine, against the real rclone binary** (9 October 2026) — text uploaded, images and the raw data file excluded, a second run a no-op, a deleted character removed from the destination, and files at the destination that Lorekeeper did not put there left untouched. The connection verifier was tested against a working destination, an unwritable one and a nonexistent remote.

**Notes ingest, end to end** (24 October 2026) — a note edited outside the app is detected, labelled **Changed on disk**, and taking the file updates the note. The three-way merge honours deletions, and a note changed on both sides is shown rather than resolved. **This is the first thing in Lorekeeper that reads its own output**, and the first half of Stage 4.

**The data file holds no base64 at all** (30 October 2026) — 29.68 MB down to **3.78 MB**, verified by reading the live file and scanning every image-bearing field on worlds, characters, portraits, character banners, lorebooks, collections, personas and the gallery. Nothing was lost in the process: every world, lorebook and collection still carries an image reference, and the item counts are unchanged. `SUSPICIOUS.json` kept its July timestamp throughout, so no save was silently refused by the Layer 2 shrink guard.

**A collection with no auto-save filename can store a banner as a file** (30 October 2026) — the case that had been impossible before the gate was removed. Confirmed on Standalones: `image_data` null, `image_relpath` set to `Collections/standalones.png`, platform UUID untouched.

**The SillyTavern card builder, against real data** (30 October 2026) — 77 unit assertions and 20 end-to-end checks, all against code extracted from the shipped `index.html` rather than retyped. Embedding into Ryōta's real 1.4 MB portrait preserved 23 IDAT chunks and 2 unrelated `tEXt` chunks in order, every CRC validated against `zlib.crc32`, the image bytes came out identical and the card read back byte-for-byte. CRC32 was checked against the tool that defines it, empty input included. **What this does NOT cover: SillyTavern importing one, and the canvas re-encode path used by AVIF, WebP and JPG portraits.** Both need Electron and a real install.

**The derived source URL** (30 October 2026) — `https://saucepan.ai/companion/<id>` confirmed against a real companion URL and against that record's stored `id`, which matched. The pattern alone proves nothing; the id has to be the platform's.

**Persona portraits render** (30 October 2026) — the new components were **server-rendered** with the pinned React 18.2.0, not merely compiled: both tabs, an empty persona, a persona at the 10-slot cap, and the character export tab as a regression check. 33 assertions. Compiling catches a parse error; rendering catches a component that compiles and then throws, which is the failure this file is actually prone to.

**Timelines auto-save to their own file** (18 October 2026) — editing a timeline writes `Timelines\{world}.json`. The last content type with no independent copy on disk now has one.

**No machine-specific path in the UI** (14 October 2026) — eight hardcoded `I:\Lorekeeper` sites removed from the renderer. Five hints now show a path relative to the install (`Saves to: Companions\…`), the Batch Import step and the Settings data path read the real folder, and the gallery's click-to-copy image path — the one place where a relative path would be useless — resolves against `DATA_ROOT`, fetched once from `get-data-dir` and cached. Confirmed on screen.

**A fresh install does nothing** (11 October 2026) — a packaged build launched with no configuration shows backup **None** with an empty repo folder, writes no `sync-paths.cmd`, writes no pretty data file and launches no script. Confirmed after the three writers above were fixed. This was the exit condition for the packaging pass.

**The bundled rclone resolves in a packaged build** (11 October 2026) — `resolveRclone()` found the binary under `resources\rclone\` in `dist`, not merely on `PATH` as in dev. This was the last item that could only be tested by packaging.

**Google Drive, end to end** (11 October 2026) — the browser sign-in completed, the remote was saved, and the round-trip check wrote a file to Drive, read it back and matched it. This was the last untested path in the backup system. OneDrive and Dropbox go through the identical rclone flow and are expected to work, but have not been run.

---

## Working Method That Keeps Paying Off

Lessons that cost something to learn, kept here rather than in the roadmap — the roadmap is only what is still to do. Each line is a rule, and most of them exist because ignoring it produced a confident wrong answer. The session that produced each is named where it helps; the full account is in `lorekeeper-sessions.md`.

- **Simulate logic against extracted shipped code before trusting it.** Caught the 4:1 crop exporting at 3.33:1, the cycle head restarting, the `0%` slider snapping back, and a posting path that skipped its own date stamp. Session 37 ran the whole GitHub sync against a stubbed `https` module across eight scenarios before it touched the real repo.
- **Test the tool's actual behaviour, not its documentation.** rclone's docs would not say whether `sync` deletes unlisted files at the destination. Running it took two minutes and changed the entire design.
- **A merge with two inputs cannot represent a deletion.** Given "A has this line, B does not", nothing distinguishes *B deleted it* from *A added it*, so a union keeps it and a deleted line comes back. That is missing information, not a bug to code around: the fix is recording what both sides last agreed on. Session 43.
- **A hint that names a quantity has to count it.** A fixed string saying "a line" is wrong at two and wrong differently when some were added and some deleted. Where the number cannot be known honestly, count what *can* be — and say that instead.
- **Hints state the problem, not the mechanism.** Explaining why the code behaves as it does reads as justification and is re-read every single time. That reasoning belongs in a code comment.
- **A control belongs where the action happened.** An Undo rendered at the top of a panel after acting on a row halfway down it is a control that has to be hunted for, at the one moment speed matters.
- **Adding a data folder means changing four lists**, and a folder missing from any of them fails silently: startup creation, the restore/scan list, `MIRROR_FOLDERS`, and the public repo's `.gitignore`.
- **Before solving a problem, search this file for whether it has already been solved here.** Twice in three sessions a fixed problem was met as if new: the CSS `zoom` pointer maths, solved in `CropTool` and then written wrong again for the colour picker; and the unstyleable browser popup, solved with `color-scheme: dark` for date inputs and then met again as "the colour picker is in light mode". Both fixes were already in the file, three hundred and a thousand lines away. Searching costs seconds.
- **An audit that fixes the reported instances is not an audit.** Two hardcoded paths were reported; a sweep found eight. The reported ones are a sample, never the set.
- **A rule a document states about itself is the first thing to drift.** The roadmap's header says finished work does not go in it; three pieces of finished work went in anyway, over two sessions, each added by someone who had just read that header and felt the exception was warranted. Re-read the rule as a reader, not as its author.
- **Code changed is not the same as done.** A roadmap item was retired because the fix had been written, compiled and shipped to disk — and nobody had looked at it on screen. *Do not write a feature up as working before it has run once* governs removing an item as much as adding one.
- **When something writes a file it should not, read the file before reading the code.** `sync-paths.cmd` carries a `SRC=` line holding the writer's own `DATA_DIR`, which identified a packaged build and cleared a suspected dev instance in one command. Two wrong theories had already been built on top of the code before anyone opened the file.
- **An intermittent symptom is often state created by one run and read by the next.** The fresh-install write appeared on the second launch and not the first, which read as a contaminated test and was in fact the data file being created by run one and seeded from by run two.
- **An argument written down in a comment has to be applied to the line beneath it.** The renderer correctly refused to seed `backup_provider`, explained exactly why, and then seeded `backup_repo_dir` from the same source on the next line.
- **Prove a write landed by reading the byte count back off the disk.** A tool reporting success counts for nothing. Session 41 spent two separate detours on files that were reported written and never changed, and in both of them the first suspicion fell on Ine's machine rather than on the measurement.
- **When the same decision is expressed in two places, read the other one before writing yours.** Session 41's fix for the fresh-install bug contained a fresh bug of its own — a provider value that did not match the gate four hundred lines away which had already got it right.
- **Two files cannot share an mtime when one was written days after the other.** Identical size *and* identical timestamp across two builds means the measurement is synthetic. Session 41 read `app.asar` as 0 bytes through Electron's `.asar` filesystem shim and deleted build output to fix a problem that did not exist.
- **Average colour in linear light, never in sRGB.** sRGB values are gamma-encoded, so the mean of the numbers is not the mean of the light. A 5x5 patch across a red and a cyan averages to brown if you skip the decode.
- **Check a hash function against the tool that defines it.** The blob hashing was verified against `git hash-object`, not against the spec for it. The empty-file case is the one that catches a wrong implementation.
- **Prove an edit did only what you meant.** After patching `main.js`, stripping the three insertions back out reproduced the original byte for byte.
- **When a test fails, establish whether the code or the test is wrong before changing either.** Session 39 produced two confident wrong results in a row: a permissions test that meant nothing because the container runs as root, and an absolute path that broke the harness rather than the engine. Both would have made the code worse if the first instinct had been trusted.
- **A file existing is not a file being valid.** Session 38's first token rescue checked `existsSync` and called that a token. Make the validity test *be* the operation that matters — decrypt it, parse it, run it.
- **Never delete the only copy of something to prove a theory about it.**
- **If something cannot be tested, make it test itself.** The cloud sign-in could not be exercised without an account, so the first connection now writes a file, reads it back and removes itself if that fails. Untested is not the same as unverifiable.
- **A convenience that cannot work on the target platform should say so, not keep trying.**
- **Log actual values before theorising about platform behaviour.**
- **When the same logic exists in several places, consolidate rather than fix each copy.** Every "fixed by matching" in this project drifted again within a few sessions — most recently the pointer maths for CSS `zoom`, which was solved in `CropTool` and then written wrong a second time for the colour picker.
- **Verify on the machine, in bytes.** A `chcp` line added for accented paths broke the sync entirely; it had been reasoned about, never run.
- **Read the shipped file, not the document describing it.** Session 36 found two things the spec asserted were working that had never been written. Session 37 found a feature described in both the spec and Help that had been *deleted* two sessions earlier.
- **Count the array, do not read the sentence.** Totals stated in words — "11 tabs", "three layers", "15 sections", "17 tools" — stay plausible long after the underlying list changes. Every one of them that has been checked in this project was wrong. The same applies to sizes: "roughly 22 MB" for the rclone binary was the download zip, and the executable that actually ships is 81.5 MB.
- **Do not write up a feature as working before it has run once.** Where that is unavoidable, say so in the document, in the place someone will look.
- **A test fixture that invents the field under test can pass vacuously.** The render check for the collection image handler supplied a made-up `collection_filename`, so it exercised the one branch that worked and never the branch that was broken. It passed, twice, while three real collections could not store a banner at all. **Build the fixture from the real data, or at minimum from the case that is failing.**
- **Never gate an operation on a setting that governs something else.** The collection and lorebook image handlers gated *writing a file* on the auto-save filename, which was only ever wanted as a name. Empty filename meant no file, silently, forever. A field used as a name must not decide whether the write happens.
- **Fixing the success path is not fixing the bug.** Session 46 nulled the blob on the branch where the copy succeeded and left intact a branch that could never reach it. The symptom — "I re-uploaded it and nothing changed" — was the user's, not the code's, and the code was behaving exactly as written.
- **Before writing a migration, check whether the data needs migrating.** Eight of nine blobs were duplicates of files already on disk, and the ninth decoded to a file that was also already there. The job turned out to be subtraction, not conversion.
- **A write to the person's disk may need sending twice, and the first attempt still reports success.** Seen three times now across sessions 45 and 46: `device_commit_files` returns `written`, the mtime moves, the bytes do not change. The second identical call lands. So the loop is write, read the size back, write again if it did not change — never write once and report done.
- **A tool reporting a successful write proves nothing; read the byte count back.** Session 45: `device_commit_files` reported `written`, the file's mtime moved, and the content did not change — the old version was still on disk, confirmed by MD5. It took a forced write to land. The size check is what caught it, and it caught it because it was run every time rather than when something felt wrong.
- **When a write does not land, isolate before retrying.** Writing the same content to a second, throwaway path answered "is writing broken, or is this path broken?" in one call. Retrying blind would have left both questions open.
- **Render a component, do not just compile it.** Compiling catches a parse error. It does not catch a component that compiles and then throws, or renders nothing — which is this file's characteristic failure. Server-rendering the new components with the pinned React takes one script and caught a truncated test slice that a compile pass called fine.
- **Flagging a documented rule is not following it.** Session 45 added a feature to the very block this file named as needing a split first, noted that it had done so, and shipped. The note was accurate and useless. If the rule says do X first, do X.
- **Read the handler before trusting the row that describes it.** `copyImageToFolder` was documented for months as skipping when the destination exists. It overwrites. Persona portraits would have silently shared pictures.
- **Before any stage, back up.**

---

## Decisions That Stay Decided

Things that have been settled, where the temptation to revisit them is predictable. Each was argued out once; the reasoning is in `lorekeeper-sessions.md` under the session named.

**Character completeness is one list, and it is not splitting (session 32, confirmed session 35).** The dashboard once ran three separate definitions of "complete" — `progressMissing` checked 10 fields, `reworkChecks` checked 7, and they overlapped on only 3. A draft could show as ready to post while missing formatting instructions, example dialogue, advanced prompt and voice. All three now derive from a single `CHAR_CHECKS` list of 14 `[label, predicate]` pairs in the plain JS block, so they cannot drift apart again. The union treats `advanced_prompt` and `voice_catalog_id` as required, and that is correct in practice: the advanced prompt can be overridden on Saucepan anyway, and flagging the voice catalogue is precisely what stops it being forgotten. **Splitting `CHAR_CHECKS` into required and recommended groups is not wanted — do not implement it.**

**Help drifts silently, because nothing links it to the code (session 32).** An audit found nine corrections, most of them predating that session: Characters claimed 11 tabs and documented 8; Lorebooks described an Edit tab that had not existed since the chapters refactor; Data Safety said "three layers" and listed three when there were five. **Tab lists and layer counts rot first**, because they are stated as totals that stay plausible after the underlying list changes. Check counts against the actual arrays, not against whether the sentence reads sensibly.

### Won't do
- Per-world color theming
- Text stats in tools
- Schedule page (replaced by the dashboard calendar)
- Relationship dynamic generator
- Map generator

*The age calculator was on this list until session 37. Timeline gave characters dates to be an age against, so it moved to the roadmap as something to build — see Reconsidered there.*


## GitHub

### Repository
**There are two repos, they hold opposite things, and only one of them is private. Do not confuse them.**

**The source repo is PUBLIC** — `github.com/yosoyines/Lorekeeper`. Earlier versions of this section called both repos private, which was wrong in the one way that matters: the app's data folders sit *inside* the source repo's working tree, so `.gitignore` is not housekeeping there, it is the only thing standing between a public repo and every character, note and persona on the drive. Treat a change to that file as a privacy change.

**The backup repo is private and must stay that way.** It holds the data on purpose.

| | `lorekeeper` (source) | `lorekeeper-data` (backup) |
|---|---|---|
| Visibility | **public** | **private** |
| Created | June 2026 | Session 35 |
| Working tree | `I:\Lorekeeper` | `I:\LorekeeperBackup` |
| Tracks | source files and documentation | notes, templates, personas, companions, lorebooks, collections, the pretty data file, ComfyUI and LM Studio configs |
| Excludes | **all personal data** | **all images, model weights and credentials** |
| Committed | manually at session end | by the app itself, over the GitHub API: the Back up now button and the scheduled `--backup` run |

The two `.gitignore` files are close to **inverses of each other**. The source repo excludes `Companions/`, `Notes/`, `Templates/` and so on as personal data; in the data repo those folders are the entire point. Copying the source `.gitignore` into the data repo produces a repo that faithfully syncs nothing — this was nearly done during session 35 setup. The `.gitignore` listed below is the **source repo's**; see Backup for the other.

Separate repos are also a hard requirement, not a preference: `I:\Lorekeeper` is already the source repo's working tree, and two repos cannot share one folder.

### .gitignore
```
lorekeeper-data.preshrink-*.json
lorekeeper-data.json
lorekeeper-data.lastgood.json
lorekeeper-data.SUSPICIOUS.json
lorekeeper-data.pretty.json
Companions/
Lorebooks/
Collections/
Worlds/
Personas/
Templates/
Notes/
Timelines/
node_modules/
dist*/
vendor/
```
*(Verified against the real file, session 41.)*

**`dist*/`, not `dist/`.** `app.asar` gets locked after a build and the workaround is to build into `dist2`, `dist3` and so on — each one a full unpacked Electron app. Only `dist/` was ignored, so the alternates sat untracked in a public repo, kept out of it solely by the explicit `git add` list below. One `git add .` and they are in.

**`vendor/` holds the 81.5 MB rclone binary.** A redistributable third-party executable, placed by hand from rclone.org, reaching the installer through `extraResources`. It is not source and does not belong in the repo — and at 81.5 MB it is past the size GitHub warns about.

**`assets/` is deliberately tracked.** `icon.ico` and `icon.png` are committed on purpose — they are small, stable, and the NSIS installer build needs them present to reproduce without regenerating. An earlier version of this block listed `assets/`, `*.ico`, `*.png` and `*.svg` as excluded, which was wrong; the real file has never excluded them. Do not add those patterns back.

**`lorekeeper-data.pretty.json` must stay in this list** — it is the git-diffable copy written into `DATA_DIR` for the *backup* repo, and `DATA_DIR` is this repo's working tree. Without the ignore it shows up as an untracked ~21 MB file every session.
Note: `Templates\` and `Notes\` were added June 19 (new auto-save folders). `lorekeeper-data.lastgood.json` and `*.SUSPICIOUS.json` are the safety-net files from the Data Safety Architecture section — also personal data, also excluded. `lorekeeper-data.preshrink-*.json` (session 32, from `saveDataAllowShrink`'s pre-write snapshot) added the same way — full character data, same as the others.

### Reliable update workflow — run every session, in this exact order

**1. Check status first, before touching anything:**
```powershell
cd I:\Lorekeeper
git status
```
Read the output. `modified:` = changed tracked files. `Untracked files:` should only ever show data/backup files (`lorekeeper-data.json`, `lorekeeper-data.lastgood.json`, etc) — if `src/index.html`, `src/main.js`, `src/preload.js`, or `lorekeeper-master-spec.md` show up as untracked rather than modified, something is wrong (e.g. a fresh clone, or `.gitignore` swallowed them by mistake) — stop and investigate before proceeding.

**2. Stage exactly the source + doc files — never `git add .`:**
```powershell
git add .gitignore src/index.html src/main.js src/preload.js lorekeeper-master-spec.md README.md package.json package-lock.json
```
`git add .` is risky here because it would also try to add anything not yet in `.gitignore` — safer to always list files explicitly. Git silently skips any file in this list that has no changes, so it's safe to run every time even if not everything changed.

**3. Commit with a description of what actually changed:**
```powershell
git commit -m "Brief description of what changed this session"
```

**4. Push:**
```powershell
git push
```

**5. Verify clean state:**
```powershell
git status
```
Expected final output: `nothing to commit, working tree clean` except for the untracked data/backup files, which is correct and expected.

### Creating a reliable checkpoint / tag (recommended after any major session)
Once `git status` is clean, tag the commit so you have a named, easy-to-find restore point:
```powershell
git tag -a "session-17-stable" -m "Data safety fixes, batch import fixes, UI width fixes verified working"
git push origin --tags
```
To see all tags later: `git tag -l`. To check out a specific tagged version if something breaks: `git checkout session-17-stable -- src/` (restores just the source files from that tag without touching your current branch state).

### If `index.html`/`main.js`/`preload.js` ever look "reverted" again
This has happened multiple times this project: a chat session's fixes only exist in the chat's output files until manually re-uploaded to the Claude project knowledge, so a *stale* local copy can get re-uploaded and silently undo recent fixes. Before assuming a bug is new, check:
1. `git log --oneline -10` — does the most recent commit message match what was supposedly just fixed?
2. If not, the project knowledge files are behind the actual chat output — re-export the latest files from the chat and re-upload before doing any further debugging.

### What goes in the repo
| File | Tracked? |
|---|---|
| `src/index.html` | yes |
| `src/main.js` | yes |
| `src/preload.js` | yes |
| `start-silent.vbs` | yes |
| `start.bat` | yes |
| `.gitignore` | yes |
| `lorekeeper-master-spec.md` | yes |
| `README.md` | yes |
| `package.json` / `package-lock.json` | yes |
| `lorekeeper-data.json` | no — personal data |
| `lorekeeper-data.lastgood.json` / `*.SUSPICIOUS.json` | no — safety-net backups, still personal data |
| `Companions/` `Lorebooks/` `Collections/` `Worlds/` `Personas/` `Templates/` `Notes/` | no — personal data |
| `node_modules/` | no — too large, regenerable via `npm install` |

---

## Session Log

Moved to **`lorekeeper-sessions.md`** on 9 October 2026. It was 71 KB of this file — a third of it — in a single table whose rows ran to 5,700 characters, which is what made previews give up and render raw markdown.

Session labels referenced throughout this document resolve there. From session 37 on, numbering is plain: one number per session, no letters.

