# LOREKEEPER — Master Specification
**Last updated: June 19, 2026 (session 10)**

---

## Platform & Stack
- **Runtime:** Electron (desktop app, Windows)
- **Renderer:** Single HTML file — React 18.2.0, Babel standalone 7.23.10, Tabler Icons 2.44.0 (all pinned)
- **Data:** Auto-saves to `I:\Lorekeeper\lorekeeper-data.json` (debounce configurable in Settings)
- **Images:** Stored as `image_relpath` file paths relative to `I:\Lorekeeper\` — NOT base64 in JSON
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
      character.json      ← auto-saved on every edit if companion_folder is set
      portrait.avif ...
  Lorebooks\
    lorebook.json         ← auto-saved on every edit if lorebook_filename is set
    cover.jpg
  Collections\
    collection.json       ← auto-saved on every edit if collection_filename is set
    banner.jpg
  Worlds\
    WorldName.jpg         ← world banners
  Personas\
    PersonaName.jpg       ← persona portraits
  node_modules\
    adm-zip\
```

---

## IPC Methods (preload.js → main.js)
| Method | Description |
|---|---|
| `loadData()` | Load lorekeeper-data.json |
| `saveData(data)` | Save lorekeeper-data.json |
| `exportFile({defaultName, content})` | Save dialog → write JSON |
| `importFile()` | Open dialog → read JSON string |
| `importImage()` | Open dialog → returns `{base64, srcPath}` |
| `importImages()` | Multi-select → returns `[{name, base64, srcPath}]` |
| `readImagePath(relPath)` | Read `I:\Lorekeeper\{relPath}` → base64 |
| `scanCompanions()` | Scan `Companions\` → folder results with JSON + image list |
| `scanLorebooks()` | Scan `Lorebooks\` → JSON results + `imageRelPath` if image found alongside JSON |
| `scanCollections()` | Scan `Collections\` → JSON + thumbnail + `imageRelPath` |
| `openFolder(relPath)` | Open in Windows Explorer |
| `getDataPath()` | Returns full path to data file |
| `saveCompanionJson(folderName, data)` | Write to `Companions\FolderName\character.json`; strips app-only fields |
| `saveLorebookJson(filename, data)` | Write to `Lorebooks\filename.json`; strips app-only fields |
| `saveCollectionJson(filename, data)` | Write to `Collections\filename.json`; strips app-only fields |
| `copyImageToFolder(srcPath, destFolder, filename)` | Copy image locally; skips if already in Lorekeeper folder or dest exists; returns `{relPath, base64}` |
| `writeImageFromBase64({base64, destFolder, filename})` | Write base64 to image file; checks dest exists first; returns `{relPath}` |
| `exportBackup({worldId?})` | Create zip — full or per-world; returns `{success, size, path}` |
| `exportPlatformZip({defaultName, files[]})` | Save dialog → zip pre-built JSON strings; returns `{success, size, path}` |
| `exportPlatformZip({defaultName, files[]})` | Save dialog → zip pre-built JSON strings; returns `{success, size, path}` |
| `restoreBackup()` | Open zip picker, extract files, return data for merge/replace |

---

## Data Model

### initData shape
```js
{ worlds:[], characters:[], lorebooks:[], collections:[],
  gallery:[], notes:'', personas:[], templates:[],
  release_cycle:[], schedule_notes:{}, lorebook_templates:[], settings:{} }
