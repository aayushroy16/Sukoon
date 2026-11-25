# Supabase accounts and Vercel deployment

User accounts and passwords are stored by Supabase Auth. Admin user listing and deletion run in server functions, guarded by the configured admin email. The Supabase service-role key is only read by server code and must never be exposed in a `VITE_` variable or browser bundle.

## Supabase setup

1. Create a Supabase project and enable email/password sign-in.
2. In **Authentication → Users**, create or invite the administrator account. Set the password there; public sign-up cannot create the configured admin account.
3. Copy the project URL, public/anon key, and server-only service-role key.

## Local setup

Copy `.env.example` to `.env.local`, fill in all four values, and restart `npm run dev`. The `.env.local` file is ignored by Git.

## Vercel setup

In the Vercel project, open **Settings → Environment Variables** and add all four values for Production (and Preview if needed). Then redeploy so the deployment receives the new values.

The admin email must exactly match the account created in Supabase. The admin dashboard shows account email, ID, creation date, and last sign-in date, and allows the admin to delete user accounts. It prevents deleting the configured admin account and the currently signed-in account.
