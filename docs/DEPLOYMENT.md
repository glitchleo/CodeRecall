# Deploy CodeRecall to Vercel with Supabase

This guide matches this repository: React + Vite in `frontend/`, an Express app exported from the root `app.js`, and optional Supabase accounts with a private library snapshot per account. You need Node.js 22 or later, a Git provider account, a Vercel account, and a Supabase account. No deployment or Supabase project is created by running the local app.

## 1. Understand where your data goes

CodeRecall works without an account. Edits save in the current browser's `localStorage`, under `coderecall.library.v1`. A different browser, phone, domain, or Vercel preview has its own local library. The displayed drive is a virtual library; it does not expose a real Windows drive.

With Supabase configured, **Account & backup** offers email/password accounts and explicit cloud transfers:

- **Upload this library** stores the current saved library in your account. Replacing an existing cloud snapshot requires confirmation.
- **Download cloud library** fetches a preview. **Replace local library** loads it only after confirmation and first saves one local recovery copy.
- Signing in never uploads or downloads automatically. Edits after an upload stay on that browser until you upload again. Save or close the editor before transferring.
- Two uploads using the same cloud revision cannot silently overwrite each other: the second receives a conflict. Download/review the other version before uploading again. There is no per-file merge or real-time collaboration.
- **Export JSON backup** and **Import JSON backup** work even without Supabase. Imports ask before replacing your library and keep a recovery copy.

The `public.library_snapshots` table stores one JSON document per user: files, code, folder hierarchy, names, timestamps, descriptions, tag catalog, file/folder tag assignments, starred state, and selected icon IDs. Its revision and timestamps are maintained by a database trigger. Cloud snapshots are limited to 4 MiB of serialized JSON by the client; the database also enforces a 5 MiB JSON-text limit. This is a small personal code library, not a large repository or binary-file store.

Accounts are managed in **Authentication → Users**. The separate `public.profiles` table makes account IDs, usernames, and creation dates visible in Table Editor. It is populated from Auth by a database trigger and is readable only by its owner through the app. Email addresses, passwords, and tokens stay in Supabase Auth. See [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data).

**Important when moving to your deployed domain:** the browser cannot transfer localhost storage to your production domain automatically. Open your old local app and export a JSON backup first. On the deployed app, import that backup, check your files, sign in, and upload. Keep the exported file until both desktop and phone have the right library.

## 2. Create the Supabase project