```

### World
- `id`, `name`, `short_description`, `tags[]`, `fandom_tags[]`
- `image` — base64 (legacy); `image_relpath` — `Worlds\WorldName.ext`
- `emoji` — single emoji shown in sidebar
- `pinned` — sorts first everywhere
- `notes` — per-world freeform scratchpad
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

### Settings
- `anthropic_api_key` — for Claude panel
- `claude_model` — default `claude-sonnet-4-6`
- `font_size` — `'small'` | `'normal'` | `'large'` | `'xlarge'`
- `autosave_debounce` — ms; default 600

---

## Saucepan Tags
540 tags embedded in the app across 15 categories. Valid for characters, lorebooks, and collections.

**21 Content Warning tags** — shown in red, excluded from the 25-tag cap: `dead_dove`, `noncon_dubcon`, `abuse`, `blackmail`, `slur_usage`, `self_harm_suicide`, `violence`, `gore`, `drugs_addiction`, `incest_stepcest`, `vore`, `cannibalism`, `feral`, `trauma`, `terminal_illness`, `user_harm`, `death`, `body_horror`, `eating_disorder`, `amputation`, `miscarriage`

---

## Navigation (Sidebar)
- **Dashboard** — calendar, today banner, upcoming, release cycle, site checklist, lorekeeper checklist, drafts in progress
- **Worlds** — world card grid
- **Characters** — all characters, filter by world
- **Lorebooks** — all lorebooks, filter by world or Standalone
- **Collections** — all collections, filter by world or Standalone
- **Personas** — player characters, independent from worlds
- **Templates** — global and per-world character creation templates
- **Batch Import** — scan folders, import, image audit, backup/restore
- **Settings** — API key, model, font size, debounce, theme/colorblind (placeholders)
- **Help** — 13 collapsible sections covering all features
- **Worlds list** — pinned first, emoji icon, right-click → pin/unpin
- **Sidebar collapse** — icons only mode
- **Logo** — clickable → Dashboard

### Right Panel (toggle button in top bar)
- **Notes** — world notes or global scratchpad; auto-saves
- **Tools** — 8 tools (Height, Names, Physicals, Nationality, Color, Text Diff, Personality, Plot)
- **Claude** — AI chat assistant with full world context
- **Map** — placeholder

---

## World Detail (sub-tabs)
**Characters · Lorebooks · Collections · Gallery · World Info**

**Characters** — home-world chars + chars in world's collections (cross-world)

**Lorebooks** — tab per lorebook with thumbnail; chapter editor with markdown preview; sidebar: cover image, image ID, short desc, tags (TagSelector), access level, definition protection, lorebook filename, export, delete

**Collections** — card grid → detail view; editable name/desc/tags (TagSelector)/world/image/filename; character picker

**Gallery** — all world images; hover shows: name, dimensions (W×H px), full Windows path (click to copy), extension badge

**World Info** — name, description, tags, emoji, banner upload, lorebook templates, plot archetypes, delete world

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

---

## TagSelector Component
- 540-tag list with descriptions, search + browse by category
- CW tags shown in red with ⚠ badge, excluded from 25-tag cap
- Freeform custom tags supported
- Click outside to close
- Wired to: Character Identity tab, Template editor, Lorebook sidebar, Collection detail view
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
2. **Scan Folders** — finds JSONs + images; badge: **new** / **update ↓** / **local newer ↑** / **up to date**
3. Auto-links characters to collections via `companions[]`
4. Sets `companion_folder`, `lorebook_filename`, `collection_filename`, `image_relpath` from scan
5. Tag chips shown per item with CW highlighting

### Image Storage Audit
- **Rescan images** — scans folders, links images via `image_relpath`
- **Audit base64** — finds legacy base64 items; shows relpath status
- **Migrate** — writes to files, sets `image_relpath`, clears base64; no duplicates

### Backup & Restore
- Full zip backup + per-world zip export
- Restore: global = full replace, world = smart merge
- Requires `adm-zip` (`npm install adm-zip` in `I:\Lorekeeper\`)

---

## Auto-Save to Disk
- Characters → `Companions\{folder}\character.json`
- Lorebooks → `Lorebooks\{filename}.json`
- Collections → `Collections\{filename}.json`
- New items auto-get folder/filename from name (sanitized, no trailing underscores); clearable to opt out
- `updated_at` stamped on every edit

---

## Image System
- All uploads copied to local folder via `copyImageToFolder`; stores `image_relpath`
- `ImgFromPath` + `ResolvedImg` components handle relPath and base64
- `ResolvedImg` fires `onDims` callback for gallery dimensions
- Supported formats: jpg, jpeg, png, gif, webp, avif
- Export strips all base64

---

## Platform Export Requirements
**Characters:** `display_name`, `name`, `short_description`, `full_description`, `card`, `tags[]` (min 5), `image.id`, `portraits[]`, `starting_scenarios[]`
Strips: `world_id`, `status`, `schedule_dates`, `posted_dates`, `collections`, `linked_lorebooks`, `companion_folder`, `site_last_synced_at`, `lorebook_entry_text`, `lorebook_entry_title`, all base64

**Lorebooks:** `image_id` (mandatory), `tags[]` (mandatory), `definition_protection` ≠ open
Strips: `world_id`, `lorebook_filename`, `image_data`, `image_relpath`, `selected_chapter_index`, `site_last_synced_at`

**Collections:** `image.id` (mandatory), `tags[]` (mandatory), `definition` (mandatory)
Strips: `world_id`, `collection_filename`, `image_data`, `image_relpath`, `site_last_synced_at`

---

## Dashboard

### Calendar
- Monday-start; overflow cells navigate months; click outside/re-click to deselect
- Purple chips = scheduled; green ✓ chips = posted (current month only, matched by posted_dates)
- Expanded day: scheduled chars + note input + Schedule button

### Today Banner
- Fires for `ready` chars scheduled today; mark posted / reschedule / dismiss
- Marking posted stamps `posted_dates` and sets `status = 'posted'`

### Site Checklist
- Shows items edited since last export: characters (status=posted), lorebooks/collections (has_been_public)
- Condition: `updated_at > site_last_synced_at` AND `site_last_synced_at` exists
- Export button stamps `site_last_synced_at` → item disappears from list
- `?` help button explains the 4-step workflow

### Lorekeeper Checklist
- Characters: posted with no `posted_dates`
- Lorebooks: no `image_id`, no local image, no tags, definition protection open
- Collections: no `image.id`, no local image, no tags, no description
- Only flags public or previously-public items

### Drafts in Progress
- All draft characters; missing-field amber tags; green ✓ ready when all filled

### Upcoming Panel + Release Cycle
- Next scheduled characters; configurable world posting order; drag to reorder

---

## Lorebook Entry Templates (per-world)

Separate from character creation templates. Used to create structured lorebook chapters.

**Setup (once per world):**
1. World → World Info → Lorebook Templates → New template
2. Set name, chapter title template (e.g. `{{CHARACTER NAME}} | POSITION | ROLE`), body template, target lorebook
3. Use `{{CHARACTER NAME}}` (uppercase) and `{{CHAR}}` (normal case) as placeholders

**Per character:**
1. Character editor → Lorebook Entry tab
2. Template pre-fills with character's name; edit title + body
3. Save to Lorebook — creates or updates chapter (matched by `char_id`, never duplicates)

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
- API key from Settings → Claude API; amber nudge if not set
- CSP allows `https:` so API calls work from Electron

---

## Settings Page

**Claude API** — API key (show/hide, save), model selector (Sonnet/Opus/Haiku)
**Appearance** — Font size (Small/Normal/Large/XLarge, applies immediately); Theme placeholder; Colorblind mode placeholder
**Data** — Data file path + Open Folder; Auto-save debounce (Fast 300ms / Normal 600ms / Slow 1s / Very Slow 2s)
**About** — Version info, deps, link to console.anthropic.com

---

## Tools Panel

| Tool | Description |
|---|---|
| Height | cm ↔ ft/in bidirectional; click to copy |
| Names | Masc/Fem/Neutral/Any; international pool |
| Physicals | Eyes, Hair, Build; roll individually or all |
| Nationality | 100+ nationalities; region filter; languages + currency |
| Color | HSL sliders + 6 harmony modes; click swatches to copy hex |
| Text Diff | Word-level diff; green/red highlights; added/removed counts |
| Personality | Literary Archetypes (77), MBTI (16), Jungian (13), Attachment Styles (4); Roll All + Copy All |
| Plot | 100 global archetypes + per-world custom pool; filter global/world/any |

---

## Help System

- Help page in sidebar — 13 collapsible sections
- Sections: Dashboard, Characters, Lorebooks, Collections, Lorebook Templates, Batch Import, Image Storage Audit, Backup & Restore, Character Templates, Tools, Auto-save, Settings, Claude AI
- Each has plain explanations, numbered steps, tip callouts
- Inline `?` buttons: Site Checklist, Batch Import, Lorebook Entry tab, Lorebook Templates manager

---

## Long-term Vision
Lorekeeper as full local backup and source of truth — independent of Saucepan. All content mirrored locally. Images as files. Export-ready even if the site goes down.

---

## What's Next (Priority Order)

### Immediate — features first, then polish
Build out all remaining functionality before tackling UI consistency or standalone packaging.

### Export to Markdown ✓
Export clean `.md` files added to character (Export tab), lorebook (Edit/Export tabs), collection (Edit/Export tabs).
- **Character sheet** ✓ — `# Display Name`, short desc, full desc, character card, advanced prompt, formatting instructions, scenarios, tags; preview in-app
- **Lorebook** ✓ — `# Name`, each chapter as `## Title` + body; preview in-app
- **Collection** ✓ — `# Name`, description, character list, tags
- **Persona** — todo
- **Template** — todo

