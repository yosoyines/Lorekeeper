# LOREKEEPER — Master Specification
**Last updated: September 2, 2026 (session 35c)**

---

## Working Files (current as of session 35)
- Project files at `/mnt/project/` **are synced** — Ine uploads the spec each session. Source files (`index.html`, `main.js`, `preload.js`) are uploaded when a stable version is cleared.
- Working files during a session live at `/home/claude/`. Claude works from those; never re-pull from `/mnt/project/` mid-session.
- **Test environment removed (session 35)** — `I:\Test` was deleted once the build was running stably, so `DATA_DIR` is now `I:\Lorekeeper` in dev and next to the exe in production, with no separate test path. Consequence: untested builds now touch live data directly. Hit **Sync now** (Import/Export -> Git Backup Sync) before installing a new build, so a bad session is recoverable from the backup repo rather than only from a ZIP.
- Backup repo working copy at `I:\LorekeeperBackup` (see Git Backup Sync). It is a **separate git repo from the source repo** — `I:\Lorekeeper` is already the source working tree and two repos cannot share one folder.

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
| `syncToGit()` | Write the pretty data file, then run the backup sync script and wait for it; returns `{success, code, output, prettySize}` — see Git Backup Sync |
| `getSyncInfo()` | Returns `{backupDir, scriptFound, prettyExists, prettyMtime}` for the Git Backup Sync panel |
| `openBackupFolder()` | Opens `I:\LorekeeperBackup` in Explorer |
| `saveTemplateFile(filename, data)` | Write a standalone JSON backup to `Templates\{filename}.json`, independent of the main data file — same reasoning as `saveNotesFile`, added session 17/18 |
| `saveImage({base64, defaultName})` | Save a binary image via a Save dialog (session 26 image tools) |
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
| `copyImageToFolder(srcPath, destFolder, filename)` | Copy image locally; skips if already in Lorekeeper folder or dest exists; returns `{relPath, base64}` |
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
- **Local-only, stripped on export (13 fields, identical list in all four export paths):** `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `export_filename`, `lorebook_entry_text`, `lorebook_entry_title`, `voice_catalog_id`, `reworked_at`
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
- `image` — `{ data }` (legacy); `image_relpath` — `Personas\name.ext`
- `linked_lorebook` — single lorebook ID

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
- **Dashboard** — calendar, today banner, upcoming, release cycle, site checklist, lorekeeper checklist, drafts in progress
- **Worlds** — world card grid; click -> WorldDetailPage (Characters/Lorebooks/Collections/Gallery/World Info tabs)
- **Characters** — world filter dropdown + status filter dropdown (Draft/Ready/Posted), both via shared `WorldFilterDropdown`/funnel pattern (added session 18 — scales to any number of worlds without the filter row wrapping or growing); click -> CharDetailPage (11 tabs)
- **Lorebooks** — world filter dropdown (includes Standalone), same shared component; click -> LorePage (Chapters/Settings/Export tabs)
- **Collections** — world filter dropdown (includes Standalone), same shared component; click -> CollPage (Edit/Export tabs)
- **Personas** — player characters, independent from worlds; click -> PersonaDetailPage; "New Persona" button in topbar (added June 19 — was missing entirely, only Export/Delete existed once a persona was already selected)
- **Templates** — global and per-world character creation templates; card list grouped by world, with a world filter dropdown to narrow the grouped sections shown (added session 18)
- **Import/Export** — renamed from "Batch Import" session 19. Scan folders, import, image audit, backup/restore, plus a "Quick Import / Backup" card at the top for single-file import and full-app backup (moved here from the sidebar footer — see below)
- **Settings** — API key, model, font size (applied globally), debounce, theme/colorblind (placeholders); full-width layout
- **Help** — 15 collapsible sections covering all features
- **Worlds list** — pinned first, emoji icon, right-click -> pin/unpin
- **Sidebar collapse** — icons only mode (52px wide). No footer (removed session 19 — see below). **Collapse/expand button fix, session 19:** at 52px collapsed width, the header's padding (24px) plus the logo icon (28px) already consumed the full available space, squeezing the collapse/expand toggle button to zero width — it was still technically in the DOM but invisible and unclickable, making the sidebar impossible to re-expand once collapsed. Fixed by stacking the logo and the toggle button vertically when collapsed instead of competing for horizontal space.
- **Topbar action button separator, added session 19:** a thin vertical divider now sits between page-specific action buttons (Delete, Export, Update from JSON, etc.) and the Notes panel toggle button on the far right of every page's topbar. Previously a destructive Delete button could sit directly adjacent to the panel toggle with only the standard 8px gap, on Characters/Lorebooks/Collections in particular — easy to misclick. The divider is positioned globally in the topbar layout (not per-page), so it applies consistently everywhere a topbar exists.
- **Logo** — clickable -> Dashboard

### Detail Pages
All four content-type detail pages share the same `char-detail` layout: a 260px left sidebar (image, quick info, tags) plus a main content area on the right with a tab bar.
- **CharDetailPage** — sidebar (portrait, platform image UUID, banner, quick info, tags) + main (11 tabs: Identity, Full Description, Character Card, Formatting, Scenarios, Portraits, Lorebooks, Collections, Settings, Schedule, Lorebook Entry)
- **LorePage** — sidebar (cover image, image ID, quick info) + main (Chapters, Settings, Export)
- **CollPage** — sidebar (banner image, quick info) + main (Edit, Export)
- **PersonaDetailPage** — sidebar (portrait, quick info) + main (Profile)

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

**Gallery** — all world images; hover shows name, dimensions (WxH px), full Windows path (click to copy), extension badge

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
3. **Export** — Export JSON and Export MD, both with warnings (added session 18 — previously only characters had pre-export warnings; lorebooks silently exported with a missing image UUID, no tags, or Open definition protection with no nudge). MD preview toggle, fixed session 18 (previously the preview button called a hardcoded no-op — see Session Log). Export tab is now full-width (fixed session 19 — `.export-panel` CSS, shared by this, `CollExportPanel`, and `CharExportTab`, had a leftover `max-width:600px` that made the tab look half-width on a wide page).

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

## Git Backup Sync (session 35)

### Why this exists
Layers 1–5 of the Data Safety Architecture all defend against **software** failure — an autosave race, a bad write, a killed process. None of them defend against **losing the disk**, because every one of them writes to the same drive as the data they protect.

Session 35 opened with exactly that: an `I:` drive failure. Companions, lorebooks and collections survived (they're also on Saucepan). Templates were rebuildable. **Notes were not**, and neither were the ComfyUI workflows or LM Studio presets on the same drive. The drive came back after a reseat, so nothing was permanently lost, but the gap was real.

The full backup ZIP already contained everything including notes. The problem was that it also contained every image, which makes it gigabytes and therefore something you export occasionally rather than continuously. **The backup that held the notes was the one too heavy to run often.**

### The core insight
Images are re-downloadable from Saucepan. Notes are not. Text-only, the entire corpus — notes, templates, every per-item JSON, and the main data file — is around 16 MB packed. That is small enough to push to git after every session.

### What gets backed up beyond Lorekeeper
The same script covers ComfyUI and LM Studio, because the disk failure threatened those too and neither app can trigger Lorekeeper's shutdown hook:
- `ComfyUI\user\default` — workflows and `comfy.settings.json`
- `ComfyUI\user\__manager\snapshots` — ComfyUI-Manager's installed-node list with versions. This is the reinstall manifest, which is why `custom_nodes\` itself is not backed up.
- `.lmstudio\config-presets` — configs only, by Ine's preference

**`.lmstudio\credentials` is deliberately never copied.** It holds API keys. A secret committed once stays recoverable from git history forever, even after the file is deleted, so this is excluded in the script *and* in `.gitignore`.

### Why `lorekeeper-data.pretty.json` exists
`saveData` writes compact single-line JSON. Git cannot diff a single line, so every commit of the 21 MB data file would store a whole fresh blob rather than a delta. `writePrettyData()` in `main.js` emits a pretty-printed, **recursively key-sorted** copy alongside it.

Key sorting matters as much as the line breaks: without it, JavaScript reordering keys shows up as a full-file rewrite even when nothing changed. With both, a one-note edit diffs to two lines.

This is **not** written on every autosave — stringifying tens of MB is far too slow for that. It is written on shutdown and on Sync Now only. Trade-off: after a hard crash the pretty file is one session stale. Acceptable, since the compact file is intact and the next clean close refreshes it.

The pretty file lands in `DATA_DIR`, which is the **source** repo's working tree, so `lorekeeper-data.pretty.json` must stay in the source repo's `.gitignore`.

### Architecture
Three pieces, deliberately separated so that each still works when the others don't:

1. **`main.js`** — `writePrettyData()` and `launchSyncDetached()`. The shutdown hook sits inside the existing Layer 5 flush handshake, immediately after `saveInFlight` resolves, so the pretty copy is written from final data rather than a half-saved state. The spawn is `detached` and `unref()`'d, so a slow `git push` can never hold the app open or delay quitting.
2. **`lorekeeper-sync.bat`** in `I:\LorekeeperBackup` — robocopy mirrors, then `git add -A`, then a `git diff --cached --quiet` check that exits silently when nothing changed (without it, every run would produce an empty commit), then commit and push.
3. **`GitSyncPanel`** in `index.html` — Sync now button on the Import/Export page. Uses the waiting `sync-to-git` IPC rather than the detached spawn, since the UI needs the real result; prints the script's actual output on failure so a git problem is diagnosable without a terminal. Three-minute timeout.

### Image and model exclusion is layered on purpose
A wrong path here doesn't fail loudly — it silently mirrors tens of GB of checkpoints and pushes until GitHub rejects it. So:
- **Path scope** — only `user\` config folders are ever referenced; `models`, `custom_nodes`, `venv`, `input`, `output`, `temp` are never named
- **Extension filter** — robocopy `/XF` on image, video and model-weight extensions
- **Size cap** — `/MAX:5242880` refuses any file over 5 MB regardless of type. This is the real backstop: even with a wrong path, a model file physically cannot enter the repo.
- **`.gitignore`** — repeats all of the above as a second lock

**Keep the image extension list in sync with `IMAGE_EXTS` in `main.js`.** The first run leaked a `.avif` because the script's list had png/jpg/jpeg/webp/gif/bmp while `IMAGE_EXTS` includes `avif`. A single 100 KB file didn't matter; the silent gap did. Now covers `avif`, `tif`, `tiff` and `mov` as well.

### Notes on operation
- `/MIR` means deletions propagate. Deleting a character in Lorekeeper removes it from the backup folder on the next sync — correct, since git retains the history.
- The repo's `.gitignore` is roughly the **inverse** of the source repo's. The source repo excludes `Companions/`, `Notes/`, `Templates/` etc. as personal data; here those folders are the entire point. Copying the source `.gitignore` over would produce a repo that faithfully syncs nothing.
- `.gitattributes` sets `* -text` to disable CRLF conversion. Without it, git rewrites line endings on checkout, producing phantom full-file diffs on every note.
- Run `git gc` occasionally. Repo growth is essentially the pretty JSON's history; everything else combined is under 2 MB.
- Known cosmetic issue: the panel's status line shows `prettyMtime` as raw UTC, so it reads a few hours off local (Montevideo) time. Not yet converted.

---

## Auto-Save to Disk
- Characters -> `Companions\{folder}\companion.json`
- Lorebooks -> `Lorebooks\{filename}.json`
- Collections -> `Collections\{filename}.json`

> **These per-item files are Saucepan export shapes, not complete backups.** `saveCompanionJson` strips `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `export_filename`, `lorebook_entry_text`, `lorebook_entry_title`, `voice_catalog_id`, `reworked_at` and portrait `relPath` before writing. Restoring from them recovers a character's *content* but not its world membership, collection membership, linked lorebooks or schedule state — as happened in session 16, where that had to be rebuilt by hand. Those fields live only in `lorekeeper-data.json` (and now, via the pretty copy, in the backup repo). Any future two-way sync needs a `local.json` sidecar holding exactly the stripped fields; see What's Next section B.
- Personas -> `Personas\{name}-persona.json` (session 35) — debounced 800ms from `PersonaDetailPage`, same pattern as Notes and Templates. `image.data` base64 is stripped before writing; `image_relpath` is the real reference and the blob would only bloat the backup. Personas are a Saucepan concept but **cannot be exported from Saucepan**, so Lorekeeper holds the only recoverable copy. The pre-existing `.md` files in that folder are manual exports, not backups — markdown is a formatted document and cannot be reimported.
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
- **Image Storage Audit (Settings) buckets, corrected session 32.** The scan checks four states, not three: `relpath_ok` (path resolves, no stale data), `relpath_broken` (path set, file missing), `needs_migration` (base64 only, no path), and `leftover_data` (path resolves **and** base64 is still sitting in the JSON). The `leftover_data` case was invisible before session 32 — the scan returned early on anything that had a relpath, so 49 of 50 base64 blobs were being reported as clean. Clearing that bucket needs no file write, only nulling the stale field.
- The link-existing-file picker is populated for lorebooks/collections/worlds/personas via `listFolderImages` (session 32). Before that only companions had their folder scanned, so every other type fell through to "write a new file" with no options, even when a matching image was already sitting in the folder.
- Audit and migration both write through `saveDataAllowShrink` — an ordinary save is refused by the Layer 2 shrink guard.

