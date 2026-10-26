# CodeRecall

Personal code library with ranked search, a file explorer, an editor, and optional Supabase accounts/cloud backups. Requires Node.js 22+.

## Local setup

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The frontend and API run together; `/api` requests proxy to the API, which defaults to port 8000 and respects `PORT` in the root `.env` file. Use `npm run dev:client` or `npm run dev:api` to run either separately.

The interface opens in **Find code** mode. Switch to **Explorer** for file organization; your mode choice is remembered. The sidebar contains a virtual root, `D:`, and starred folders. This root does not access your computer's actual D: drive. Existing browser libraries migrate without changing their code.

## Find code

Search by names, descriptions, tags, and ancestor folder context. Words can match across these fields, so `math addition` and `addition math` have identical rankings. Every word must match; exact names and tags carry more weight than descriptions and inherited context. A directly matching **Math** folder appears above files that only inherit its context. Folders containing a matching descendant also appear as navigable results. This is deterministic metadata search, with no AI service, embedding setup, or external search requests.

The grid has four square cards across on desktop, three/two at intermediate widths, and one per row on phones and narrow windows (600px or less). File cards show highlighted saved code with a fade; use **Copy code** or **Edit** without opening the full preview. Click a card to read the complete highlighted code with line numbers and its description on the right. The notes panel can be hidden, resized by dragging its divider, or expanded to fill the preview. On phones, **Code** and **Notes** switch between full-width panes. Folder cards show their top three ranked direct children; a child file opens directly, and a child folder drills down. The query and tag filters stay active while navigating with folders, breadcrumbs, Back, or Up. Inside an opened folder, other children stay available after the best matches so you can keep exploring. Typing a new query searches that scope and its descendants again.

Use the info button on any card, or **Explorer → Details**, to edit descriptions, tags, and icons on files **and folders**. Descriptions save when leaving the field, with a Save button and Ctrl/Cmd+Enter shortcut. Tags and icon choices save immediately. Folder tags and descriptions contribute context to their descendants; selected Find tag filters include this inherited context. `#name` restricts Find searches to tag words. `/`, Ctrl/Cmd+F, and Ctrl/Cmd+K focus search.

The searchable icon picker includes 44 icons from the supplied vscode-icons collection, with automatic language/folder matching and a manual override for every item. Stable icon IDs are stored with the library; SVG assets ship with the app. To extend the collection, see [the icon guide](frontend/public/icons/README.md).

## Explorer and editor

Use **New** in Find code or Explorer to create a folder or choose from common programming files, including Python, JavaScript, TypeScript, React, Java, HTML, CSS, C/C++, C#, Go, Rust, PHP, SQL, JSON, Markdown, and text. Each choice has its language icon. Choose **Other…** to enter a complete filename such as `Example.java` or `script.rb`; the extension determines the displayed type and automatic icon. The creation dialog previews the final filename. The details table shows name, creation date, modification date, type, and size; click any column heading to sort in either direction. The Sort menu offers the same fields, and View changes row spacing.

Double-click folders to open them, use the breadcrumb/path bar to navigate, or type a folder path with Alt+D. Search covers the current folder and its descendants. Use the toolbar or right-click menu to rename, cut, copy, paste, move, delete with undo, or star folders. Ctrl-click/Shift-click selects multiple items; arrow keys navigate the file list. Drag items into folders to move them, or hold Ctrl/Alt to copy.

New files open directly in a dark code editor with syntax colors and the file-type icon beside the filename. Double-click an existing file, press Enter on it, or choose **Edit file** from its menu to edit its content. The editor includes undo/redo, line numbers, indentation, word wrap, and cursor position. Save with **Save** or Ctrl/Cmd+S; undo code with Ctrl/Cmd+Z and redo with Ctrl/Cmd+Shift+Z or Ctrl+Y. Tab indents, Shift+Tab outdents, and Enter keeps the current indentation. Common languages receive syntax colors; unfamiliar extensions remain readable as plain text.

