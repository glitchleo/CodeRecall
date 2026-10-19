# CodeRecall

React library interface with an Express API and optional Supabase authentication. Requires Node.js 22+.

## Local setup

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The frontend and API run together; `/api` requests proxy to the API, which defaults to port 8000 and respects `PORT` in the root `.env` file. Use `npm run dev:client` or `npm run dev:api` to run either separately.

The library is a browser-local prototype: folders and empty text files are saved in this browser's local storage. Create nested folders, rename items, copy or move whole folder trees, delete with undo, star favorites, and search across the library. Use the folder tree or double-click a folder to open it; right-click items for actions. Drag items into a folder to move them, or hold Ctrl/Alt to copy. Grid and list views are available.

Text files are empty placeholders; double-click a file to see its details. Text editing, account integration, and backend library storage come later. Clearing browser data removes this prototype library.

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