JSON export moved from topbar button into Export tab on each item.

### Image Tools
- **Format converter** — convert any local image (PNG/JPG/WEBP/AVIF etc.) to a target format; useful for Saucepan which prefers AVIF; uses `sharp` npm package
- **Paste & save** — paste image from clipboard → preview → save as a file to a chosen folder (Companions/CharName, Lorebooks, Collections, etc.); replaces manual screenshot workflow
- **Cropper** — crop a local or pasted image to a target aspect ratio (3:4 portrait, 4:1 banner, 1:1 square); canvas-based UI; 16:9 dropped — Saucepan banners are actually 4:1
- **Image prompt generator** — Claude call using character name/description/tags to generate an image generation prompt; lives in character editor or right panel

### New Tools
- **Map generator** — region/landmark randomiser; output as text description or simple ASCII map (deferred — design TBD)
- **Powers generator** ✓ — EsperTool: rolls ability type, tier, drawback, codename
- **Hockey positions** ✓ — HockeyTool: rolls position, role description, handedness, character trait
- **Swim strokes** ✓ — SwimTool: rolls stroke, event distance, stroke description, swimmer archetype

### Tools (future) ✓ (partial)
- Western Zodiac ✓ — WesternZodiacTool: rolls sign, element/modality, traits, shadow side, vibe
- Chinese Zodiac ✓ — ChineseZodiacTool: rolls sign, element, years, traits, shadow side, vibe
- Relationship dynamic generator — still todo

