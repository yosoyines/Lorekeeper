# LOREKEEPER — Master Specification
**Last updated: June 19, 2026 (session 15)**

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
  node_modules\
    adm-zip\
```

---

## IPC Methods (preload.js -> main.js)
| Method | Description |
|---|---|
| `loadData()` | Load lorekeeper-data.json |
| `saveData(data)` | Async write to lorekeeper-data.json (compact JSON, no pretty-print) |
| `exportFile({defaultName, content})` | Save dialog -> write JSON |
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
| `exportPlatformZip({defaultName, files[]})` | Save dialog -> zip pre-built JSON strings; returns `{success, size, path}` |
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
- `portraits[]` — up to 10: `{ name, description, very_sus, relPath, data, image:{id} }`
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
- **App-only:** `lorebook_filename`, `selected_chapter_index`

### Collection
- `id`, `world_id` (null = standalone), `name`, `definition`
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

### Relationship (relationship map edges)
- `id`, `worldId`, `charA`, `charB` (character IDs), `label` (free text, e.g. "rivals", "siblings")

### Settings
- `anthropic_api_key` — for Claude panel
- `claude_model` — default `claude-sonnet-4-6`
- `font_size` — `'small'` | `'normal'` | `'large'` | `'xlarge'` — applied globally to `document.documentElement.style.fontSize`
- `autosave_debounce` — ms; default 600

---

## Saucepan Tags
540 tags embedded in the app across 15 categories. Valid for characters, lorebooks, and collections.

**21 Content Warning tags** — shown in red, excluded from the 25-tag cap: `dead_dove`, `noncon_dubcon`, `abuse`, `blackmail`, `slur_usage`, `self_harm_suicide`, `violence`, `gore`, `drugs_addiction`, `incest_stepcest`, `vore`, `cannibalism`, `feral`, `trauma`, `terminal_illness`, `user_harm`, `death`, `body_horror`, `eating_disorder`, `amputation`, `miscarriage`

---

## Navigation (Sidebar)
- **Dashboard** — calendar, today banner, upcoming, release cycle, site checklist, lorekeeper checklist, drafts in progress
- **Worlds** — world card grid; click -> WorldDetailPage (Characters/Lorebooks/Collections/Gallery/World Info tabs)
- **Characters** — all characters, filter by world; click -> CharDetailPage (13 tabs)
- **Lorebooks** — all lorebooks, filter by world or Standalone; click -> LorePage (Chapters/Settings/Export tabs)
- **Collections** — all collections, filter by world or Standalone; click -> CollPage (Edit/Export tabs)
- **Personas** — player characters, independent from worlds; click -> PersonaDetailPage
- **Templates** — global and per-world character creation templates; card list grouped by world
- **Batch Import** — scan folders, import, image audit, backup/restore
- **Settings** — API key, model, font size (applied globally), debounce, theme/colorblind (placeholders); full-width layout
- **Help** — 15 collapsible sections covering all features
- **Worlds list** — pinned first, emoji icon, right-click -> pin/unpin
- **Sidebar collapse** — icons only mode; footer has Import + Backup buttons
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
11. **Schedule** — status (draft/ready/posted), schedule dates, posted date
12. **Lorebook Entry** — fill world lorebook template for this character; save directly to lorebook
13. **Export** — Export JSON (platform-ready, stripped) and Export MD (sheet with descriptions, card, prompt, scenarios, tags) with in-app preview and a field-completeness checklist

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

## Batch Import
1. Place files in `Companions\`, `Lorebooks\`, `Collections\`
2. **Scan Folders** — finds JSONs + images; badge: **new** / **update** / **local newer** / **up to date**
3. Auto-links characters to collections via `companions[]`
4. Sets `companion_folder`, `lorebook_filename`, `collection_filename`, `image_relpath` from scan
5. Tag chips shown per item with CW highlighting

### Image Storage Audit
- **Rescan images** — scans folders, links images via `image_relpath`
- **Audit base64** — finds legacy base64 items; shows relpath status
- **Migrate** — writes to files, sets `image_relpath`, clears base64; no duplicates

### Backup & Restore
- Full zip backup + per-world zip export — these are app backups for disaster recovery, NOT for uploading to Saucepan
- World **Export ZIP** (in world topbar) — platform-ready zip of posted characters + public lorebooks + public collections, stripped of app-only fields, stamps `site_last_synced_at`; this is what gets uploaded to Saucepan
- Restore: global = full replace, world = smart merge
- Requires `adm-zip` (`npm install adm-zip` in `I:\Lorekeeper\`)

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
**Characters:** `display_name`, `name`, `short_description`, `full_description`, `card`, `tags[]` (min 5), `image.id`, `portraits[]`, `starting_scenarios[]`
Strips: `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `lorebook_entry_text`, `lorebook_entry_title`, all base64

