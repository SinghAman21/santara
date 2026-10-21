# Santara website

A standalone React + Vite product site for the Santara Windows and Linux desktop preview. It is a website about the desktop product; files are not converted in the browser.

## Development

From the repository root:

```sh
npm run dev --prefix website
npm run build --prefix website
npm run preview --prefix website
```

The local development server serves the repository's current Windows `.exe`, Linux `.deb`, and Linux AppImage from `release/` at `/downloads/`. Production builds link to the `v0.1.0-preview` GitHub release, so the large installers do not need to be stored in Vercel's static output. Set `VITE_SANTARA_RELEASE_BASE_URL` only if the release assets move to a different host.

Build output is written to `website/dist/`.

## Vercel

Set the Vercel project root directory to `website`. The install command can be `npm ci`, the build command is `npm run build`, and the output directory is `dist`. Commit `website/package-lock.json` so clean installs resolve the same dependencies. `vercel.json` rewrites direct visits to `/tools`, `/usecase`, `/pricing`, and `/install` to the React app.

The site includes `@vercel/analytics`; enable Web Analytics in the Vercel project dashboard to collect page views. The desktop application does not include this website analytics script.
