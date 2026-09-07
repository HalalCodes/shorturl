# ShortURL v2

A modern Firebase + Vercel URL shortener.

## The important fix

Created links now use the clean format:

`https://shorturlbd.vercel.app/examplename`

NOT:

`https://shorturlbd.vercel.app/link.html?c=examplename`

Vercel rewrites `/:alias` internally to `link.html?c=:alias`, so the visitor always sees the clean URL.

## Deploy

1. Put all files in the GitHub repository connected to Vercel.
2. Make sure the Vercel project domain is `shorturlbd.vercel.app`.
3. Deploy.
4. In Firebase Authentication, enable Google sign-in and add the Vercel domain to Authorized domains.
5. Deploy the included `firestore.rules` to Firestore.

## Data model

Each alias is the Firestore document ID. This makes aliases naturally unique and avoids the old race-prone query-then-create approach.

Example:
`links/examplename`

## Notes

- Redirects work through Vercel rewrites.
- Click counting is attempted before redirecting.
- Link passwords are stored as SHA-256 hashes instead of plaintext. For high-security password protection, move verification to a trusted server/Cloud Function.
- QR generation currently uses QuickChart only when the user clicks QR; normal short-link creation and redirects do not depend on it.