1. Sign in to the [Supabase dashboard](https://supabase.com/dashboard).
2. Choose **New project**, select your organization, name the project, create a strong database password, and choose a suitable region. Keep the database password in your password manager; the app does not use it.
3. Wait until the project is ready.
4. Open the project's **Connect** dialog to copy the **Project URL** and **Publishable key**. You can also find keys under **Settings → API Keys**. Use the key beginning with `sb_publishable_`; a legacy `anon` key also works. Never paste an `sb_secret_` or `service_role` key into CodeRecall's browser variables. Supabase documents the public/private key distinction in its [API keys guide](https://supabase.com/docs/guides/getting-started/api-keys).

The URL resembles `https://your-project-ref.supabase.co`. Use the API URL, not a dashboard URL, database connection string, or a `/rest/v1` URL.

## 3. Create the library and profile tables

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. On a new project, open `supabase/migrations/202610210001_library_snapshots.sql`, paste the entire file, and run it once. It creates the snapshot table, grants, ownership policies, and revision trigger. Skip this file if you already applied it.
3. Open `supabase/migrations/202610210002_profiles.sql`, paste the entire file into a new query, and run it as the **postgres** role. It creates the profiles table, owner-only read policy, Auth triggers, and backfills existing accounts. You can rerun this second migration without deleting profiles or accounts.
4. In **Table Editor → public**, check that both `library_snapshots` and `profiles` exist and Row Level Security is enabled. Existing Auth users should now have profiles; refresh the table list if needed.
5. Snapshot policies permit selecting, inserting, and updating only the signed-in user's row. Profiles permit reading only the signed-in user's row, and their values are maintained by the Auth triggers. Anonymous users receive no access to either table. Do not disable RLS to fix an error. See [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

The snapshot table starts empty; a row appears only after a successful **Upload this library**. Profiles are created as soon as Auth creates the account, including before email confirmation. A missing snapshot after signup is expected. Do not insert accounts or passwords into either table. Their user IDs reference `auth.users.id`; deleting an Auth user cascades to the corresponding profile and snapshot.

The first migration intentionally creates new objects without replacing existing ones. If it reports “already exists,” check whether it already ran instead of dropping data. For an existing incompatible table, back it up and reconcile its schema before proceeding. The second migration replaces only its own policy, triggers, and function, while preserving profile rows and creation dates.

**CLI alternative:** if you already use the Supabase CLI, run `supabase init` in the repository if needed, `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`. Use either the SQL Editor workflow or the tracked CLI migration workflow consistently; pasting SQL does not automatically update CLI migration history.

## 4. Configure email/password authentication

1. In Supabase **Authentication → Sign In / Providers**, enable **Email**. Keep **Allow new users to sign up** enabled while creating accounts.
2. Leave **Confirm email** enabled for a public deployment. CodeRecall accepts passwords of at least 10 characters at signup; if you configure stricter requirements in Supabase, follow those requirements too.
3. In **Authentication → URL Configuration**, initially set the **Site URL** to `http://127.0.0.1:5173/` for local testing. After deployment, change it to your stable production URL, for example `https://your-project.vercel.app/`.
4. Add these exact **Redirect URLs** for the environments you use:

   ```text
   http://127.0.0.1:5173/
   http://localhost:5173/
   https://your-project.vercel.app/
   https://your-custom-domain.example/
   ```

5. Add a preview deployment's exact origin plus `/` if you want signup confirmation to return there. Prefer exact production URLs; use only narrowly scoped preview patterns if needed. Supabase's [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls) explains allowlists and Vercel preview wildcards.
6. Keep the default confirmation template using `{{ .ConfirmationURL }}`. This browser app lets the Supabase SDK process the session on return to `/`; it does not implement a custom `/auth/confirm` server endpoint. A template copied from an SSR tutorial can redirect to a route this app does not handle.
7. Configure **Authentication → Email → SMTP Settings** for dependable email delivery to real users. The built-in sender is restricted and intended for testing; use your email provider's SMTP details and a verified sender/domain for production. Check the current [Supabase custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) for delivery restrictions and setup.

The app sends `emailRedirectTo` using its current browser origin. With email confirmation enabled, account creation normally asks you to check your email; it does not imply you are signed in yet. Confirm the email, then sign in if the session was not restored. Username is optional display metadata, not a unique account identifier.

## 5. Configure and verify locally

From the repository root in PowerShell:

```powershell
npm ci
```

If you do not already have a root `.env`, create it from `.env.example`. Preserve any existing real values:

```powershell
Copy-Item .env.example .env
```

Edit the root `.env`:

```dotenv
PORT=8000

# Browser auth and library transfers, evaluated by Vite at build time.
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

The browser uses the Supabase SDK directly for authentication and RLS-protected library requests. Express serves the built app and `/api/health`; the unused duplicate authentication routes have been removed. The old unprefixed `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` variables are no longer read and can be removed from deployment settings.

Only `VITE_` variables are exposed to frontend code. The publishable key is designed to be public; RLS and authenticated user sessions protect the data. This app needs no database password, service-role key, SMTP password, or Supabase secret key in `.env`. Keep `.env` out of Git. Restart Vite after changing variables.

Run:

```powershell
npm run dev
```

1. Open `http://127.0.0.1:5173/`.
2. Open **Account & backup**, create an account, and confirm the email if required.
3. In Supabase **Authentication → Users**, check that the account exists. In **Table Editor → public → profiles**, verify its matching ID and optional username. If the Auth account exists but the profile is missing, apply the second migration; its backfill handles existing accounts.
4. Sign in, add a test file/folder/tag/description, save the file, and upload. In Table Editor, verify one `library_snapshots` row exists for that user's ID.
5. Open an incognito window at the same URL, sign in, download, review the counts, and replace the local library. Check the code and tags.
6. Use a second account in another browser context. It should start with no cloud snapshot and never see the first account's row. Signed-out API requests should not read or write library rows.

You can keep cloud disabled by leaving both `VITE_SUPABASE_*` variables empty. Search, local editing, JSON export/import, and icons still work.

## 6. Push the repository

1. Run `npm test` and `npm run build` from the root. Resolve failures before deploying.
2. Ensure your source changes, `package-lock.json`, `vercel.json`, scripts, frontend public assets, and SQL migration are committed and pushed to your Git provider.
3. Do not commit `.env`, `node_modules/`, generated `dist/`, or generated root `public/`. The root `public/` is deployment output; source assets belong under `frontend/public/`.

If using an existing Vercel project, inspect and remove stale dashboard overrides left over from deploying this repository as only a Vite app.

## 7. Import into Vercel

1. In Vercel, choose **Add New → Project** and import your repository.
2. Set the **Root Directory** to the repository root (`./`), not `frontend/` or `backend/`.
3. Use the **Express** framework preset. This repository's `vercel.json` sets `"framework": "express"`. Root `app.js` directly imports `express`, creates the application, configures its routes through `backend/src/app.js`, and exports it. Keep that direct import in the root entry point; a wrapper that only re-exports a nested backend file does not satisfy Vercel's Express detection.
4. Set the project's **Node.js version** to 22.x, or a currently supported newer version compatible with the package's `>=22` engine.
5. Keep the install command as `npm ci` (or Vercel's npm default).
6. Use build command `node scripts/build-vercel.mjs`, supplied by `vercel.json`. Remove a dashboard build override that runs only `npm run build`.
7. Leave the **Output Directory** override disabled/default for Express. Do not configure this as a static-only `dist` deployment and do not add a blanket rewrite that sends `/api/*` to `index.html`.
8. Add the two `VITE_SUPABASE_*` variables from step 5 in **Environment Variables**, with your real URL and publishable key. Choose **Production**, and **Preview** too if you want accounts in preview deployments. `PORT` is unnecessary on Vercel.
9. Deploy. Check the build logs for the Vite build and `Vercel static assets prepared in public/`.

The deployment script builds Vite into `dist/`, then copies the complete result, including icons, into the root `public/` for Vercel's CDN. Local `npm run build` + `npm start` still serves `dist/` with Express. This extra packaging is required because Vercel's Express integration ignores `express.static()` and serves static files from `public/**`. The [official Express deployment documentation](https://vercel.com/docs/frameworks/backend/express) describes entry points and static assets.

Browser `VITE_` variables are embedded into JavaScript during the build. Adding or correcting them in Vercel requires a **new deployment**. Updating only runtime settings cannot change an already-built frontend bundle.

## 8. Finish production auth and test on your phone

1. Open the deployed URL and copy its stable production origin.
2. Return to Supabase **Authentication → URL Configuration**. Update **Site URL** and add that exact URL plus `/` to the redirect allowlist.
3. If using a custom domain, add it in Vercel **Settings → Domains**, complete the DNS instructions Vercel provides, wait for HTTPS, and add that origin to Supabase too. Prefer one stable domain for everyday use; changing domains creates separate browser-local storage and auth sessions.
4. Visit `https://your-domain/api/health`. Expect `{"status":"ok"}`. This checks Express routing, not Supabase connectivity.
5. Visit `/` and confirm the search grid, icons, and account dialog load. Inspect the browser Network panel if assets fail.
6. Create/sign in to your account. Import the JSON backup from your old app if necessary, inspect it, and upload.
7. On your phone, open the same HTTPS URL, sign in to the same account, and choose **Download cloud library → Replace local library**. Check folder navigation, code previews, copy, and the file viewer.
8. Edit/save on the phone and upload. On desktop, download that revision before making the next changes. Alternate this way between devices to avoid competing edits.
9. For a simple concurrency check, open the account panel on two devices at the same cloud revision. Upload a change on one, then try uploading from the other without refreshing its status. The second should report a conflict and retain its local work.

No actual Vercel deployment, email delivery, or live Supabase policy test is confirmed by a local build. Complete these checks using your own configured accounts.

## 9. Icons and Supabase Storage

Each node's chosen `iconId` is included in the cloud JSON snapshot, so the selection travels with its file/folder. The SVG catalog itself ships as static website assets. You do not need a Supabase Storage bucket for the included icons, and the app does not currently upload arbitrary icon binaries into Supabase.

The included catalog contains 44 SVGs curated from the supplied vscode-icons 13.0.0 folder. To add more:

1. Copy the desired SVG into `frontend/public/icons/` and retain its license/attribution. The included MIT notice is `frontend/public/icons/LICENSE-vscode-icons.txt`.
2. Add an `icon(id, label, asset, keywords, associations)` entry to `frontend/src/lib/icons.js`. `asset` is the SVG filename without `.svg`; choose a permanent new `id`.
3. Add optional `extensions`, `filenames`, or `folderNames` associations for automatic selection, and useful `keywords` for picker search.
4. Run the build and deploy the new assets/catalog together. The picker exposes entries to both files and folders. See `frontend/public/icons/README.md` for details.

Keep existing IDs stable because saved snapshots reference them. **Automatic** uses the name/extension association; unknown IDs fall back to it. Merely uploading an image to a bucket does not add it to the picker.

If you later implement user-uploaded icons, put binaries in a Storage bucket and store a stable object key in each node, then add authenticated Storage policies for per-user paths and signed URL retrieval for private assets. That is a separate feature: this release uses a deployed SVG catalog plus database-stored selections.

## 10. Backups, recovery, and troubleshooting

Before imports/downloads replace local data, CodeRecall saves one previous library under `coderecall.library.before-cloud.v1`. **Restore previous local library** switches back and preserves the current library as the next recovery copy. This is one recovery slot, not a history. Keep periodic JSON exports outside the browser. Clearing site data/private browsing can remove both local copies; signing out does not erase them.

| Symptom | What to check |
| --- | --- |
| “Cloud is optional” appears | Both `VITE_SUPABASE_*` variables must exist at build time. Restart local Vite or redeploy Vercel. Setting only unprefixed server variables is insufficient. |
| Account is missing from Table Editor | Check **Authentication → Users** first. Run `202610210002_profiles.sql` and open **public → profiles**; the migration backfills existing accounts. Signup alone does not create a library snapshot. |
| Account works but upload says table is missing | Run `202610210001_library_snapshots.sql` against the same project used by the browser URL/key. |
| Upload is denied | Confirm the session is signed in, RLS policies exist, `authenticated` has the migration's grants, and the account belongs to this project. Never fix it by using a service-role key in the browser. |
| Confirmation returns to localhost or an unexpected page | Fix Supabase Site URL, exact redirect allowlist, and email template. Request a new confirmation email; previously issued links may retain their old target. |
| Confirmation email never arrives | Check spam, Supabase Auth logs, SMTP setup, sender verification, and current email/rate restrictions. |
| Invalid key / failed fetch | Use the project API origin and publishable key from the same project. Confirm the project is available, network access works, and browser extensions are not blocking it. |
| “Invalid login credentials” | Check email/password, confirmation status, and that the frontend points to the intended project. The app has no self-service password-reset screen yet. |
| The other device has old files | Upload the saved library on the source device, then download/confirm on the destination. There is no background sync. |
| A cloud revision conflict appears | Export your local version, download/review the cloud version, then decide which library to upload. JSON import can restore an exported version; no automatic merge is attempted. |
| Recovery copy cannot be saved | Export JSON first, free browser storage, then retry. Replacement is blocked when its recovery copy cannot be saved. |
| Library exceeds 4 MiB | Keep a JSON backup and reduce code/data in the library, or extend the snapshot design and server limits deliberately. |
| Root page shows API JSON / assets return 404 | Check Express preset, repository root, deployment build command, and generated root `public/index.html` + `public/assets/`. A plain frontend build does not perform Vercel packaging. |
| “No entrypoint found which imports express” | Deploy the updated root `app.js`, which directly imports and creates Express, and keep Root Directory at the repository root. A wrapper that only imports another app file is not detected. |
| `/api/health` returns the SPA HTML | Remove an old catch-all SPA rewrite or static-only Vite deployment configuration. |
| Files appear missing after a domain change | Revisit the old origin and export/import or upload/download its library; browser storage is scoped to origins. |

For updates, push source changes and let Vercel redeploy. Apply new SQL migrations separately before using frontend features that require them. Redeploy after environment variable changes, and keep a JSON backup before schema or account changes.
