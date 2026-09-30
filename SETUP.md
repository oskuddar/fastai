# Private online notes setup

The site now uses Supabase Auth and Postgres. No new note or card content is
written to browser storage, and the old `published-state.json` is no longer
loaded. The sign-in session is memory-only, so refreshing the page requires
signing in again.

1. Create a free Supabase project. In **Authentication → Users**, create your
   owner account with an email and a strong password. Turn off public sign-ups
   in the project's authentication settings. This is a separate app login; do
   not send the password to anyone or put it in a website file.
2. Confirm that your account is the **only** user in **Authentication → Users**,
   then run `supabase-setup.sql` in the Supabase SQL Editor. The script refuses
   to run if there are zero or multiple users. Its server-side rules restrict
   reading and editing to that one account.
3. Copy the project URL and **publishable** key from Supabase into `config.js`.
   Never put a service-role/secret key in a website file.
4. Test sign-in, write a note, wait for **Saved online**, sign out, then sign in
   from a second browser and confirm the note appears. Only after that should
   this version be deployed. Disabling GitHub Pages while testing is optional;
   nothing here changes GitHub repository settings.

Important: the public GitHub Pages URL will still show a login screen. It will
not show notes or cards. This does not hide content already published in Git
history or copied elsewhere. The previous browser-local notes are not erased by
this change. If an old draft exists in the browser where you sign in, use
**Import old browser notes** to copy it online. Confirm **Saved online** and
check it from another browser before clearing old browser data.