**Lorebooks:** `image_id` (mandatory), `tags[]` (mandatory), `definition_protection` != open
Strips: `world_id`, `lorebook_filename`, `image_data`, `image_relpath`, `selected_chapter_index`, `site_last_synced_at`

**Collections:** `image.id` (mandatory), `tags[]` (mandatory), `definition` (mandatory)
Strips: `world_id`, `collection_filename`, `image_data`, `image_relpath`, `site_last_synced_at`

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
- Shows items edited since last export: characters (status=posted), lorebooks/collections (has_been_public)
- Condition: `updated_at > site_last_synced_at` AND `site_last_synced_at` exists
- Export button stamps `site_last_synced_at` -> item disappears from list
- Help button explains the 4-step workflow

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
- API key from Settings -> Claude API; amber nudge if not set
- CSP allows `https:` so API calls work from Electron

---

## Settings Page
Full-width layout (no max-width cap).

**Claude API** — API key (show/hide, save), model selector (Sonnet/Opus/Haiku)
**Appearance** — Font size (Small/Normal/Large/XLarge, applies immediately and globally via `document.documentElement.style.fontSize`); Theme placeholder; Colorblind mode placeholder
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
| Plot | `ti-books` | 100 global archetypes + per-world custom pool; filter global/world/any |
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

## Babel Standalone Gotchas (hard-won, do not relitigate)
These caused repeated regressions across sessions — treat as fixed rules:
- **Never** put `style={{...}}` inside a ternary or `&&` conditional's JSX consequent — Babel standalone reliably fails to parse it. Use a CSS class instead, or extract the conditional content to its own component.
- **Never** put a literal backslash in a JSX string (e.g. a Windows path) — Babel misreads it as a regex/escape sequence. Build the string outside JSX with a `BS = String.fromCharCode(92)` constant and plain string concatenation (see `loreHint`, `charFolderHint` helper functions), then just reference the result in JSX.
- **Multi-line JSX as a ternary consequent** needs parens around the JSX block — bare `{cond?<div>...</div>:null}` spanning many lines can still fail; when in doubt, extract to a named component and call it as `{cond?<MyComponent/>:null}`.
- Apostrophes inside single-quoted JS strings need to become double-quoted strings instead of escaping.
- Double-curly-brace syntax appearing in literal JSX text (e.g. documentation about macro syntax) must be wrapped as a string literal expression, not typed directly into JSX text.
- Use `if(tab==='x') return (...)` pattern instead of nesting deep ternaries when a component has 2+ mutually exclusive views — more reliable than ternaries with multi-line JSX.

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

### Image Tools
- **Format converter** — convert any local image (PNG/JPG/WEBP/AVIF etc.) to a target format; useful for Saucepan which prefers AVIF; uses `sharp` npm package
- **Paste & save** — paste image from clipboard -> preview -> save as a file to a chosen folder (Companions/CharName, Lorebooks, Collections, etc.); replaces manual screenshot workflow
- **Cropper** — crop a local or pasted image to a target aspect ratio (3:4 portrait, 4:1 banner, 1:1 square); canvas-based UI
- **Image prompt generator** — Claude call using character name/description/tags to generate an image generation prompt; lives in character editor or right panel

### Tools (remaining)
- **Map generator** — region/landmark randomiser; output as text description or simple ASCII map (design TBD)
- **Relationship dynamic generator**

### UI Overhaul (mostly done)
Consistency pass complete across list pages, detail pages, and World Info/Settings. Remaining:
- **CharDetailPage** — has the most inline styles of any component (it's the oldest and most complex); structurally fine, worth a cleanup pass later when there's time, not urgent
- **Global themes** — light/dark + accent color
- **Colorblind mode** — deuteranopia, protanopia, tritanopia
- **Standalone / Public Version** — configurable data path, strip Saucepan-specific stuff, packaged `.exe`, optional rename/theming; README.md goes here

### Won't do
- Per-world color theming
- Age calculator in tools
- Text stats in tools
- Schedule page (replaced by dashboard calendar)

### Very long term
- Android build

---

## GitHub

### Repository
- Private repo at Ine's GitHub account (created June 2026)
- Only source files tracked — personal data never committed

### .gitignore
```
lorekeeper-data.json
Companions/
Lorebooks/
Collections/
Worlds/
Personas/
node_modules/
assets/
*.ico
*.png
*.svg
```

### After each Claude session
```
git add src/ lorekeeper-master-spec.md
git commit -m "Brief description of what changed"
git push
```

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
| `lorekeeper-data.json` | no — personal data |
| `Companions/` `Lorebooks/` `Collections/` `Worlds/` `Personas/` | no — personal data |
| `node_modules/` | no — too large |

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

---

## What's Built
Full feature list — see sections above for details on each. Chronological build order is in the Session Log table.
