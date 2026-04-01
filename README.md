# Mobile Inventory Control

Mobile-first web app for phone-store staff to:

- sign in with staff or manager accounts
- search inventory and see MOP
- add stock unit by unit with IMEI
- sell a device by IMEI
- run weekly audits against active IMEIs
- review activity and audit exceptions

## Files

- `index.html`: app shell and login page
- `app.js`: Supabase auth and inventory logic
- `config.js`: add your Supabase URL and anon key here
- `supabase-schema.sql`: run this in Supabase SQL Editor

## Setup

1. Create a Supabase project.
2. Open the SQL Editor in Supabase and run `supabase-schema.sql`.
3. In Supabase Authentication settings, create staff users or use the signup form in the app.
4. Promote manager accounts by updating the `profiles.role` value in Supabase when needed.
5. Copy your project URL and anon key into `config.js`.
6. Open `index.html` in a browser or serve the folder locally with a static web server.

## Local Preview

- From this folder, run `python -m http.server 4173`
- Open `http://127.0.0.1:4173/`

## Cloudflare Pages Deploy

1. Push this folder to the GitHub repo.
2. In Cloudflare, go to Pages and create a project from that GitHub repo.
3. Use these build settings:
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `/`
   - Root directory: leave blank
4. Deploy the site.
5. Copy the live Pages URL.
6. In Supabase Authentication, update:
   - `Site URL` to your live Pages URL
   - `Redirect URLs` to include your live Pages URL
7. Test sign in, create account, resend confirmation, and reset password from the live URL.

## Important

- Use the Supabase anon key only. Do not put the service role key in `config.js`.
- Camera barcode scanning needs HTTPS in production.
- If email confirmation is enabled in Supabase Auth, newly created users must verify email before signing in.
- All inventory is now intended to come from Supabase instead of browser local storage.
