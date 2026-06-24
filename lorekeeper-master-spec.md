# LOREKEEPER — Master Specification
**Last updated: June 20, 2026 (session 20)**

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
    icon.ico / icon.png / icon.svg
  Companions\
    CharacterName\
      character.json      <- auto-saved on every edit if companion_folder is set
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
    PersonaName.jpg       <- persona portraits
  Notes\
    WorldName.md           <- per-world notes backup, auto-saved independent of lorekeeper-data.json
    _global.md             <- global scratchpad backup
  Templates\
    TemplateName.json       <- per-template backup, auto-saved independent of lorekeeper-data.json
  node_modules\
    adm-zip\
```
`lorekeeper-data.lastgood.json` and `lorekeeper-data.SUSPICIOUS.json` also appear at the root alongside `lorekeeper-data.json` once the app has run — see Data Safety Architecture.

---

## IPC Methods (preload.js -> main.js)
| Method | Description |
|---|---|
| `loadData()` | Load lorekeeper-data.json |
| `saveData(data)` | Async write to lorekeeper-data.json (compact JSON, no pretty-print) |
| `exportFile({defaultName, content, folder?})` | Save dialog -> write file. Filter is chosen dynamically from `defaultName`'s extension (json/md/txt/fallback to All Files) — fixed session 17, was previously hardcoded to always show "JSON" even for `.md` exports. `folder` (added session 17/18) defaults the save dialog to the relevant subfolder (`Companions`/`Lorebooks`/`Collections`/`Personas`/`Templates`) instead of always `I:\Lorekeeper\`; creates the folder if it doesn't exist yet. |
| `saveNotesFile(filename, content)` | Write a standalone `.md` backup to `Notes\{filename}.md`, independent of the main data file — see Data Safety Architecture |
| `saveTemplateFile(filename, data)` | Write a standalone JSON backup to `Templates\{filename}.json`, independent of the main data file — same reasoning as `saveNotesFile`, added session 17/18 |
| `importFile()` | Open dialog -> read JSON string |
| `importImage()` | Open dialog -> returns `{base64, srcPath}` |
| `importImages()` | Multi-select -> returns `[{name, base64, srcPath}]` |
| `readImagePath(relPath)` | Read `I:\Lorekeeper\{relPath}` -> base64 |
| `scanCompanions()` | Scan `Companions\` -> folder results with JSON + image list |
| `scanLorebooks()` | Scan `Lorebooks\` -> JSON results + `imageRelPath` if image found alongside JSON |
| `scanCollections()` | Scan `Collections\` -> JSON + thumbnail + `imageRelPath` |
| `openFolder(relPath)` | Open in Windows Explorer |
| `getDataPath()` | Returns full path to data file |
| `saveCompanionJson(folderName, data)` | Write to `Companions\FolderName\character.json`; strips app-only fields |
| `saveLorebookJson(filename, data)` | Write to `Lorebooks\filename.json`; strips app-only fields |
| `saveCollectionJson(filename, data)` | Write to `Collections\filename.json`; strips app-only fields |
| `copyImageToFolder(srcPath, destFolder, filename)` | Copy image locally; skips if already in Lorekeeper folder or dest exists; returns `{relPath, base64}` |
| `writeImageFromBase64({base64, destFolder, filename})` | Write base64 to image file; checks dest exists first; returns `{relPath}` |
| `exportBackup({worldId?})` | Create zip — full or per-world; returns `{success, size, path}` |
| `exportPlatformZip({defaultName, files[], folder?})` | Save dialog -> zip pre-built JSON strings; returns `{success, size, path}`. `folder` (added session 18) defaults to `Worlds\` for the world Export ZIP. |
| `restoreBackup()` | Open zip picker, extract files, return data for merge/replace |

---

## Data Model

### initData shape
```js
{ worlds:[], characters:[], lorebooks:[], collections:[],
  gallery:[], notes:'', personas:[], templates:[],
  release_cycle:[], schedule_notes:{}, lorebook_templates:[],
  relationships:[], settings:{} }
