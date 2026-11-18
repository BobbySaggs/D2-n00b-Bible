# Steeped (rebuild)

The new Steeped app: React + TypeScript + Vite + Tailwind. Live Bungie data only.

- `src/bungie`: sign-in, API calls, item definitions (cached in IndexedDB), profile loading, snapshot.
- `src/model`: pure functions that turn Bungie's profile into Steeped's inventory. Tested in `*.test.ts`.
- `src/screens`, `src/ui`: screens and the shared component kit.
- `fixtures`: small Bungie-shaped test data.

Commands: `npm install`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run build` (output in `dist`, published to `/beta/`).
