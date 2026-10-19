# CodeRecall

React library interface with an Express API and optional Supabase authentication. Requires Node.js 22+.

## Local setup

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The frontend and API run together; `/api` requests proxy to the API, which defaults to port 8000 and respects `PORT` in the root `.env` file. Use `npm run dev:client` or `npm run dev:api` to run either separately.

The interface works like a compact file explorer. Its sidebar contains one virtual root, `D:`, and an independently scrollable list of starred folders. This root is browser-local storage; it does not access your computer's actual D: drive. Existing library data is preserved.

Use **New** to create a folder or an empty Python (`.py`) or JavaScript (`.js`) file. The details table shows name, creation date, modification date, type, and size; click any column heading to sort in either direction. The Sort menu offers the same fields, and View changes row spacing. Existing text files remain supported.

Double-click folders to open them, use the breadcrumb/path bar to navigate, or type a folder path with Alt+D. Search covers the current folder and its descendants. Use the toolbar or right-click menu to rename, cut, copy, paste, move, delete with undo, or star folders. Ctrl-click/Shift-click selects multiple items; arrow keys navigate the file list. Drag items into folders to move them, or hold Ctrl/Alt to copy.

New files open directly in a simple code editor. Double-click an existing file, press Enter on it, or choose **Edit file** from its menu to edit its content. The editor includes undo/redo, line numbers, indentation, word wrap, and cursor position. Save with **Save** or Ctrl/Cmd+S; undo with Ctrl/Cmd+Z and redo with Ctrl/Cmd+Shift+Z or Ctrl+Y. Tab indents, Shift+Tab outdents, and Enter keeps the current indentation.

File contents are saved in the same browser-local library, with UTF-8 byte sizes and updated modification dates. Copies retain their code. Leaving an unsaved file offers Save, Discard, or Cancel; closing or reloading the browser also warns about unsaved changes. Account integration and backend library storage come later. Clearing browser data removes this prototype library.

Use **Tags** in the editor, or select a file and open **Details → Edit tags**, to assign multiple custom tags. Type a name in the tag list and choose **Create** (or press Enter) to create and assign it immediately. Check or uncheck existing tags to reuse or remove assignments. Tag changes save automatically and do not save, discard, or reset an unsaved code draft.

Search matches file names and tag names; use `#name` to search tags specifically. **Filter tags** finds files in the current folder and its descendants; selecting multiple tags requires all of them. Remove individual filter chips or choose **Clear tag filters** to return to the normal listing. Copies keep their tags, and existing browser-local libraries migrate without changing their code.

For a production build, run `npm run build`, then `npm start`. Express serves the built interface and API together at http://localhost:8000 (or the configured `PORT`).

Supabase is only needed to use the authentication API. Copy `.env.example` to `.env`, preserving existing values, and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from your Supabase project. Enable email/password authentication and configure the Site URL and allowed redirect URLs. MONGODB_URI is no longer used.

## API

| Method | Path | Input |
| --- | --- | --- |
| GET | /api/health | Liveness check; does not contact Supabase |
| POST | /api/v1/users/register | JSON: username, email, password (10+ characters) |
| POST | /api/v1/users/login | JSON: email, password |
| POST | /api/v1/users/logout | Authorization: Bearer access_token; JSON: refresh_token |

Registration stores username in Supabase user metadata; it is not unique or an authorization attribute. Supabase handles password storage. With email confirmation enabled, signup returns no session until confirmation. Login returns user and session tokens. The frontend must store and refresh its session (prefer the Supabase client SDK), then remove its tokens on logout. Existing access tokens can remain valid until expiry after logout.

No application tables are created yet. Add SQL migrations under `supabase/migrations/` when introducing domain data, and enable Row Level Security with appropriate policies. Use a client carrying the user's access token for protected database requests; never use a secret/service-role key in the frontend.

## Deploy to Vercel

The root `app.js` exports the Express app; the local listener is separate. For an Express deployment, run `npm run build` as part of the build and include the generated `dist` directory so the interface is available. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the deployment environment when using authentication.

Set environment variables for each desired environment (Production/Preview) and redeploy after changes. For a separately hosted frontend, configure an explicit CORS allowlist before connecting it.

Reference: [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [Supabase JavaScript setup](https://supabase.com/docs/reference/javascript/initializing).

## Checks

Run `npm test` for library hierarchy tests and local API smoke tests. Run `npm run build` to check the production frontend bundle. Live authentication requires your own configured Supabase project.