Note: Esper powers use F–S rank letters (not named tiers). Tool icons must exist in Tabler 2.44.0 — `ti-files-diff` and `ti-waves` don't; replaced with `ti-scan` and `ti-send`.

### Bigger features
- **Relationship Map** ✓ — lives in right panel Map tab (expands panel to 640px); world picker; SVG canvas with draggable portrait+name nodes (uses `name` not `display_name`); labeled edges fixed to line midpoint; click line/label to open draggable edit popup (drag via ⠿ handle, reads actual DOM position to avoid jump); edit label or delete; saves to `data.relationships`; collection-aware character filter (same logic as WorldDetailPage — includes chars via world_id OR via collections belonging to that world)

### Once all features are done
- **UI Overhaul** — consistent layout system across all pages (widths, padding, section headers, card styles, field spacing); audit Characters, Lorebook detail, Collection detail, World tabs, Batch Import, Settings, Tools, Dashboard checklists
- **Global themes** — light/dark + accent color
- **Colorblind mode** — deuteranopia, protanopia, tritanopia
- **Standalone / Public Version** — configurable data path, strip Saucepan-specific stuff, packaged `.exe`, optional rename/theming

### Won't do
- Per-world color theming
- Age calculator in tools
- Text stats in tools
- Schedule page (replaced by dashboard calendar)
- README.md

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