**Every image consumer must read `*_relpath`, not just the base64 field (session 32 regression).** Clearing the leftover base64 made world and collection images vanish across the app. The relpaths were correct and the files were on disk — the *views* were the problem. Several read the base64 field directly with no relpath fallback, so the base64 had been silently masking a pre-existing gap. Two distinct failures:

1. **Missing fallback.** The Worlds card read `w.image` and fell back to another collection's `image_data`, never touching `w.image_relpath`. Same for the world detail header banner, the 16px world icons, the lorebook picker thumbnail, and the collection detail world fallback.
2. **CSS `url()` cannot resolve a relpath.** The collection cards (both All Collections and the world detail Collections tab) rendered via `backgroundImage: url(...)`. A relpath resolves relative to `src/index.html`, not the data folder, so it could never load even where `image_relpath` *was* in the chain. Any image that might be a relpath must go through `ImgFromPath`, which resolves it via the `readImagePath` IPC — never through a raw `<img src>` or a CSS background.

The Site Checklist was also affected: its "no local image backup" test was `if(!l.image_data)`, which would have flagged every migrated lorebook and collection, with blank thumbnails alongside.

**Lesson:** before clearing a field made redundant by a replacement, audit every *consumer* of that field. Verifying that the replacement resolves is not sufficient — it proves the data is reachable, not that anything actually reads it. Grep for the old field name and check each hit.

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

## Dashboard
*(intentionally untouched during the UI overhaul — out of scope until explicitly revisited)*

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

### Drafts in Progress
- All draft characters; missing-field amber tags; green checkmark when all filled

### Upcoming Panel + Release Cycle
- Next scheduled characters; configurable world posting order; drag to reorder

### In Progress panel (session 31)
- Renamed from "Drafts in progress". Filters `status !== 'posted'`, so **ready-but-unpublished** characters appear alongside drafts (previously only `status === 'draft'` showed).
- Status badge per row uses the real status (`status-draft` / `status-ready`), not a hardcoded "draft".
- Capped at 5 rows with a Show all / Show less toggle.
- Extracted from an inline IIFE into `InProgressPanel` + `InProgressRow` — same Rules-of-Hooks constraint as SiteChecklistPanel: the toggle needs `useState`, which cannot live in an IIFE that early-returns.

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
All calls go through one shared helper, `callAI(data, systemPrompt, messages, maxTokens)`, which branches on `settings.ai_provider` and returns `{text}` or `{error}` — it never throws. Used by both the Assistant chat and the Image Prompt Generator.

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

### Reference hardware (Ine's machine)
RTX 3060 Ti 8 GB, 32 GB RAM, i7-14700KF. **VRAM is the binding constraint, not RAM.**

- `qwen-3-14b-instruct` Q4_K_M (9 GB) — the daily driver. Does not fit 8 GB fully; partial CPU offload.
- `mistral-small-3.2-24b` (15.2 GB) — better prose, roughly half on CPU, noticeably slower.
- `deepseek-r1-distill-qwen-14b` and `exaone-deep-7.8b` are **reasoning** models — they emit `<think>` blocks and are the wrong tool for prose. qwen3-instruct returns `reasoning_content: ""`, so no stripping is needed for it.

Working LM Studio config: **context 16384, GPU offload 24 layers, K and V cache both Q8_0, Flash Attention on.** KV cache is ~160 KB/token at fp16, so 16k costs ~2.6 GB — Q8_0 halves it to ~1.3 GB, which is the difference between loading and not. Context length and offload are load-time settings; the model must be reloaded. The "Customized" badge only means the config differs from defaults, not that it is unapplied.

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
**Appearance** — Font size (Small/Normal/Large/XLarge, applies immediately and globally via CSS `zoom` on `document.documentElement` — see CSS Gotchas section for why `zoom` rather than root font-size); **Theme** (accent color → generated dark + light theme pair, live preview, Apply/Reset — see Theme System section, added session 20); **Colorblind mode** (Off / Red-Green / Blue-Yellow — built session 24; adds `html.cb-rg` or `html.cb-by` CSS class which remaps specific color variables)
**Data** — Data file path + Open Folder; Auto-save debounce (Fast 300ms / Normal 600ms / Slow 1s / Very Slow 2s)
**About** — Version info, deps, link to console.anthropic.com

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
| Image Prompt Generator | `ti-sparkles` | Generates an image generation prompt using Claude API; auto-populates from current character (name, description, tags, card snippet); art style + mood dropdowns; optional extra notes; copy button |
| Img Convert | `ti-transform` | Format converter (session 26) — converts between PNG/JPG/WEBP/AVIF |
| Paste & Save | `ti-clipboard-copy` | Reads an image from the clipboard and saves it to disk (session 26) |
| Crop | `ti-crop` | Crops an image to a chosen aspect/region (session 26) |
| Img UUID | `ti-id` | Extracts the platform image UUID from a Saucepan image (session 33) |

**Icon constraint:** every icon must exist in Tabler Icons 2.44.0 (pinned version). Confirmed NOT in 2.44: `ti-files-diff`, `ti-waves` — caused blank icons when used.

---

## Help System

- Help page in sidebar — 15 collapsible sections, kept current with the app
- Sections: Dashboard, Characters, Worlds, Lorebooks, Collections, Personas, Templates, Lorebook Templates, Relationship Map, Tools Panel, Import/Export, Auto-save, Image Storage Audit, Backup & Restore, Settings, Claude AI, GitHub backup
- **Needs updating** (session 29 open item): image tools, 3-card Import/Export layout, colorblind mode, character tab changes, backup merge flow
- Each has plain explanations, numbered steps, tip callouts
- Inline help buttons: Site Checklist, Batch Import, Lorebook Entry tab, Lorebook Templates manager

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

## Saucepan Tag System (session 34)

`SAUCEPAN_TAGS` (plain JS block, pure data — not part of the Babel budget) is Lorekeeper's local mirror of Saucepan's tag reference: `{id: {c: category, d: description}}`, 659 entries. `TAG_CATEGORIES` lists the 15 known categories in display order.

**This mirror will drift again.** It was last synced 19 Aug 2026 against a 658-tag PDF export. There is no live sync — if Saucepan adds, renames, or re-categorises tags, Lorekeeper won't know until someone re-runs this audit. Re-running it needs a PDF (or any source with real embedded text) of the site's `All Tags` reference page — a screenshot is not sufficient unless captured at native resolution, since a scaled-down screenshot cannot be recovered by upscaling.