```

### World
- `id`, `name`, `short_description`, `tags[]`, `fandom_tags[]`
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
540 tags embedded in the app across 15 categories. Valid for characters, lorebooks, and collections.

**21 Content Warning tags** — shown in red, excluded from the 25-tag cap: `dead_dove`, `noncon_dubcon`, `abuse`, `blackmail`, `slur_usage`, `self_harm_suicide`, `violence`, `gore`, `drugs_addiction`, `incest_stepcest`, `vore`, `cannibalism`, `feral`, `trauma`, `terminal_illness`, `user_harm`, `death`, `body_horror`, `eating_disorder`, `amputation`, `miscarriage`

---

## Navigation (Sidebar)
- **Dashboard** — calendar, today banner, upcoming, release cycle, site checklist, lorekeeper checklist, drafts in progress
- **Worlds** — world card grid; click -> WorldDetailPage (Characters/Lorebooks/Collections/Gallery/World Info tabs)
- **Characters** — world filter dropdown + status filter dropdown (Draft/Ready/Posted), both via shared `WorldFilterDropdown`/funnel pattern (added session 18 — scales to any number of worlds without the filter row wrapping or growing); click -> CharDetailPage (13 tabs)
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
- **CharDetailPage** — sidebar (portrait, platform image UUID, banner, quick info, tags) + main (13 tabs: Identity, Full Description, Character Card, Formatting, Example Dialogue, Scenarios, Portraits, Lorebooks, Collections, Settings, Schedule, Lorebook Entry, Export)
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
1. **Identity** — name, display name, short desc (140), world, tags (TagSelector, X/25 + CW), fandom tags (X/3), world tag suggestions
2. **Full Description** — markdown preview toggle
3. **Character Card** — markdown preview + macro reference panel
4. **Formatting** — formatting instructions + advanced prompt
5. **Example Dialogue**
6. **Scenarios** — max 7500 chars, markdown preview, macro reference, drag to reorder
7. **Portraits** — up to 10 slots, drag to reorder, platform image ID per slot
8. **Lorebooks** — cross-world lorebook picker
9. **Collections** — cross-world collection picker
10. **Settings** — access level, temperature %, spicy flags, booleans, companion_folder
11. **Schedule** — status (draft/ready/posted), schedule dates, posted date. Setting status to "Posted" from this dropdown auto-stamps today's date into `posted_dates` if it's empty (fixed June 19 — previously only the Dashboard's "Mark posted" banner button did this; the dropdown left `posted_dates` empty, requiring a manual follow-up "Add Posted Date" click)
12. **Lorebook Entry** — fill world lorebook template for this character; save directly to lorebook
13. **Export** — Export JSON (platform-ready, stripped) and Export MD (sheet with descriptions, card, prompt, scenarios, tags) with in-app preview and a field-completeness checklist; full-width (fixed session 19, see Lorebook Detail Export note — same shared `.export-panel` CSS bug affected all three: characters, lorebooks, collections)

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
- Full zip backup + per-world zip export — these are app backups for disaster recovery, NOT for uploading to Saucepan
- World **Export ZIP** (in world topbar) — platform-ready zip of posted characters + public lorebooks + public collections, stripped of app-only fields, stamps `site_last_synced_at`; this is what gets uploaded to Saucepan
- Restore: global = full replace, world = smart merge
- Requires `adm-zip` (`npm install adm-zip` in `I:\Lorekeeper\`)
- **`lorebook_templates` per-world backup gap, fixed session 19:** the per-world backup in `main.js` built a custom `exportData` object listing specific top-level keys (`worlds, characters, lorebooks, collections, gallery, personas, templates, notes, ...`) — `lorebook_templates` was missing from that list entirely, so a per-world backup silently dropped all of that world's lorebook entry templates (global backups were unaffected, since those just copy `data` wholesale). Fixed on both sides: the export now includes `lorebook_templates` filtered to that world, and the restore-side merge logic in `index.html` (which previously only merged `templates`, not `lorebook_templates`) now merges both.

### Notes Backups
See Data Safety Architecture section — independent `.md` backup per world plus the global scratchpad, separate from the main data file.

---

## Auto-Save to Disk
- Characters -> `Companions\{folder}\character.json`
- Lorebooks -> `Lorebooks\{filename}.json`
- Collections -> `Collections\{filename}.json`
- New items auto-get folder/filename from name (sanitized, no trailing underscores); clearable to opt out
- `updated_at` stamped on every edit
- Writes happen async (`fs.promises.writeFile`) and are debounced (default 600ms) to avoid disk thrashing during typing

---

## Image System
- All uploads copied to local folder via `copyImageToFolder`; stores `image_relpath`
- `ImgFromPath` component resolves both relPath (via `readImagePath` IPC) and base64 data URIs
- `RelPortrait` (relationship map) does the same resolution for SVG `<image>` elements
- Supported formats: jpg, jpeg, png, gif, webp, avif
- Export strips all base64

---

## Platform Export Requirements
All three export paths — `exportChar`/`exportLore`/`exportColl` (single-item Export JSON buttons) and `exportWorldPlatformZip` (world topbar Export ZIP) — must stay in sync with each other. They duplicate the same stripping/field-mapping logic rather than sharing one function, so a fix applied to one must be applied to both; this has been a repeated source of bugs (see session 18).

**Characters:** `display_name`, `name`, `short_description`, `full_description`, `card`, `tags[]` (min 5), `image.id`, `portraits[]`, `starting_scenarios[]`
Strips: `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `lorebook_entry_text`, `lorebook_entry_title`, `voice_catalog_id`; from portrait objects: `data` (base64) and `relPath` (app-local path) — session 23
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
- Fires for `ready` chars scheduled today; mark posted / reschedule / dismiss
- Marking posted stamps `posted_dates` and sets `status = 'posted'`

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

