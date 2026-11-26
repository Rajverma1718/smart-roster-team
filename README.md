# Smart Roster Team

Firebase-backed roster planner and employee portal.

- `personal/`: manager roster planner.
- `team/`: manager dashboard and employee portal.

This app uses Google sign-in and Firestore. The included frontend points to the existing Raj Smart Roster Firebase project. For a separate installation, replace the Firebase web configuration in `personal/cloud.js` and `team/portal.mjs`, enable Google sign-in, authorize your hosting domain, and configure owner-only roster access and per-employee access in Firestore.