**`mythological` is a known loose end.** It exists in `SAUCEPAN_TAGS` but had no match anywhere in the 658-tag audit — not by id, not by any plausible description similarity. It was kept rather than deleted, since "no match found in this audit" isn't proof it's gone from the site. Worth Ine checking directly; if it's confirmed gone, remove the key and add a `TAG_RENAME_MAP` entry only if there's a real successor, otherwise any character still carrying that tag keeps it as an orphaned string (harmless — Lorekeeper doesn't validate tags against `SAUCEPAN_TAGS`, it only uses it for autocomplete/description lookup).

**`TAG_RENAME_MAP` is migration plumbing, not a permanent structure.** It exists solely to let `migrateTagArray()` (plain JS block) fix up old ids sitting in existing `.tags` arrays on load. Once every affected character/lorebook/collection/world has been opened at least once post-update, every mapped old id is gone from the data and the map does nothing further — it's safe to leave in place indefinitely (the scan is cheap and a no-op once nothing matches), but it should not be extended for anything other than actual id renames confirmed against source data.

**`CW_TAGS` is derived, not hand-maintained**, as of this session: `Object.keys(SAUCEPAN_TAGS).filter(id => SAUCEPAN_TAGS[id].c === "Content Warnings")`. Verified exactly equal to the previous hardcoded 21-tag list before the change. Any future CW tag addition to `SAUCEPAN_TAGS` needs no corresponding edit here.

## Babel Block Budget (session 32)

**Current: 456.4 KB babel / ~190 KB plain, ~44 KB headroom under the ~500 KB ceiling.** (439.3 KB after the session-32 reclaim; sessions 33–35 pushed it to 478.2 KB, then the session-35 HelpPage reclaim brought it back to 456.4 KB.)

**Session-35 reclaim: HelpPage (24.2 KB -> 1.9 KB).** By this point the two earlier levers were exhausted — an automated scan found **zero** movable declarations (every remaining top-level item genuinely uses JSX or hooks) and **zero** unreferenced components. Session 32 had already taken both. What was left was restructuring, and `HelpPage` was the obvious target: ~24 KB of static prose being parsed by Babel at every app start for no benefit.

The content now lives in `HELP_SECTIONS` in the plain-JS block, with `HelpPage` reduced to a renderer that walks it. Inline markers are `**bold**`, `` `code` ``, `_italic_`; item types are `p`, `tip`, `step`, `warn`, `note`. The two bespoke callouts became typed items rather than raw JSX so the data block stays pure data.

**The transform was scripted, not retyped**, then verified by word-multiset diff of the old JSX against the new data. Thirteen words came back unaccounted for and all were artefacts: JSX syntax tokens, and the intro line deliberately kept hardcoded in the renderer. Targeted probes confirmed the risky strings survived — `{{user}}`/`{{char}}` and `lorekeeper-data.preshrink-{date}.json`, where JSX brace escaping (`{'{{user}}'}`) could have silently eaten characters. **Do the text diff on any future content extraction; Help is a page where silent loss would not be noticed for months.**

Next lever if headroom tightens again: `ImageMigrationPanel` (17.2 KB) is the largest remaining candidate, but it is live UI rendered on two pages and still does ongoing rescanning, so it cannot simply be deleted.

The ceiling is real and its failure mode is silent — past ~500 KB Babel deoptimises and click handlers stop working app-wide with no console error (session 23). Two things bought the room back:

**1. Babel only needs to see JSX.** Any top-level declaration with no JSX and no hooks can live in the plain `<script type="text/javascript">` block, which is not just for data arrays — pure helper *functions* belong there too. 77 declarations (34.1 KB) moved in session 32: `callAI`, `CS`, `applyMerge`, `planMerge`, `generateTheme`, `renderMd`, `parseTimestamp`, the theme/colour helpers, the rework helpers, and the remaining data constants.

Cross-block references work in both directions because classic scripts share one global lexical environment, and every call happens during render, after both blocks have evaluated. The one hard constraint: **a moved `const` initialiser must not reference anything left in the Babel block**, since the plain block evaluates first. Verify this before moving, not after.

**2. Dead components.** 20.1 KB of never-rendered code was still being transpiled: `LoreboookEditor` (superseded session 11), `CollEditPanel` (session 12), `BackupRestorePanel` (session 25), `SchedulePage`. Two of them contained free `setModal` references that would have thrown `ReferenceError` had they ever been mounted — a latent bug hidden by the fact that they were unreachable.

**Verification procedure — do not skip.** Session 26 removed 9 arrays from Babel and silently failed to append them to the plain block; they had to be recovered from the test environment. Any future extraction must be checked by parsing both blocks and diffing the *set* of top-level declaration names before and after. Name-set equality is the check, not byte counts and not `useState` counts — removing dead components legitimately lowers the raw `useState` count (5, in session 32) while every unique state name survives, so compare unique names.

**Next levers if headroom is needed again:** 1068 inline `style={{...}}` objects remain, 77.1 KB total, densest in `CharDetailPage` (7.2 KB), `BatchImportPage` (5.8 KB), `SettingsPage` (5.3 KB), `DashboardPage` (5.2 KB). The session-28 sweep only covered CharDetailPage/LorebookEntryTab/LoreItemRestoreCard. Do **not** reach for stripping comments (16.2 KB) or indentation (48.9 KB) — the file is hand-edited and manually deployed, so readability is worth more than the bytes.

---

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
- **Colorblind mode** is still a separate placeholder, unbuilt — distinct from this feature (theme = accent color choice; colorblind mode = remapping specific hues like red/green that look identical to certain colorblindness types, which would need either its own palette adjustments or CSS filters, not yet designed)
- No "save multiple custom themes" / theme gallery — only one active theme at a time, overwritten each time Apply is clicked
- Generated themes aren't currently exported/backed up anywhere beyond living in `data.settings.theme` inside the main data file (same backup coverage as any other setting — fine for global/per-world backups since those copy `data` wholesale, but worth knowing if a dedicated settings-export feature is ever built)

---

## CSS Gotchas (hard-won, do not relitigate)
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

> **Layers 1–5 protect against software failure only.** Every one of them writes to the same disk as the data it protects, so none of them survive losing the drive. That is what Git Backup Sync (session 35) is for — see its own section. The two are complementary and neither replaces the other.

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
Saucepan exports timestamps like `"2026-06-18 03:01:00.455294 +00:00:00"`, which native `Date()` cannot parse (silently returns `NaN`). This broke every "local newer" comparison in batch import for any item that had ever been touched by a site export. A `parseTimestamp()` helper near the top of `index.html` normalizes the format (space→T, truncate microseconds, fix the `+00:00:00`→`+00:00` offset) before handing off to `Date()`. All `pts`/`parseTs` local helpers throughout the file now alias to this single function — do not reintroduce inline duplicate date parsers.

---

## Performance Notes
- `update(fn)` clones the entire `data` tree before mutating (so React detects the change and undo-safety is preserved). This used `JSON.parse(JSON.stringify(d))` originally, which was slow enough to cause visible lag while typing (e.g. in the Notes textarea) once the character count grew past ~40. Switched to `structuredClone(d)` — same semantics, meaningfully faster, no string round-trip.
- `saveData` in `main.js` switched from `fs.writeFileSync` (synchronous, blocks the main process) with pretty-printed JSON to `fs.promises.writeFile` (async) with compact JSON (no `null, 2`).
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

`package.json` at the repo root (alongside `src/`) with an `electron-builder` NSIS config.

```
npm install
npm run build      ->  dist/Lorekeeper Setup 1.1.0.exe
```

- `allowToChangeInstallationDirectory: true` — the user picks the install folder, and **data lives next to the exe**, so app and data end up on the same drive. This was a deliberate choice over `Documents\Lorekeeper`: a system-drive default gets wiped on a reformat.
- `DATA_DIR` is dynamic: `app.isPackaged ? path.dirname(process.execPath) : 'I:\\Lorekeeper'`.
- **Use `process.execPath`, not `app.getPath('exe')`.** `app.getPath` cannot be called before the app is ready; calling it at module scope to set `DATA_DIR` kills the process before any window opens, with no error and nothing in Task Manager.
- On startup main creates all eight standard folders if missing: root, Companions, Lorebooks, Collections, Worlds, Personas, Templates, Notes.
- Icons: `assets/icon.ico` (installer + shortcuts), `assets/icon.png` (window). Both already existed.
- `dist/` is gitignored; the installer ships as a **GitHub Release asset**, not committed to the repo.

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

## What's Next (Priority Order)

### A. Sync pull guard — BUILT (session 35)
`lorekeeper-sync.bat` is **push-only**. That is safe exactly as long as nothing else writes to the repo, and unsafe the moment something does.

The failure: a second device commits a change. Later the desktop closes, robocopies its own version over the backup folder, stages it and pushes. The push is rejected (remote ahead), a pull merges, and the working tree now holds the desktop's copy staged over the other device's. **The other device's edit survives in history but disappears from current state, with no warning.**

Implemented at the top of the script, before any mirroring:
- `git fetch`, then `git rev-list --count HEAD..origin/main`
- If the remote is ahead, **abort with a loud error** and touch nothing — no automatic merge
- If the remote is unreachable, warn and continue (committing locally and pushing later is safe)

**`setlocal EnableDelayedExpansion` is required** and is the trap here: `!BEHIND!` is read inside the same parenthesised block where it is set, and `%BEHIND%` would expand at parse time to its pre-loop value. A naive version of this check silently never fires — which looks identical to a working guard. Tested both paths: normal sync, and a deliberate remote-ahead commit made through GitHub's web editor.

---

### B. Mobile companion app (design agreed session 35, nothing built)

**The actual need:** the office machine restricts AI tooling, so there is no usable environment there. The phone is the only option for editing on the go — creating and editing characters, intros and lorebooks, plus notes.

**Scope decisions already made:**
- **No Saucepan import/export from the phone.** Editing and creating only. This removes the worst risk on the table: the phone would otherwise need its own copy of the export strip list, and the two would drift silently until an import was rejected months later. Export stays a desktop action where the rules already live.
- **Sideloaded APK.** No Play Store. Rebuild and reinstall by hand; fine for one user.
- **Per-item files, not the main JSON.** The phone never reads `lorekeeper-data.pretty.json` (21 MB and desktop-authoritative). It works with individual item files, kilobytes each.
- **Never used concurrently.** Realistic worst case is forgetting to close one app, not genuine simultaneous editing. This is what makes the whole design tractable.
- **Storage is not a constraint** (~160 GB free on device). Sparse-checkout is available if wanted but not required — images are already excluded from the repo, so the whole corpus is ~16 MB.

**Conflict handling:** given non-concurrent use, conflicts are rare and do not need automatic merging. Present both versions with timestamps and let the user pick one and discard the other. Explicit choice, never silent resolution.

**Babel is not a constraint here — and this is worth understanding.** The 500 KB ceiling exists because `index.html` compiles JSX *in the browser at runtime* via Babel standalone. A mobile app would use a normal build step (Vite or similar) that compiles ahead of time, so there is no standalone parser, no runtime compile cost and no budget. The corollary: **do not reuse `index.html` as-is inside a WebView.** Runtime Babel on a phone CPU would be markedly slower than on desktop. Build the mobile app properly with a bundler; reuse React *components* if useful, not the single-file runtime-compiled architecture.

Capacitor is the sensible wrapper if components are being reused.

**Build the prototype against the git repo without touching Lorekeeper.** The desktop app works and should not be destabilised for an experiment. The repo is already a complete, readable text corpus, so a mobile client can be developed and tested end to end against it with **zero changes to `main.js` or `index.html`**. Only the pull guard (item A) is needed on the desktop side, and that is in the script, not the app.

**Open questions, deliberately unresolved:**
1. Per-item files do not currently carry world membership, collections or linked lorebooks — `saveCompanionJson` strips them. A character viewed on the phone would appear context-free. Either write a `local.json` sidecar per item holding exactly the stripped fields (keeps `companion.json` Saucepan-clean, gives those fields an independent backup they currently lack), or accept the missing context on mobile.
2. **Lorekeeper has no import path.** Every file in the repo is written *out* of the app; nothing reads them back. Until desktop-side ingest exists, a phone edit sits in the repo looking applied while the app never sees it. This is the real work, and it is larger than the mobile app itself.
3. Deletions: an absent file is ambiguous between "deleted" and "not yet created". Trust git's diff rather than folder state, or use tombstones.

**Suggested order** (value per unit of effort): notes first — `Notes\{World}.md` is already complete and self-contained, needs no schema work, and covers the loss that started session 35. Then lorebooks (self-contained entry text, no image dependency). Characters last, since the lossy-export problem lands hardest there.

---

~~### 0. Babel headroom~~ ✓ **done session 32** — 493.5 KB -> **439.3 KB**, ~61 KB headroom. See "Babel Block Budget" below.

~~### 0b. Image Prompt Generator sends content-warning tags~~ ✓ **done session 32**
CW tags plus a new `IMG_SKIP_TAGS` set (POV/format/genre metadata) are now stripped before building the prompt — `dead_dove, violence, male, any_pov, male_pov, jock, athlete` becomes `male, jock, athlete`. Tags still export to Saucepan normally; this only affects what reaches the image model.

Two further fixes found while testing against local models:
- **The character's name is no longer sent at all.** Every model wrote it into the prompt verbatim. An image model cannot render "Jamal Ferret", so it is dead tokens at best, and a surname like Ferret actively biases the composition.
- **The no-character branch was sending the literal string `(character)` as a name.** Exaone took that at face value and invented a fully-specified character — silver hair, blue eyes, a library — and presented it as the answer. The branch now states plainly that no character was provided and asks for a generic prompt from style/mood/notes alone.
- Output is passed through `stripWrappingQuotes()`; all three local models wrapped the prompt in quotes despite being told not to.

### 0c. LM Studio model switching ✓ **done session 32**
The Model field is a dropdown of everything currently loaded in LM Studio, auto-populated on opening Settings with LM Studio selected (`/v1/models`). Loading several models in LM Studio means switching between them is one click, with no restart. Falls back to a text input when the server is unreachable so a saved model name is never lost, and warns when the saved model is not among those loaded.

~~1. CharDetailPage UI cleanup~~ ✓ **done session 28**

~~2. UI consistency check~~ ✓ **done session 28** — all pages verified, scenario drag cursor fixed

~~3. Design backup/restore flows~~ ✓ **decided session 28**

~~4. Build "Import from backup" (Option C)~~ ✓ **built + tested session 29**

~~5. Help page update~~ ✓ **done session 30** — all sections updated (11 tabs, image tools, Import/Export, Data Safety, drag-to-reorder tip, GitHub backup removed)

~~6. Packaged `.exe` / installer~~ ✓ **done session 31** — NSIS installer, data next to exe, see Windows Installer section

### Character completeness unified ✓ **done session 32**
The dashboard ran three separate definitions of "complete". **In progress** (`progressMissing`) checked 10 fields; **Rework** (`reworkChecks` over `REWORK_FIELDS`) checked 7; they overlapped on only 3. A draft could therefore display `✓ ready to post` while missing formatting instructions, example dialogue, advanced prompt and voice — the four fields only Rework looked at. Nothing gated the status dropdown either, so draft → ready was always allowed regardless.

Replaced with a single `CHAR_CHECKS` list of 14 `[label, predicate]` pairs in the plain JS block. `progressMissing`, `reworkChecks` and the new `charIsComplete` all derive from it, so the three panels can no longer drift apart. Setting status to ready or posted with anything missing now opens an `incomplete-status` modal listing the gaps, with an explicit "Set anyway" override rather than a hard block.

**Design note — resolved session 35, keep as is.** The union treats `advanced_prompt` and `voice_catalog_id` as required. Confirmed correct in practice: the advanced prompt can be overridden by the user on Saucepan anyway, and flagging the voice catalogue is precisely what stops it being forgotten. The previously-noted option of splitting `CHAR_CHECKS` into required and recommended groups is **not** wanted — do not implement it.

### Help page audit ✓ **done session 32**
Verified section by section against the code rather than read for plausibility. Nine corrections, most predating session 32:
- **Characters** claimed 11 tabs and documented 8. Full Description, Lorebooks and Collections were missing entirely.
- **Lorebooks** described an "Edit tab" and "Export tab". The actual tabs are Chapters / Settings / Export — the Edit tab has not existed since the chapters refactor.
- **Dashboard Today Banner** still described the old today-only behaviour and did not mention that mark-posted stamps the scheduled date.
- **Data Safety** said "three layers" and listed three. There are five (flush-on-close and the pre-shrink snapshot were undocumented, so nobody would know the snapshot files are safe to delete).
- **AI assistant** listed four providers, omitted LM Studio, and still claimed the Assistant always sends the full world — the context scope selector was undocumented.
- The API-key warning stated a key is required, with no exception noted for LM Studio.
- Cost estimate did not mention that local models are free per message.

**Lesson:** Help drifts silently because nothing links it to the code. Tab lists and layer counts are the parts that rot first, since they are stated as totals ("11 tabs", "three layers") that stay plausible after the underlying list changes. Check counts against the actual arrays.

### 7. Standalone / Public Version
Remaining for a shareable build: README, and a decision on whether to strip Saucepan-specific UI.

**Resolved session 31 — author IDs are not a blocker.** Concern was that exports would carry Ine's `author_id`. In practice: characters created in Lorekeeper default `author_id` to `''`, lorebooks and collections have no such field, and Saucepan sets authorship from the authenticated session on upload. Ine has been uploading Lorekeeper-created companions for months with no author field and they attribute correctly. So exports are already clean.

**Open question:** whether to strip Saucepan-specific fields (tags, platform export, image UUIDs, voice catalogue) for a general-purpose build, or leave them. Current lean is to leave them — the intended audience is Saucepan friends, for whom those fields are the point.

**Before shipping to other users — backup/restore model needs rethinking:**

Current behavior: full backup restore is a **total replace** (wipes everything, loads backup). This is safe for a solo user who knows their workflow, but for general users it's a footgun — someone takes a backup, creates new content, then restores and loses everything made since.

**Option C (built session 29):** "Import from backup" — a third path on the Import/Export page distinct from full Restore. Full merge strategy documented in What's Next section 4. In brief: content fields (worlds/characters/lorebooks/etc.) merge by `id` with `updated_at` as tiebreaker; `schedule_notes` merges by date key; `map_positions` and `release_cycle` merge intelligently; `notes` uses a safe append strategy; `settings` always stays local. Conflicts where `updated_at` is identical/missing prompt the user to choose Keep Local or Take Backup. Merge never deletes local-only items.

**Option D (long-term architectural direction):** Split `lorekeeper-data.json` into content file (mergeable) + workspace files (non-mergeable, stored separately — e.g. `settings.json`, `Notes/world_id.md`, `Maps/world_id.json`). Full restore then only touches content by definition. Already partially done — per-world `.md` notes are already external. Real cost: every IPC read/write touches multiple files, data safety system needs rethinking, backup ZIPs get more complex, existing installs need migration. Worth doing properly rather than rushing.

For now: the UI already warns clearly that full restore replaces all data. Keep Option C and D noted here for the standalone build.

~~### Import/Export — remaining gaps to verify~~ ✓ **done session 32**
- **`importJSON` full-backup footgun fixed.** `if(json.worlds !== undefined) { setData(json); return; }` replaced the entire dataset with no prompt and no undo, bypassing `update()` so it went straight to state and autosaved. Now routed through a `confirm-full-restore` modal that shows the file's contents (worlds/characters/lorebooks/collections counts) against the current data's, marks the action destructive, and points at Import & merge from backup as the non-destructive path.
- **Export path parity verified — one real discrepancy found and fixed.** Strip lists were diffed mechanically across all three content types. Characters matched. Lorebooks and collections did not: the world ZIP stripped `site_last_synced_at` but the individual `exportLore`/`exportColl` paths did not, leaking an app-only sync marker into files uploaded to Saucepan. Individual paths now match the ZIP.

### Won't do
- Per-world color theming
- Age calculator in tools
- Text stats in tools
- Schedule page (replaced by dashboard calendar)
- Relationship dynamic generator
- Map generator

### Very long term
- Android build — **superseded, see What's Next section B**, where the design was worked through in session 35 (sideloaded APK, no Saucepan export from the phone, per-item files, pick-a-copy conflict handling). Kept here only as a pointer so this heading is not mistaken for the live plan.

---

## GitHub

### Repository
**There are two private repos and they hold opposite things. Do not confuse them.**

| | `lorekeeper` (source) | `lorekeeper-data` (backup) |
|---|---|---|
| Created | June 2026 | Session 35 |
| Working tree | `I:\Lorekeeper` | `I:\LorekeeperBackup` |
| Tracks | source files and documentation | notes, templates, personas, companions, lorebooks, collections, the pretty data file, ComfyUI and LM Studio configs |
| Excludes | **all personal data** | **all images, model weights and credentials** |
| Committed | manually at session end | automatically on app close, plus the Sync now button |

The two `.gitignore` files are close to **inverses of each other**. The source repo excludes `Companions/`, `Notes/`, `Templates/` and so on as personal data; in the data repo those folders are the entire point. Copying the source `.gitignore` into the data repo produces a repo that faithfully syncs nothing — this was nearly done during session 35 setup. The `.gitignore` listed below is the **source repo's**; see Git Backup Sync for the other.

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
node_modules/
dist/
```
*(Verified against the real file, session 35c.)*

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

| # | Date | Summary |
|---|---|---|
| 1 | Jun 17 | Core app: worlds/characters/lorebooks/collections/personas, auto-save to disk, image relpath system, batch import with badges, dashboard, character templates, backup/restore, basic tools, markdown preview, drag-reorder, sidebar collapse, quick find |
| 2 | Jun 18 | Collections top-level page, TagSelector (659 tags + 21 CW), tag templates, world tag suggestions, personality/plot/nationality/color/diff tools, site checklist, custom HSL color picker |
| 3 | Jun 18 | Claude integration, lorebook entry templates, help page (13 sections), Settings page, auto-fill folder/filename on creation |
| 4 | Jun 18 | Fixed all Babel syntax errors; extracted ScanBadge/ScanTagChips; batch import tag chips |
| 5 | Jun 18 | Sidebar Export -> Backup; world topbar Export ZIP (platform-ready stripped JSONs); `exportPlatformZip` IPC handler |
| 6 | Jun 18 | Export to Markdown for characters/lorebooks/collections (CharExportTab, LoreExportPanel, CollExportPanel); Edit/Export tab bars |
| 7 | Jun 19 | Persona + Template Export MD buttons |
| 8 | Jun 19 | EsperTool, HockeyTool, SwimTool added to Tools panel |
| 9 | Jun 19 | WesternZodiacTool, ChineseZodiacTool; RelationshipsPage (SVG map, draggable nodes, labeled edges) added to right panel Map tab |
| 10 | Jun 19 | Relationship map fixes: collection-aware character filter, draggable edit popup, correct Tabler 2.44 icons, esper ranks changed to F-S letters |
| 11 | Jun 19 | LorePage full-page (replaces inline LoreboookEditor): char-detail layout with Chapters/Settings/Export tabs; world lorebooks tab -> card grid; `openLore`/`openChar` navigation helpers |
| 12 | Jun 19 | CollPage full-page (replaces inline collection detail): char-detail layout with Edit/Export tabs; world collections tab -> card grid; `openColl` helper; navigation pattern now unified across all four content types |
| 13 | Jun 19 | UI consistency pass: TemplatesPage/TemplateEditor CSS classes, PersonaDetailPage tab bar chrome, World Info tab CSS classes, portrait cards bumped to 200px, world/collection banners aligned to 80px, filter buttons cleaned of emoji+counts |
| 14 | Jun 19 | Settings and World Info tabs made full-width (removed max-width caps); font size fix — now applied globally via App-level effect setting `document.documentElement.style.fontSize` directly (previous version set an unused CSS variable); Notes field added to World Info tab |
| 15 | Jun 19 | Performance fix for Notes/text-field lag: `update()` switched from `JSON.parse(JSON.stringify())` to `structuredClone()`; `main.js` `saveData` switched from sync to async write with compact (non-pretty-printed) JSON; spec fully reviewed and cleaned up — removed duplicate/out-of-order entries, added Relationship Map section, added Babel Gotchas reference section, added Performance Notes section |
| 16 | Jun 19 | **Data-loss incident and recovery.** A race condition (autosave firing before initial load resolved) overwrote the real 30MB+ data file with the empty default shape. Recovered characters via independent Companions/Lorebooks/Collections auto-save files; notes and app-only fields (schedule status etc.) were not recoverable. Built three-layer data safety architecture: (1) `dataLoaded` guard blocks autosave until load completes, (2) `main.js` shrink-refuse check rejects any write under 50% of the existing file's size and redirects it to a `.SUSPICIOUS.json` file instead, (3) rolling `lastgood.json` backup on every successful write. Added independent standalone `.md` notes backup per world + global scratchpad (`Notes\` folder), wired from both the right-panel Notes tab and World Info tab, with a "Notes Backups" panel on Batch Import. Also fixed a separate pre-existing bug surfaced during this incident: the inline Site Checklist IIFE inside `DashboardPage` called `useState` after a conditional early-return, violating React's Rules of Hooks and crashing the Dashboard whenever the checklist's item count changed between zero and nonzero — extracted to its own `SiteChecklistPanel` component. Fixed Site Checklist to also flag posted/public items that have never been synced (previously required `site_last_synced_at` to already exist, so never-synced items could never be flagged no matter how many edits). Fixed Schedule tab's status dropdown to auto-stamp `posted_dates` when set to Posted (previously only the Dashboard banner button did this). Discovered and fixed `parseTimestamp()` bug: Saucepan's timestamp format is unparseable by native `Date()`, silently breaking every "local newer" comparison involving a site-imported timestamp. Fixed batch import to preserve the platform image UUID from site exports (was being discarded in favor of local file paths), derive `posted_dates` from the site's `posted_at`/`updated_at` instead of leaving it empty, and use the site's real `updated_at` instead of overwriting it with import time. Added force-import overrides (per-item "Import anyway" button + global "Force import all" toggle) for restoring from a Saucepan companion backup export. Re-fixed four UI width regressions that had silently reverted across project re-uploads (Settings, World Info, Template editor, Persona "New" button) — root cause identified as chat-session fixes not yet being re-synced to project knowledge between turns. |
| 17 | Jun 19 | Fixed dead "add in Settings" link in the Claude panel's no-API-key nudge (was a no-op `onClick={()=>{}}` stub; threaded `setPage` through `RightPanel` -> `ClaudePanel`). Fixed `export-file` IPC handler in `main.js`, which was hardcoded to always show a "JSON" filter in the save dialog regardless of the actual file being exported — affected every Export MD button in the app (characters, lorebooks, collections, personas, templates); now picks the filter from the file's real extension and defaults the save dialog to `I:\Lorekeeper\`. Updated `.gitignore` to include the new `Templates\` and `Notes\` auto-save folders and the safety-net backup files. Rewrote the GitHub section of this spec with an explicit, repeatable, verified command sequence (status check -> explicit `git add` of named files, never `git add .` -> commit -> push -> status verify -> optional tag), plus a "how to tell if project knowledge is stale" troubleshooting note, directly in response to the repeated-regression problem from session 16. |
| 18 | Jun 19 | **Export field-accuracy pass, found by diffing real Lorekeeper-vs-Saucepan exports of the same items.** Fixed `exportChar`'s incomplete strip list (was missing `posted_dates`/`companion_folder`/`site_last_synced_at`/`lorebook_entry_text`/`lorebook_entry_title`/`voice_catalog_id` — only `exportWorldPlatformZip` had the complete list). Fixed `exportColl`'s field-name bug: Lorekeeper's `definition` field was never renamed to the platform's `description` field, meaning every collection export before this fix had no description on the site's side. Fixed `exportLore`'s stale `collaboration_type`: now derived fresh from `access_level` at export time instead of passed through a potentially-contradictory stored value. Added export warnings to `exportLore` (missing image UUID, no tags, Open definition protection) matching the existing character warning pattern, which lorebooks never had before. Fixed Site Checklist to catch brand-new public lorebooks/collections that have never been synced (previously gated on `has_been_public`, which only becomes true *after* a first successful export, creating a chicken-and-egg gap for first-time exports). Added an app-only `status` field (Draft/Ready) for lorebooks, shown in Quick Info and excluded from export, to give new lorebooks a way to signal "still in progress" since `access_level` only distinguishes private/public. Added drag-and-drop chapter reordering to `LoreChaptersTab` (was click-to-select only). Fixed the lorebook MD export Preview button, which had been silently broken since session 11: `LorePage` was passing a hardcoded `loreMdPreview={false}` and a no-op `setLoreMdPreview={()=>{}}` into `LoreExportPanel` instead of real state, so clicking Preview updated nothing. Added a "Last updated" row to the character Quick Info sidebar. Added a shared `WorldFilterDropdown` component and migrated Characters/Lorebooks/Collections/Templates list pages to use it instead of one-button-per-world inline rows, which would have broken visually as the world count grows; Characters also got a matching funnel-style status filter dropdown (Draft/Ready/Posted). |
| 19 | Jun 20 | **Integrity check session — found genuine new bugs, not sync regressions.** Fixed the top-level Characters nav page bypassing `openChar` entirely (raw `setSelectedChar(c)=>{...}` call that never set `selectedWorld`, causing the right-panel Notes tab to show the wrong/global notes when opening a character from that specific page — see Navigation helpers note). Fixed the sidebar `height:100vh` fix from session 18 silently breaking again at any font size other than "Normal," because `vh` doesn't reliably co-scale with the `zoom`-based font feature — switched to `height:100%` (see new CSS Gotchas section). Fixed a completely missing required `anthropic-version` header on every Claude API call — every request failed regardless of API key validity, easy to misdiagnose as a key problem. Fixed the sidebar collapse/expand button becoming unreachable (zero remaining width at 52px collapsed) by stacking logo + toggle vertically when collapsed instead of horizontally. Renamed "Batch Import" to "Import/Export," removed the sidebar footer entirely (was contributing to the header-scroll bug) and moved its Import/Backup buttons into a new "Quick Import / Backup" card at the top of that page. Added editable Image ID (UUID) fields for lorebooks (was read-only and only rendered if a UUID already existed — impossible to ever set one) and collections (had no field at all, anywhere). Fixed lorebook_templates being silently dropped from per-world backups (flat top-level array, missing from the per-world backup's custom export object) on both the export and restore sides. Fixed `.export-panel`'s leftover `max-width:600px` making the Export tab look half-width on Characters/Lorebooks/Collections. Added a topbar visual separator between page-action buttons and the Notes panel toggle (Delete was sitting flush against it). Cleaned up the Plot tool: world dropdown now only lists worlds with custom archetypes set up, and removed `WorldPlotEditor`'s always-visible full-archetype-list clutter under the roll buttons. |
| 20 | Jun 20 | **Theme System.** Built `generateTheme(accentHex)` + `applyTheme(themeVars)`, deriving a full dark+light theme pair from one accent color by reusing the existing `hexToHsl`/`hslToHex` color utilities (same math the Color tool already used for harmony palettes). Feasible specifically because — unlike font-size — the app's color system already runs through ~11 consistent CSS custom properties, so swapping them at the root genuinely re-themes everything with no per-component rewrite. Built `ThemeGenerator` UI component in Settings → Appearance: accent hex input, Dark/Light toggle, live mock preview panel before committing, Apply (disabled when preview matches saved state) and Reset to default. Added an App-level `useEffect` (same pattern as the font-size `zoom` effect) that applies the saved theme from `data.settings.theme` on load and whenever it changes, so it persists across restarts. Added `theme` to the Settings data model. Updated What's Next to mark "Global themes" done, distinguishing it from the still-unbuilt Colorblind mode (a related but separate problem — hue remapping for specific colorblindness types, not accent-color choice). |
| 21 | Jun 22 | **Lorebook/collection backup-restore panels; portrait profile_pic sync; collection character navigation fix.** Added `LoreItemRestoreCard` component to lorebook Export tab and `CollItemRestoreCard` to collection Export tab — paste-area + drag-drop JSON zone + validation + Restore Data button. Validation is deliberately minimal: lorebooks only check `name` (string) and `content` (array); collections only check `name` (string). `selected_chapter_index` is never validated in restore (Saucepan's import validator requires it, but older backup exports may not include it — see session 22b for the full correction; restore just ignores its presence or absence). `lorebooks` is never validated on collections (collections have `companions`, not `lorebooks` — a wrong field check in a previous implementation was the root cause of the "lorebooks: Invalid input: expected array" error). Restore merges platform fields only; preserves `world_id`, `lorebook_filename`/`collection_filename`, `selected_chapter_index`, `image_relpath`, and all other app-only data. Added bidirectional UUID sync between the sidebar "Profile Pic / Portrait 1 ID" field and the portrait slot named exactly `profile_pic`: typing in either writes to both `charData.image.id` and `portrait.image.id`. Sync is name-based (`p.name === 'profile_pic'`), not position-based. Portrait display shows each slot's own stored UUID with no override — `profile_pic` displays `p.image.id`, not `charData.image.id` (overriding the display with `charData.image.id` caused a visible bug where a different portrait that happened to be at index 0 would show the wrong UUID). This means if existing data has `charData.image.id` inconsistent with `profile_pic.image.id` (due to the old position-0 sync that contaminated index-0 portrait UUIDs in earlier sessions), the user sees the real stored values and can fix them via a site re-import (Update from JSON). Fixed `CollSettingsTab` causing a full-app crash: it referenced `openChar` as a free variable (not a prop), causing a `ReferenceError` the moment any collection was opened — `openChar` is defined in App scope, not in `CollSettingsTab`'s component scope. Fixed by threading `openChar` through `CollPage` → `CollSettingsTab` → `CollectionCharPicker`. Previously `CollectionCharPicker` in both `CollPage` and `CollSettingsTab` was hardcoded to `setSelectedChar={()=>{}}` (no-op), so clicking a character in a collection's member list did nothing. Now navigates via `openChar`. Also fixed a Babel crash (`function(){}` inside a JSX attribute causes the parser to fail for the entire file); replaced with a direct prop reference. |
| 22 | Jun 23 | **Lorebook/collection backup-restore validation fix; portrait profile_pic sync (name-based); collection character navigation; data safety improvements; portrait import overhaul; release cycle fix.** Validation errors fixed: `validateLore` checks only `name`+`content`, never `selected_chapter_index`; `validateColl` checks only `name`, never `lorebooks`. Both `LoreItemRestoreCard` and `CollItemRestoreCard` use minimal correct validators. Portrait profile_pic sync is now name-based (`p.name === 'profile_pic'`), not position-based — sidebar ↔ profile_pic portrait are bidirectional on edit; display shows stored UUID, no overrides. Position-based sync (portraits[0] ↔ image.id) removed entirely after it contaminated portrait UUIDs. `CollPage` and `CollSettingsTab` now receive `openChar` as a prop (was referencing it as a free variable → ReferenceError crash). `CollectionCharPicker` now navigates to characters. `function(){}` in JSX attributes crashes Babel; replaced with arrow function. Data safety: `load-data` now auto-recovers from lastgood if data.json < 50% of lastgood size; `save-data` checks against lastgood size too (closes hole where data.json was already cleared before the write); new IPC `restore-lastgood` + `get-lastgood-info`; UI shows lastgood date/size with one-click restore button; amber banner if auto-recovery happened on startup. Portrait import (batch): replaced broken index-based forEach (caused all images to be assigned to wrong portrait slots) with two-pass name-based matching: Pass 1 exact normalized name match (`normName` collapses spaces/underscores/parens), Pass 2 pushes unmatched files as extras. `profile_pic` portrait auto-gets description "Profile picture" on import. `image.relPath` is set from `profile_pic` portrait relPath on import so character cards show images without manual Set Portrait. On startup, portrait link repair migration runs automatically: re-matches relPaths by normalized name, removes no-UUID spurious duplicates, fixes `image.relPath`. `profile_pic` description and `image.id` are also auto-filled via `useEffect` when a character is opened. Gallery portrait picker added to sidebar: grid icon next to Set Portrait shows portrait thumbnails to pick sidebar image from. `getNextCycleWorld` fix: when a world has no future scheduled chars, check `posted_dates` for recent posts (within 7 days); if recently posted, skip and continue to next world. Previously, a world that just posted would immediately show as "needs scheduling" since its scheduled date had passed. |
| 22b | Jun 23 | **`selected_chapter_index` correction — not app-only, required by Saucepan on import.** The spec previously stated `selected_chapter_index` is app-only and must be stripped from platform exports. This was wrong: the Baccarat lorebook exported from Saucepan includes `selected_chapter_index: 0`, and Saucepan's import validation requires it. It was removed from all three export paths in session 21/22; this caused Saucepan to reject lorebook imports with "selected_chapter_index: Invalid input: expected number, received undefined". Fixed: `selected_chapter_index: l.selected_chapter_index \|\| 0` is now included in `exportLore`, `LoreItemRestoreCard.handleLoreBackup`, and the batch/world ZIP export path. The `validateLore` restore validator correctly does NOT require it (for backward compat with old exports), but the export always includes it. The export strip list in `exportChar` is unaffected — `selected_chapter_index` only exists on lorebooks, not characters. |
| 22c | Jun 23 | **`lorebooks` field correction — required by Saucepan on collection import.** Same pattern as `selected_chapter_index` for lorebooks: Saucepan's collection import validator requires a `lorebooks` field (array). Lorekeeper's collection data model uses `companions` for character IDs; `lorebooks` is a separate platform field (lorebooks directly attached to a collection, as opposed to lorebooks from companions). The export was silently omitting it, causing Saucepan to reject collection imports with "lorebooks: Invalid input: expected array, received undefined". Fixed: `lorebooks: c.lorebooks || []` added to all three collection export paths — `exportColl`, `CollItemRestoreCard.handleCollBackup`, and the world ZIP export path. For collections that don't have a `lorebooks` field stored in Lorekeeper, this defaults to `[]`. **General lesson documented:** Saucepan's import validator requires fields that Lorekeeper's internal model doesn't always store. Both `selected_chapter_index` (lorebooks) and `lorebooks` (collections) must always be included in exports, defaulting to safe empty values. The export strip logic should default-include required platform fields rather than silently omitting them. |
| 22d | Jun 23 | **Sidebar polish and FOUC fix.** Sidebar icon alignment in collapsed state: `.sidebar.collapsed .nav-item` and `.sidebar.collapsed .world-item` now have `justify-content: center; padding: 8px 0` so all icons are centered in the 52px strip. Collapse/expand button placed side by side with logo in collapsed state (was stacking vertically). The `collapse-btn` CSS now has `display: flex; align-items: center; justify-content: center; line-height: 1` to control its own height. Dedicated `.sidebar.collapsed .sidebar-header` CSS rule: `padding: 0; justify-content: center; gap: 4px`. Sidebar header fixed height: `height: 56px; padding: 0 12px` on base `.sidebar-header` so expanded and collapsed states have identical header heights — previously `padding: 16px 12px 12px` in expanded vs `height: 52px` in collapsed created a visible 4px jump. "Navigate" and "Worlds" section labels are now always in DOM (not conditionally rendered) with `.sidebar.collapsed .nav-section { visibility: hidden }` — previously their removal caused nav items to shift vertically when toggling. FOUC fix: `body { opacity: 0 }` initially; `useEffect` adds `body.app-ready` class (triggering `opacity: 1; transition: opacity 0.15s ease`) after `dataLoaded` is true — prevents the flash of default browser styles during Babel transpilation. `<html>` tag gets `style="background:#0f0e13;color:#f2f0ff;"` so the native window background is correct before any CSS applies (Electron `backgroundColor: '#0f0e13'` was already set on BrowserWindow). |
| 23 | Jun 24 | **Portrait multi-add; image display from top; view full image lightbox; export relPath fix; Babel 500KB fix; lorebook world ordering.** `import-images` IPC now accepts `{ defaultPath }` opts — file dialog opens directly in the character's `Companions\Name\` folder. Each selected image is copied to the companion folder via `copyImageToFolder` and stored as `relPath` (not base64 in JSON), keeping the data file lean. `object-position: top` added to all portrait/card image CSS rules (`.char-portrait img`, `.char-portrait-lg img`, `.gallery-item img`, portrait grid inline styles) so heads are no longer cropped. `LightboxModal` component added: `position: fixed` overlay, `ResolvedImg` (handles relPath via IPC like all other app images), Escape key close, × button. Rendered at App-component level (not inside CharDetailPage/WorldDetailPage) to avoid stacking-context clipping. `setLightboxSrc` threaded down as a prop to `CharDetailPage` (zoom button in portrait card control row) and `WorldDetailPage` (`onViewFull` prop on `GalleryItem`). `ImgFromPath` accepts `onClick` prop. `exportChar` now strips `relPath` from portrait objects (was only stripping `data`; `relPath` is app-local and must not reach Saucepan). **Babel 500KB fix:** file was 508KB, causing the "code generator has deoptimised the styling" error that silently broke click handlers app-wide; fixed by extracting 6 pure-data arrays (LITERARY_ARCHETYPES, NATIONALITIES, MBTI_TYPES, JUNGIAN_ARCHETYPES, ATTACHMENT_STYLES, GLOBAL_PLOT_ARCHETYPES — no JSX, no hooks) into a `<script type="text/javascript">` block before the Babel block; Babel script reduced 508 → 482KB. **Linked lorebooks world ordering:** character's own world now appears first in the lorebook picker, then other worlds alphabetically, "No World" last; world emoji shown in section headers. Pill labels unchanged (lorebook name · world name). |
| 24 | Jun 24 | **Plot archetype fix; relationship map world-switch + position persistence; colorblind mode.** Plot archetype tool: `lastRoll` state tracks which roll button was last clicked; `primary` class applied only to that button instead of always highlighting Roll (any). Relationship map: (1) world-switch bug — `initialWorld` prop was ignored after mount; added `useEffect` to sync it to `worldId` so switching worlds in the sidebar now updates the map immediately. (2) position persistence — `posRef` mirrors positions state (avoids stale closure); `onSvgMouseUp` writes `data.map_positions[worldId]` with all current positions; init `useEffect` loads saved positions first, falling back to auto-grid only for new characters; `map_positions:{}` added to `initData()`. Colorblind mode: Settings → Appearance replaces ComingSoon placeholder with three-button picker (Off / Red-Green / Blue-Yellow); App-level `useEffect` adds/removes `html.cb-rg` or `html.cb-by` CSS class; Red-Green overrides `--red:#fb923c` and `--green:#60a5fa`; Blue-Yellow overrides `--amber:#f87171`, `--teal:#e879a9`, `--green:#60a5fa`; help page note updated. |
| 25 | Jun 24 | **Import/Export page reorganisation; character tab reduction.** Import/Export page ("Batch Import") rebuilt into three side-by-side cards — **Backup** (export full ZIP + per-world dropdown+button, replacing individual per-world buttons that would overflow with many worlds), **Restore** (from backup ZIP with explicit note that full backup replaces all / world backup merges; from last-good auto-save), **Import** (single item JSON + batch scan + how-it-works). Duplicate "Backup everything" button removed (was identical to "Export full backup"). All action buttons now use standard `btn` style (no `primary` colouring). Backup/restore state inlined from old `BackupRestorePanel` component which is no longer rendered. Character detail page tab count reduced from 13 to 11: **Example Dialogue** tab removed — textarea moved into Formatting tab below Advanced Prompt. **Export** tab removed — `CharExportTab` (Update from JSON / Export JSON / Export Markdown) moved into Settings tab above Delete Character button. |
| 26 | Jun 24 | **Image tools (Format Converter, Paste & Save, Crop); data array recovery; Babel size management.** Added three image tools to the right panel Tools section. Format Converter: load any image → select output format (JPEG/PNG/WebP) + quality slider → convert via canvas `toBlob()` → save via new `save-image` IPC (binary save with dialog). Paste & Save: paste from clipboard via `paste-image` IPC (`clipboard.readImage()` in main process) or drag-and-drop → preview with dimensions → set filename → save as PNG. Crop: interactive canvas crop with corner handles, aspect ratio presets (1:1/3:4/16:9/4:1/Free), rule-of-thirds grid; `applyCrop` loads a fresh clean `Image()` from stored `imgSrc` base64 to avoid drawing the overlay; all style objects inside `&&` conditionals pre-defined as variables (Babel deoptimisation fix). Added `save-image` IPC to main.js + `saveImage` to preload.js; added `clipboard` to electron imports + `paste-image` IPC. Data array recovery: extraction script bug caused 9 arrays (SAUCEPAN_TAGS 61KB, PLOT_DESCRIPTIONS, WESTERN_SIGNS, CHINESE_SIGNS, HOCKEY_POSITIONS, SWIM_EVENTS, MACROS, NAMES_MASC, NAMES_FEM) to be removed from Babel but silently fail to append to the plain JS block — recovered from test environment file. Fixed two comment+const merge bugs (HOCKEY_HANDEDNESS, SWIM_ROLES) left by extraction. Plain JS block now 110KB (15 arrays total); Babel block 425KB. |
| 27 | Jun 24 | **Image Prompt Generator; map generator cancelled.** Added `ImagePromptTool` to right panel Tools section (Img Prompt pill). Receives `currentChar` prop threaded from App → RightPanel → ToolsPanel → tool. Shows current character name/description auto-populated; art style dropdown (10 options); mood/lighting dropdown (8 options); optional extra notes textarea. Calls `claude-sonnet-4-6` via Anthropic API; builds prompt as `parts.join(nl)` array to avoid multiline JS string literals (Babel restriction). Copy button with 2-second confirmation flash. Map generator removed from What's Next → Won't do (design too open-ended). |
| 28 | Jun 24 | **CharDetailPage inline style cleanup.** All 49 Babel-risky inline styles (inside `&&`/ternary JSX) eliminated from CharDetailPage, LorebookEntryTab, and LoreItemRestoreCard. Added 57 CSS utility classes (`.cd-col12`, `.cd-portrait-card`, `.cd-lorebook-row.linked`, `.cd-flag-label`, `.cd-restore-drop`, etc.) to the style block. Added `CS` pre-defined style object (32 entries) before CharDetailPage for complex one-off styles. Tab bar, portrait grid, lorebook linked state, flags checkboxes, scenario drag handles, settings/schedule tab wrappers, banner preview, gallery picker — all now use CSS classes. LorebookEntryTab and LoreItemRestoreCard cleaned to use `CS.*` references and new classes. 117 remaining inline styles in component are in always-rendered JSX (no Babel risk). Babel: 430KB. |
| 29 | Jun 26 | **Import from backup (merge); delete confirmations; CS object restore; bug fixes.** Built `planMerge` + `applyMerge` + `MergePreviewModal` — the full "Import & merge from backup" flow on the Import/Export page. Preview modal shows adds/updates/conflicts before committing; per-item Keep Local / Take Backup for conflicts; workspace fields merged silently. Removed destructive "Restore from backup zip" — merge is now the primary restore path; lastgood restore remains for emergencies. Fixed `bt.getTime is not a function` in `planMerge` (`parseTimestamp` returns a number, not a Date). Fixed `world is not defined` in `main.js` `exportBackup` — `const world` was block-scoped to first `if(worldId)` block but referenced in second; hoisted to module-level `let`. Delete world confirmation modal added — warning covers all cascading deletes (characters, lorebooks, collections, lorebook_templates, gallery); `deleteWorld` helper defined in App scope and passed as prop to Modal component (direct inline callback in JSX caused Babel syntax error). CS style object was missing from the file (lost during data array recovery session) — restored before CharDetailPage. Delete lorebook and delete collection converted from `window.confirm` to app modal — `deleteLore` and `deleteColl` helpers added to App; `setModal` threaded through LorePage → LoreSettingsTab and CollPage → CollSettingsTab. Test environment icon generated (lime green book with T badge) as SVG + PNG 512/256 + ICO. Babel: 444KB. |
| 30 | Jun 26 | **World order drag-to-reorder; help page update; export filename standardisation; bug fixes.** Removed right-click context menu (Pin to top) from sidebar worlds. Added `world_order: []` to initData; `sortedWorlds(data)` module-level helper replaces all 12 pinned sorts throughout app. Migration effect on first load: builds `world_order` from pinned-first → alpha. Sidebar world drag-to-reorder implemented with `setPointerCapture` on grip icon — multiple approaches tried (HTML5 DnD does not work in sidebar container); final approach: `onPointerDown`/`onPointerMove`/`onPointerUp` with `elementFromPoint` + `data-sw-idx` attributes. Bug: refs and migration effect were placed inside `CharDetailPage` instead of `App` (wrong anchor — `scenarioDragIdx` lives in CharDetailPage); fixed by moving to App. Bug: `const sortedWorlds=sortedWorlds(data)` self-reference in BatchImportPage from general replacement; fixed to `swWorlds`. Help page updated: 11-tab character section, image tools section added, Import/Export section updated for 3-card layout and merge flow, Backup & Restore → Data Safety, GitHub backup section removed, drag-to-reorder tip in Worlds section. Export filename standardisation: all exports now follow `{name}-{type}.{ext}` — character.json/.md, lorebook.json/.md, collection.json/.md, persona.md. Removed -companion, -sheet, -backup suffixes. Babel: 446KB. |
| 31 | Jul 30 | **Multi-provider AI; Windows installer; dashboard rework queue; the 190 MB data file; voice catalogue.** Multi-provider AI via shared `callAI()` (Anthropic/OpenAI/Google/OpenRouter), per-provider keys in Settings, "Claude" tab renamed **Assistant**; fixed Image Prompt Generator never sending its API key. NSIS installer via `electron-builder`, `DATA_DIR` next to the exe using `process.execPath` (**not** `app.getPath('exe')` — kills the process pre-ready), all 8 folders created on first run; documented Ine's silent Electron-download failure and its manual workaround. **Performance:** diagnosed typing lag as a ~190 MB data file being `structuredClone`d on every keystroke; root cause was portraits stored as base64 from two bugs — `handlePortrait` never calling `copyImageToFolder`, and the Add-portraits handler passing an object where preload takes positional args. Extended Audit base64 to characters/portraits/banners, migration now **links** existing folder files rather than writing duplicates, with a per-item dropdown to choose the file or write a new one (auto-guessing from unclaimed files was rejected — portrait numbering has gaps). Batched migration into one `update()`. **Dashboard:** "Drafts in progress" → **In progress** (now includes `ready`, real status badges, show-all toggle); new **Rework** queue of posted characters with a 7-point depth checklist, cleared by exporting (`reworked_at`). **Release cycle:** after several failed date-window and head-tracking approaches, settled on matching characters to cycle slots by **world name** (`worldIdToName` + `cycleNames.indexOf`) to bypass systemic world-ID mismatches; added Skip button (`cycle_skipped`). **Collections:** local-only `is_community` flag + collection image UUID field; companions in a community collection now inherit its banner automatically via `resolveBannerId()` at export time. Banner UUID input added (the banner had never been exportable — nothing ever set `.id`). **Back navigation:** `navStack` replaces inferring from `selectedWorld`, so Back returns where you actually came from. **Naming:** auto-save and export both use `companion.json` (Saucepan's name). **Export hygiene:** all four character export paths now strip an identical 12-field list; `reworked_at`, `voice_catalog_id`, `posted_dates`, `site_last_synced_at` and `lorebook_entry_*` had been leaking from two of them. Added `SAUCEPAN_VOICES` (33 voices, plain-JS block) + voice picker, wired into the rework checklist. Bug fixes: `sortedWorlds` self-reference in BatchImportPage, `dataLoaded`/refs in the wrong component scope, `updateLoreFromJSON` parameter shadowed by an inner `const existing`, TagSelector needing 3–4 clicks (fixed with `onMouseDown`+`preventDefault`), collection image cache returning the deleted image, temperature field clamping. **Local LLM support:** added LM Studio as a fifth provider (OpenAI-compatible, no auth) with a Test connection button; discovered the CSP exists in *two* places — `main.js` header and an `index.html` `<meta>` tag — and both must allow `http://localhost` or the fetch is blocked with the old policy quoted. Measured the Assistant prompt at 27,327 tokens against an 8192 local window and built a three-tier context scope selector with **per-chapter** lorebook inclusion (lorebook-level was tried first and was useless — one lorebook is 10–14k on its own), live token estimates per chapter and in total, and injection of the world's template as a HOUSE FORMAT block so output comes back pre-shaped. Babel: 484 KB. |
| 32 | Jul 31 | **Base64 migration actually completed (134 MB -> 7 MB); audit blind spot; shrink-guard escape hatch; banner scheduling fix; shutdown flush.** The session-31 migration had never run to completion, and the audit was reporting the data file as clean when it was not. Two separate causes. **(1) Audit blind spot:** `checkItem` returned early on anything holding a relpath, so an item with a working local file *and* a stale base64 blob still in the JSON was bucketed `relpath_ok`. 49 of 50 blobs were invisible to the tool meant to find them. Added a fourth `leftover_data` bucket plus a one-click clear (no file write needed, only nulling the stale field). **(2) Shrink guard:** clearing those blobs is a ~95% shrink, so Layer 2 refused the write and dropped it in `SUSPICIOUS.json` while the real file stayed bloated — the UI showed it applied and it was gone on restart. Added `saveDataAllowShrink`, which snapshots to `lorekeeper-data.preshrink-{ISO}.json` and **resets `lastgood`**; without that reset the next ordinary autosave would itself be refused against a stale 134 MB baseline. Also fixed the picker gap: only companions ever had their folder scanned, so lorebooks/collections/worlds/personas always fell through to "write a new file" even with a matching image sitting in the folder — added `listFolderImages` IPC. Migrate button now states what it will actually do (`Link 1 image to existing file` vs `Write N images out from base64`) instead of always saying "Migrate". **Dashboard banner:** was matching the scheduled day exactly, so missing that one day left a companion at `ready` forever; now fires for any `ready` char scheduled on or before today, with no overdue/warning treatment — a passed date is normal, since scheduling happens on the site and posts run regardless of whether Lorekeeper was open. Mark-posted now stamps the **scheduled** date into `posted_dates` rather than the click date, which also fed cycle head detection. **Shutdown flush (Layer 5):** no `before-quit` handler or `beforeunload` flush existed anywhere; closing the window killed the debounced save timer and any in-flight write. Main now intercepts `close`, waits for a renderer flush handshake and for `saveInFlight`, with an 8s timeout. Found while investigating a companion stuck at `ready`; **not** established as the cause of that (the record had no `posted_dates` key at all, and under the old banner logic there was no banner to click that day) — logged as an independent defect. **Process note:** two rounds of changes this session were made on assumptions that were not checked with Ine first (banner wording, and a timing story invented to link the flush bug to the stuck companion). Confirm intent before changing behaviour, and do not build causal narratives past the evidence. **Post-cleanup image regression (same session).** Clearing the leftover base64 blanked world and collection images app-wide — display only, no data lost. Nine sites were reading base64 fields with no `*_relpath` fallback, plus two rendering banners via CSS `url()`, which cannot resolve a relpath at all. All routed through `ImgFromPath`; Site Checklist warnings and thumbnails fixed too. See Image System for the full list and the lesson. **Measurement note:** Windows PowerShell 5.1 `Get-Content -Raw` decodes as CP1252, inflating the Babel byte count by ~3 KB on this file (1,978 non-ASCII bytes from Japanese world names, arrows, em-dashes). Always pass `-Encoding UTF8`, or the ceiling looks closer than it is. Babel: 493.5 KB of ~500 at the point the feature work stopped; then reduced to **439.3 KB** by moving 77 non-JSX/non-hook declarations (34.1 KB) to the plain JS block and deleting 20.1 KB of never-rendered components (`LoreboookEditor`, `CollEditPanel`, `BackupRestorePanel`, `SchedulePage` — two of which held free `setModal` references that would have thrown if ever mounted). Name-set diff before/after confirms only those four were removed. See Babel Block Budget. |
| 33 | Aug 13 | **Portrait revert bug, spell check, Ctrl+F, Img UUID tool, LM Studio model switching, image-prompt fixes.** **Portrait revert (took three attempts — read this before touching the load migration).** Setting a character's main portrait reverted on every app restart, for some characters and not others. The load-time migration recomputed `char.image.relPath` from a portrait named `profile_pic`, or failing that the *first* portrait, and overwrote whenever it differed. First fix narrowed it to "only when the current path is not among the portraits" — still wrong, because **the main image does not have to be a portrait at all**: Set Portrait imports a standalone file, so `image.relPath` outside the gallery is a normal state. Chris Mori proved it: `image.relPath` was `chris1.png` with a single portrait named `chris2`, so the narrowed condition still fired and still fell back. The fallback is now gone entirely — the migration only follows renames (path matches a portrait's file under name normalisation), and otherwise leaves the value alone. A genuinely missing main image now shows blank rather than being silently replaced, which is the right trade. **Diagnosis note:** the decisive evidence was dumping the character's `image` and `portraits` from the data file *while the app was closed*, which separated "save path is wrong" from "load path is wrong". Do that first next time instead of reasoning about which branch might fire. **profile_pic UUID is one-way.** A portrait named exactly `profile_pic` mirrors `char.image.id`; the profile pic field is the source, the slot follows. The reverse write (editing the slot's UUID pushed back up to the profile pic) was removed, and a load-time sync makes existing data converge. **Spell check** — Electron flags misspellings by default but ships no context menu, so right-clicking a red-underlined word did nothing. Added a `context-menu` handler with `dictionarySuggestions`, `replaceMisspelling`, add-to-dictionary, and the usual edit actions. **Ctrl+F** — a `FindBar` component taking a `[{tab,label,text}]` field list, wired into characters (description, card, formatting, each intro), lorebooks (short description, each chapter) and collections (definition, lorebook display). Custom rather than Electron's `findInPage`, which cannot see inside textarea values — where all this content lives. **Img UUID tool** — extracts the UUID from any of Saucepan's three image copy formats, deduplicated. **Also:** the `Quick find… (Ctrl+K)` placeholder advertised a shortcut that was never bound; label removed. Import/Export full-backup footgun, export parity, Help audit, and `CHAR_CHECKS` unification all landed this session too — documented in their own sections above. Babel: 439.3 -> 458.4 KB (~42 KB headroom). |
| 35 | Aug 31 | **Git backup sync; disk failure recovery; test environment retired.** Session opened with an `I:` drive failure. Notes, templates, ComfyUI workflows and LM Studio presets were all on it; the drive recovered after a reseat, but the gap it exposed was real and none of Layers 1–5 addressed it, since every one of them writes to the same disk as the data it protects. **Audit of what actually has an independent backup found two things worth recording.** `Worlds\` and `Personas\` are created at startup by `main.js` line 16 but **nothing ever wrote to them automatically**. `Worlds\` is genuinely empty. `Personas\` held five `.md` files, but those were manual "Export MD" saves from June — formatted documents that cannot be reimported, and three months stale. Fixed later in the session with `savePersonaFile` (see Auto-Save to Disk). And `companion.json` is a *Saucepan export*, not a local backup: `saveCompanionJson` strips `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `export_filename`, `lorebook_entry_text`, `lorebook_entry_title`, `voice_catalog_id`, `reworked_at` and portrait `relPath` before writing. So the session-16 recovery restored character *content* but not which world each belonged to, which collections they were in, or their schedule state — that had to be rebuilt by hand. The whole organisational layer (worlds, personas, gallery, schedule, `schedule_notes`, `release_cycle`, `cycle_head_world_id`, `cycle_skipped`, `lorebook_templates`, `map_positions`, `world_order`, `relationships`, `settings`) still lives only in `lorekeeper-data.json`. **Built Git Backup Sync** — private `lorekeeper-data` repo, robocopy mirror into `I:\LorekeeperBackup`, commit and push. Images excluded so the whole corpus is ~16 MB packed and can be pushed after every session, unlike the full ZIP which is gigabytes and therefore only run occasionally. Runs automatically on app close (hooked into the Layer 5 flush handshake, spawned detached so `git push` can't delay quitting) plus a Sync now button. Added `writePrettyData()` emitting a key-sorted pretty copy, because git can't diff `saveData`'s single-line output — one note edit went from a fresh 16 MB blob to a two-line diff. Extended to ComfyUI (`user\default` + `__manager\snapshots`, which is the node reinstall manifest) and LM Studio (`config-presets` only). **`credentials\` excluded in both the script and `.gitignore`** — git history is permanent, so a key committed once is recoverable forever. Model and image exclusion is layered — path scope, extension filter, `/MAX:5242880` size cap, `.gitignore` — because a wrong path here fails silently by mirroring tens of GB rather than erroring. First run leaked one `.avif`: the script's extension list didn't match `IMAGE_EXTS` in `main.js`, which includes it. Fixed and extended with `tif`/`tiff`/`mov`. Two setup traps worth remembering: the source repo's `.gitignore` excludes exactly the folders this repo exists to hold (copying it over yields a repo that syncs nothing), and `I:\Lorekeeper` is already the source working tree so the backup repo must live elsewhere. **Test environment at `I:\Test` deleted** — build considered stable. Untested builds now hit live data, mitigated by syncing before installing a new build. Babel: 471.8 -> 475.3 KB (~25 KB headroom — tighter than the 439 KB of session 32, worth reclaiming before the next feature). |
| 35b | Sep 2 | **Portrait site flags; sync pull guard; HelpPage Babel reclaim; world tags and custom character tags removed.** Continuation of session 35. **Portrait flags (`very_sus` / `gallery_only` / `caption`)** — found by diffing Lorekeeper's `companion.json` against Saucepan's export for the same character: the Extra Spicy flag existed in both and disagreed. Locally-added portraits were hardcoded `very_sus:false` with no UI, so exporting un-blurred an image that was spicy on the site. Added chips on the Portraits tab and badges on the Gallery tab. See Portrait Fields. **Export leak found while checking whether `temperature_offset_percentage` exports (it does, in all paths):** `CharDetailPage.updChar` carried its own inline copy of `saveCompanionJson`'s logic that stripped only `data`, leaking local `relPath` into the export-shaped file, and read `companion_profile_banner_image` directly instead of calling `resolveBannerId`, so inherited world banners were written as `undefined`. Both fixed to match the shared function. **Lesson: duplicated export logic drifts.** The inline copy had silently fallen behind the canonical one; a first pass wrongly dismissed the `relPath` leak as a stale file because only the shared function was checked. **Sync pull guard** built — see What's Next A, including the `EnableDelayedExpansion` trap. **Babel reclaim 478.2 -> 456.4 KB** via the HelpPage restructure; an automated scan first confirmed zero movable declarations and zero unreferenced components remained, so restructuring was the only lever left. See Babel Block Budget. **World tags removed** (unused field) from the editor, world card previews and the AI context builder; description kept. **Custom character tags removed** — gated inside `addCustom` rather than at the call site so the Enter key cannot bypass it. Rationale: Saucepan silently drops tags it does not recognise, so a typo'd custom tag looked applied in Lorekeeper and vanished on the site. **Character completeness confirmed as-is** — `advanced_prompt` and `voice_catalog_id` stay required; the required/recommended split is explicitly not wanted. |
| 35c | Sep 2 | **Two full audits (app, then spec), and the export-drift bug class closed by hand.** Ran a read-only audit of the code, then of the spec against the code. The app audit found the character export shape reconstructed in **four** places, lorebook in **two**, collection in **two**, each with a hand-maintained strip list, all drifted. Cross-checking the strip lists **as sets** rather than reading them found three more copies the audit itself missed — a fifth lorebook copy in `handleLoreBackup`, and `export_filename` left unstripped in `saveCompanionJson` and `updChar`. **Fixed:** `setCol` never renamed `definition`->`description` (the exact bug `exportColl`'s comment documents having fixed in session 18) so every auto-saved collection file had been shipping without its description text; `exportChar` and the ZIP character loop leaked portrait `relPath` — the two paths that actually reach Saucepan were the two still broken two sessions after the fix was written; `updLore` and `handleLoreBackup` were five fields behind `exportLore` and omitted the derived `collaboration_type` and `selected_chapter_index` entirely; `export_filename` added to all three ZIP strip lists. Also fixed the character banner preview gating visibility on `.data` alone, which hid a valid banner once the base64 migration cleared it. All strip lists now collapse to one field set per type (character 13, lorebook 8, collection 8). **Spec audit findings corrected:** tag count 540->659; the hardcoded 21-item CW tag list replaced with a note that it is derived live and currently 31 (it had drifted twice); character strip list 11/12->13 fields in all four places it appears; `initData` sample regenerated from real code (`relationships` is deliberately absent and reached through a defensive fallback; `schedule[]` and `map_positions{}` were missing); world `tags[]`/`fandom_tags[]` marked vestigial; Settings page's stale single-provider "Claude API" bullet replaced with a pointer to the AI Integration section; Tools table 14->18 rows; IPC table gained `saveImage`, `pasteImage`, `getLastgoodInfo`, `restoreLastgood`; `icon.svg`, installer version and plain-block size corrected. **Method note worth keeping:** the audit was told to produce a report and make no changes. That was the right call — it surfaced far more than could have been safely auto-fixed, and the set-comparison cross-check that caught the extra three copies only happened because a human read the report first. `.gitignore` block regenerated from the real file and `assets/` documented as deliberately tracked (icons are needed for the installer build). **Still open:** consolidation of the export builders into shared functions, so this bug class cannot recur. |
| 34 | Aug 19 | **Saucepan tag database audit and migration.** Ine's tag reference had drifted to 540 entries against the site's current 658. Source was a 51-page PDF export (`All Tags`) rather than a screenshot — the screenshot originally supplied was 455px wide for an 8000px page and genuinely unreadable at any zoom, and was correctly declined rather than transcribed by guesswork; the PDF has real embedded text. **Parsing was not trivial.** A first pass using plain sequential text extraction corrupted 22 entries — one tag's name/description bleeding into the next — because the PDF's text run order doesn't always follow visual order when a description is short enough to share a line with the relative-time label. Switched to `pdfplumber`'s `layout=True` mode, which preserves column position as whitespace, and parsed by treating only name+date lines and category headers as hard boundaries, stripping the relative-time phrase out of content wherever it lands rather than trusting it as a line-terminator. Verified via three independent signals: per-category counts against the page's own declared totals (exact 658/658 across all 15 categories), a scan for emoji leaking into a description (only ever appears at the start of a real name), and duplicate-name detection. **Result:** 297 unchanged, 204 same-id with description/category updates, 35 genuine renames, 118 new tags, 0 removed (three that looked deleted were renames with heavily reworded descriptions: `scenario`→`premise`, `regency_era`→`regency`, `plus_sized_bot`→`plus_sized`). One entry, `mythological`, has no match anywhere in the new 658 and was deliberately left in `SAUCEPAN_TAGS` unchanged rather than deleted on a guess — flagged for Ine to check directly on the site. **Two automated fuzzy-matches were caught and corrected by hand before writing anything:** `mythological`→`perfectionist` was pure word-overlap coincidence (myths/folklore vs. a personality trait) and `feral`→`sentient_fictional_creature` picked the wrong candidate — the real match, `sentient_animal`, scored lower only because the matching was greedy nearest-neighbour per source tag rather than a true one-to-one assignment. A full manual read of all candidate pairings, not just the two that got fixed, is what caught these; the lesson is that automated similarity scoring on data destined for a live migration needs a human pass on every pairing, not just the low-confidence ones. **Also caught:** three POV tags (`first_person_pov` etc.) generated garbled ids (`1️⃣_first_person_pov`) because the icon-stripping logic treated a digit inside a keycap emoji sequence (U+0031 U+FE0F U+20E3) as real content — `isalnum()` is true for that digit. Fixed by stripping until the first ASCII letter instead of the first alphanumeric character; all three turned out to be reworded-description-only, not real renames, once fixed. **Migration:** `TAG_RENAME_MAP` (35 entries) plus `migrateTagArray()` in the plain JS block, called once per load against `characters[].tags`, `worlds[].tags`, `lorebooks[].tags`, and `collections[].tags` — idempotent, so it's a no-op scan after the first run. **`CW_TAGS` is no longer hand-maintained** — verified byte-for-byte identical to "every tag whose category is Content Warnings" before being replaced with a live derivation from `SAUCEPAN_TAGS`, so it can't drift again and automatically picked up the two new CW tags (Medical Trauma, Scat). `IMG_SKIP_TAGS`'s one stale reference (`scenario`) updated to `premise`. Full before/after detail for every tag is in `tag_audit.md`, delivered as a standalone reference file rather than pasted into the spec, since the spec tracks architecture and this is data. All growth landed in the plain JS block (SAUCEPAN_TAGS is pure data, no JSX/hooks) — Babel unchanged at 469.8 KB. |
