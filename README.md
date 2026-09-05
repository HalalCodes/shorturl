# ShortURL

Professional Firebase + GitHub Pages URL shortener starter.

## Files
- `index.html` landing page
- `app.html` dashboard
- `user.html` public profile
- `profile.html` profile settings
- `link.html` short-link redirect
- `firebase.js` Firebase initialization
- `app.js` application logic
- `style.css` design system
- `firestore.rules` starter security rules

## Firebase setup
1. Enable Authentication > Google.
2. Add your GitHub Pages domain under Authentication > Settings > Authorized domains.
3. Create a Firestore database.
4. Deploy the rules in `firestore.rules`.
5. Host the files in your repository.

## Important production notes
This starter stores an optional link password directly in Firestore for demonstration. For a real production deployment, move password verification to trusted server-side code and store only a salted password hash. Also consider a server/edge redirect endpoint for a cleaner `/abc` URL, rate limiting, abuse detection, bot filtering, and a QR library bundled locally if you require zero third-party runtime requests.