## Claude Integration

Right panel Claude tab — full AI chat with world-aware context.

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

**Claude API** — API key (show/hide, save), model selector (Sonnet/Opus/Haiku)
**Appearance** — Font size (Small/Normal/Large/XLarge, applies immediately and globally via CSS `zoom` on `document.documentElement` — see CSS Gotchas section for why `zoom` rather than root font-size); **Theme** (accent color → generated dark + light theme pair, live preview, Apply/Reset — see Theme System section, added session 20); Colorblind mode placeholder (still not built)
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

**Icon constraint:** every icon must exist in Tabler Icons 2.44.0 (pinned version). Confirmed NOT in 2.44: `ti-files-diff`, `ti-waves` — caused blank icons when used.

---

## Help System

- Help page in sidebar — 15 collapsible sections, kept current with the app
- Sections: Dashboard, Characters, Worlds, Lorebooks, Collections, Personas, Templates, Lorebook Templates, Relationship Map, Tools Panel, Batch Import, Auto-save, Image Storage Audit, Backup & Restore, Settings, Claude AI, GitHub backup
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

## Babel Standalone Gotchas (hard-won, do not relitigate)
These caused repeated regressions across sessions — treat as fixed rules:
- **Never** put `style={{...}}` inside a ternary or `&&` conditional's JSX consequent — Babel standalone reliably fails to parse it. Use a CSS class instead, or extract the conditional content to its own component.
- **Never** put a literal backslash in a JSX string (e.g. a Windows path) — Babel misreads it as a regex/escape sequence. Build the string outside JSX with a `BS = String.fromCharCode(92)` constant and plain string concatenation (see `loreHint`, `charFolderHint` helper functions), then just reference the result in JSX.
- **Multi-line JSX as a ternary consequent** needs parens around the JSX block — bare `{cond?<div>...</div>:null}` spanning many lines can still fail; when in doubt, extract to a named component and call it as `{cond?<MyComponent/>:null}`.
- Apostrophes inside single-quoted JS strings need to become double-quoted strings instead of escaping.
- Double-curly-brace syntax appearing in literal JSX text (e.g. documentation about macro syntax) must be wrapped as a string literal expression, not typed directly into JSX text.
- Use `if(tab==='x') return (...)` pattern instead of nesting deep ternaries when a component has 2+ mutually exclusive views — more reliable than ternaries with multi-line JSX.

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

### Layer 3 — rolling last-known-good backup (`main.js`)
Every write that passes the Layer 2 check also writes a copy to `lorekeeper-data.lastgood.json`. This is a second, independent fallback file separate from the main save, useful as a manual recovery point if something Layers 1–2 didn't anticipate ever happens.

### Layer 4 — standalone notes backup (`main.js` + `index.html`)
Notes (global scratchpad and per-world) previously had **no** independent backup — they only ever lived inside the single big data file, unlike characters/lorebooks/collections which each already auto-save to their own JSON. Every world's notes (and the global scratchpad) now also debounce-write to a plain-text file at `Notes\{WorldName}.md` / `Notes\_global.md`, completely independent of the main data file write. A "Notes Backups" panel on the Batch Import page explains this and has an "Open Notes folder" button. Wired from both the right-panel Notes tab and the World Info tab's Notes field (same backend file, same backup).

### `parseTimestamp()` — Saucepan date format
Saucepan exports timestamps like `"2026-06-18 03:01:00.455294 +00:00:00"`, which native `Date()` cannot parse (silently returns `NaN`). This broke every "local newer" comparison in batch import for any item that had ever been touched by a site export. A `parseTimestamp()` helper near the top of `index.html` normalizes the format (space→T, truncate microseconds, fix the `+00:00:00`→`+00:00` offset) before handing off to `Date()`. All `pts`/`parseTs` local helpers throughout the file now alias to this single function — do not reintroduce inline duplicate date parsers.

---