### Commit messages by session
- Session 1: `Core app: batch import, dashboard, calendar, lorebooks, collections, backup`
- Session 2: `TagSelector, personality/plot tools, nationality/color/diff tools, site checklist`
- Session 3: `Claude integration, lorebook templates, help page, settings, tag suggestions`
- Session 4: `Fix Babel syntax errors, ScanBadge/ScanTagChips, batch import tag chips`
- Session 5: `Sidebar Backup button, world Export ZIP (platform-ready stripped JSONs)`
- Session 6: `Export to Markdown — CharExportTab, LoreExportPanel, CollExportPanel, CollEditPanel; tab bars on lorebook and collection detail`
- Session 7: `Persona + Template Export MD buttons`
- Session 8: `EsperTool, HockeyTool, SwimTool — data tables + roll components in ToolsPanel`
- Session 9: `WesternZodiacTool, ChineseZodiacTool; RelationshipsPage (SVG relationship map with draggable portrait nodes + labeled edges)`
- Session 10: `Fix relationship map — collection-aware char filter (Gabriel), fixed label positions, draggable edit popup, correct icon replacements for Tabler 2.44, esper rank letters F–S`
- Session 6: `Export to Markdown: CharExportTab, lorebook Edit/Export tabs, collection Edit/Export tabs`

### What goes in the repo
| File | Tracked? |
|---|---|
| `src/index.html` | ✓ |
| `src/main.js` | ✓ |
| `src/preload.js` | ✓ |
| `start-silent.vbs` | ✓ |
| `start.bat` | ✓ |
| `.gitignore` | ✓ |
| `lorekeeper-master-spec.md` | ✓ |
| `lorekeeper-data.json` | ✗ personal data |
| `Companions/` `Lorebooks/` `Collections/` `Worlds/` `Personas/` | ✗ personal data |
| `node_modules/` | ✗ too large |

---

## What's Built ✓

### Session 1 (June 17)
Core app structure, world/character/lorebook/collection/persona management, auto-save to disk, image system (relpath), batch import with timestamp badges, dashboard (calendar, today banner, release cycle, drafts in progress, lorekeeper checklist), character templates, backup/restore (adm-zip), tools (height, names, physicals), markdown preview, drag to reorder (portraits, scenarios, release cycle), sidebar collapse, quick find (Ctrl+K)

### Session 2 (June 18)
Collections top-level page, TagSelector with 540 Saucepan tags + 21 CW tags, tag templates, world tag suggestions ("Common in this world"), personality tool (Literary/MBTI/Jungian/Attachment), plot tool (100 global + per-world custom), nationality/color/text diff tools, site checklist (updated_at vs site_last_synced_at), export stamps site_last_synced_at, standalone lorebook navigation fix, personas render fix, image audit improvements, custom dark-mode HSL color picker

### Session 3 (June 18)
Claude integration (right panel chat, full world context, API key from Settings), lorebook entry templates (per-world, title + body template, save to lorebook by char_id), help page (13 collapsible sections) + inline ? buttons, Settings page (API key, model, font size, debounce, theme/colorblind placeholders), auto-fill folder/filename on new character creation, TagSelector wired to lorebook sidebar + collection detail view

### Session 4 (June 18)
Fixed all Babel syntax errors, extracted ScanBadge/ScanTagChips, batch import tag chips

### Session 5 (June 18)
Sidebar Export → Backup (wired to full zip); world topbar Export ZIP button (exportWorldPlatformZip — builds platform-ready stripped JSONs for all posted chars + public lorebooks/collections, packages into dated zip, stamps site_last_synced_at); exportPlatformZip IPC handler in main.js + preload.js

### Session 6 (June 18)
Export to Markdown: CharExportTab component (JSON + MD with preview and field checklist), LoreExportPanel (JSON + MD with preview), CollExportPanel (JSON + MD), CollEditPanel; lorebook editor and collection detail get Edit/Export tab bars; all export components use CSS classes to avoid Babel double-brace issues; lore tabs use if/return pattern; CSS classes: .export-card, .export-panel, .export-row, .export-card-title/desc/meta, .export-field-ok/missing, .lore-tab-bar, .coll-tab-bar, .lore-tab-btn, .md-preview

### Session 5 (June 18)
Sidebar Export → Backup button (wired to full zip via exportBackup); world topbar Export ZIP (exportWorldPlatformZip — platform-ready stripped JSONs for posted chars + public lorebooks + public collections in a dated zip, stamps site_last_synced_at); new exportPlatformZip IPC handler in main.js + preload.js


### Session 6 (June 18)
Export to Markdown — CharExportTab component (JSON + MD with in-app preview, field checklist), lorebook editor Edit/Export tab bar (MD export with preview), collection detail Edit/Export tab bar (MD export); JSON export moved from topbar into Export tabs on all three