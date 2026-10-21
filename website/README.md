# Santara website

A standalone React + Vite product site for the Santara Windows and Linux desktop preview. It is a website about the desktop product; files are not converted in the browser.

## Development

From the repository root:

```sh
npm run dev --prefix website
npm run build --prefix website
npm run preview --prefix website
```

The local development server serves the repository's current Linux `.deb` and AppImage at `/downloads/`. For a hosted static build, set `VITE_SANTARA_RELEASE_BASE_URL` to the directory or release URL containing the installer files before building. Windows download stays unavailable until a Windows `.exe` artifact exists.

Build output is written to `website/dist/`.