## Performance Notes
- `update(fn)` clones the entire `data` tree before mutating (so React detects the change and undo-safety is preserved). This used `JSON.parse(JSON.stringify(d))` originally, which was slow enough to cause visible lag while typing (e.g. in the Notes textarea) once the character count grew past ~40. Switched to `structuredClone(d)` — same semantics, meaningfully faster, no string round-trip.
- `saveData` in `main.js` switched from `fs.writeFileSync` (synchronous, blocks the main process) with pretty-printed JSON to `fs.promises.writeFile` (async) with compact JSON (no `null, 2`).
- If typing lag returns as the dataset keeps growing, the next lever is restructuring `update()` to avoid cloning the *entire* tree for small, localized field changes (e.g. per-collection update functions instead of one global clone-and-mutate).

---

## Long-term Vision
Lorekeeper as full local backup and source of truth — independent of Saucepan. All content mirrored locally. Images as files. Export-ready even if the site goes down.

---

## What's Next (Priority Order)

### Import/Export Audit (session 22 flagged, partially done session 25)
Duplicate `exportAll` / "Backup everything" button removed. Import/Export page reorganised into three cards: Backup, Restore, Import. Character Export tab merged into Settings tab; Example Dialogue tab merged into Formatting tab.

Remaining gaps to verify:
- Are all export paths (character/lorebook/collection single-item + world ZIP) keeping the same required Saucepan fields? Spot-check after any future export change.
- `importJSON` (single-item modal drop) still handles full data restore silently if a full-backup JSON is picked — consider blocking this path or routing to Restore explicitly.
- World topbar Export ZIP: verify it still matches the individual export paths for all three content types.

### Image Tools
- **Format converter** — convert any local image (PNG/JPG/WEBP/AVIF etc.) to a target format; useful for Saucepan which prefers AVIF; uses `sharp` npm package
- **Paste & save** — paste image from clipboard → preview → save as a file to a chosen folder (Companions/CharName, Lorebooks, Collections, etc.); replaces manual screenshot workflow
- **Cropper** — crop a local or pasted image to a target aspect ratio (3:4 portrait, 4:1 banner, 1:1 square); canvas-based UI
- **Image prompt generator** — Claude call using character name/description/tags to generate an image generation prompt; lives in character editor or right panel

### Tools (remaining)
- **Map generator** — region/landmark randomiser; output as text description or simple ASCII map (design TBD)

### UI Overhaul (remaining)
- **CharDetailPage** — has the most inline styles of any component (oldest and most complex); structurally fine, worth a cleanup pass later when there's time, not urgent
- **Standalone / Public Version** — configurable data path, strip Saucepan-specific stuff, packaged `.exe`, optional rename/theming; README.md goes here

### Won't do
- Per-world color theming
- Age calculator in tools
- Text stats in tools
- Schedule page (replaced by dashboard calendar)
- Relationship dynamic generator

### Very long term
- Android build

---

## GitHub

## GitHub

### Repository
- Private repo at Ine's GitHub account (created June 2026)
- Only source files and documentation tracked — personal data never committed

### .gitignore
```
lorekeeper-data.json
lorekeeper-data.lastgood.json
lorekeeper-data.SUSPICIOUS.json
Companions/
Lorebooks/
Collections/
Worlds/
Personas/
Templates/
Notes/
node_modules/
assets/
*.ico
*.png
*.svg
```
Note: `Templates\` and `Notes\` were added June 19 (new auto-save folders). `lorekeeper-data.lastgood.json` and `*.SUSPICIOUS.json` are the safety-net files from the Data Safety Architecture section — also personal data, also excluded.

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
| 2 | Jun 18 | Collections top-level page, TagSelector (540 tags + 21 CW), tag templates, world tag suggestions, personality/plot/nationality/color/diff tools, site checklist, custom HSL color picker |
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

---

## What's Built
Full feature list — see sections above for details on each. Chronological build order is in the Session Log table above.
| 25 | Jun 24 | **Import/Export page reorganisation; character tab reduction.** Import/Export page ("Batch Import") rebuilt into three side-by-side cards — **Backup** (export full ZIP + per-world dropdown+button, replacing individual per-world buttons that would overflow with many worlds), **Restore** (from backup ZIP with explicit note that full backup replaces all / world backup merges; from last-good auto-save), **Import** (single item JSON + batch scan + how-it-works). Duplicate "Backup everything" button removed (was identical to "Export full backup"). All action buttons now use standard `btn` style (no `primary` colouring). Backup/restore state inlined from old `BackupRestorePanel` component which is no longer rendered. Character detail page tab count reduced from 13 to 11: **Example Dialogue** tab removed — textarea moved into Formatting tab below Advanced Prompt. **Export** tab removed — `CharExportTab` (Update from JSON / Export JSON / Export Markdown) moved into Settings tab above Delete Character button. |