Every file has a **File notes** panel for its description and explanation. Select text to change its font size, bold, italic, or underline; Ctrl/Cmd+B, I, and U also work in notes. Code and notes save together, and both participate in the unsaved-changes prompt. Hide the panel with **Notes** or its close button, drag the divider to resize it, and use its expand button for a full-width writing space. On phones, **Code** and **Notes & description** switch panes without losing either draft. Notes support up to 4,000 characters; their plain text remains searchable and formatting is preserved in copies and JSON/cloud backups.

File contents are saved in the browser-local library, with UTF-8 byte sizes and updated modification dates. Copies retain their code, descriptions, tags, and icons. Leaving an unsaved file offers Save, Discard, or Cancel; closing or reloading the browser also warns about unsaved changes. Clearing browser data removes the local library and its recovery copy; use JSON or cloud backups to keep another copy.

Use **Tags** in the editor, or select an item and open **Details → Edit tags**, to assign multiple custom tags. Type a name and choose **Create** (or press Enter) to create and assign it immediately. Check or uncheck existing tags to reuse or remove assignments. Tag changes do not reset an unsaved code draft.

Explorer's compact search matches item names and their own tags, with `#name` for tags only. Selecting multiple tag filters requires all of them. Use Find mode for relevance ranking, descriptions, folder context, and code previews.

For a production build, run `npm run build`, then `npm start`. Express serves the built interface and API together at http://localhost:8000 (or the configured `PORT`).

## Accounts and backups

**Account & backup** provides local JSON export/import without any account. Imports and cloud downloads require a concrete replacement confirmation and save one previous local library for recovery. Cloud is optional: set the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables and apply the included SQL migrations to enable email/password accounts, profiles, and private cloud snapshots.

Signing in never transfers data automatically. Upload your saved library on one device, then download it on another. Revision checks reject stale uploads rather than silently overwriting a newer snapshot. Cloud snapshots are limited to 4 MiB; no per-file merge or background sync is included. Authentication and library transfers use the Supabase browser SDK directly. Never use a secret/service-role key in browser variables.

Accounts appear under **Supabase → Authentication → Users**. To also see usernames and IDs in **Table Editor → public → profiles**, apply `supabase/migrations/202610210002_profiles.sql`. It backfills existing accounts and adds a trigger for future signups and username changes. Passwords, emails, and tokens stay in Auth. A `library_snapshots` row appears only after uploading a library.

Follow [the detailed Vercel and Supabase setup guide](docs/DEPLOYMENT.md) for the table/RLS migration, email confirmation, environment variables, deployment, phone setup, backups, icons, and troubleshooting.

## API

| Method | Path | Input |
| --- | --- | --- |
| GET | /api/health | Liveness check; does not contact Supabase |

The unused Express authentication routes were removed; the interface uses one Supabase SDK authentication flow. Supabase stores passwords, manages sessions, and handles email confirmation. Username is optional display metadata, not a unique account identifier or authorization attribute.

Apply both migrations in `supabase/migrations/` in filename order. The first creates private, versioned library snapshots with ownership policies; the second creates private profiles synchronized from Auth. On an existing project where snapshots already work, apply only the new profiles migration.

## Deploy to Vercel

Use the repository root and Express preset. The root `app.js` directly imports Express, creates the app, configures it through `backend/src/app.js`, and exports it. Keep the direct Express import in this recognized entry point so Vercel can detect it; the local listener remains separate. `vercel.json` runs `node scripts/build-vercel.mjs`, which builds Vite and copies `dist/` to the generated root `public/` for Vercel's static CDN. Keep the output-directory override disabled; preserve the Express API routes. Source assets belong in `frontend/public/`.

Set the two `VITE_SUPABASE_*` variables for Production/Preview, then redeploy after changes. Browser values are embedded at build time. Legacy unprefixed Supabase variables are no longer used. Full steps: [deployment guide](docs/DEPLOYMENT.md).

Reference: [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [Supabase JavaScript setup](https://supabase.com/docs/reference/javascript/initializing).

## Checks

Run `npm test` for hierarchy, search ranking, metadata, tags, editor history, cloud transfer/conflict, and API checks. Run `npm run build` for the frontend, or `node scripts/build-vercel.mjs` to verify Vercel packaging. Live authentication, email delivery, RLS, and deployment checks require your own configured Supabase/Vercel accounts.
