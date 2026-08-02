# Book Scrubby Expo client

This directory is the application package root. Use Node.js 20 and Yarn Classic
through Corepack; do not run npm install or use the archived
`frontend_web_backup` package.

## Local setup

From the repository root:

```powershell
corepack yarn --cwd frontend install --frozen-lockfile
Copy-Item frontend\.env.example frontend\.env.local
corepack yarn --cwd frontend dev
```

`dev` opens the web app at `http://localhost:3000`. The environment values are
optional for the hosted API defaults, but `.env.local` makes the selected
endpoints explicit:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_BACKEND_URL` | Base URL for API requests |
| `EXPO_PUBLIC_IMAGES_URL` | Base URL for hosted images |

Never put credentials in an `EXPO_PUBLIC_*` variable; Expo embeds these values
in the client bundle.

## Safe local validation

These commands run locally and do not submit, deploy, or consume EAS build
quota:

```powershell
corepack yarn --cwd frontend lint
corepack yarn --cwd frontend typecheck
corepack yarn --cwd frontend test
corepack yarn --cwd frontend build
corepack yarn --cwd frontend validate
```

There is no frontend unit-test suite yet. `test` is the current static quality
gate (ESLint plus TypeScript), while `validate` also performs a local static web
export.

## Native builds and costs

For an installable APK, AAB, or IPA, manually run the **Local EAS Builds**
workflow in GitHub Actions (`.github/workflows/react-native-cicd.yml`). Choose a
platform and compatible artifact type; the default is the lower-cost Android
development build. The workflow is manual-only, cancels an older duplicate run,
and every native build command includes `eas build --local`.

Local EAS compilation avoids EAS cloud-build charges. It still consumes GitHub
Actions runner minutes, and `macos-latest` iOS minutes are especially expensive
once the repository's included quota is exhausted. Selecting `all` intentionally
runs multiple builds and should be used sparingly.

The workflow requires `EXPO_TOKEN2` to access the Expo project and
Expo-managed signing credentials. It only builds and uploads short-lived GitHub
artifacts; it does not run `eas update`, `eas submit`, deploy, notify external
services, or publish to a store.

The separate **Local Validation (No Native Builds)** workflow is ordinary
push/pull-request CI for linting and a static web export. It does not invoke EAS.

Store submission is a separate, deliberate release task documented in
`STORE_SUBMISSION_GUIDE.md`. Never place Apple, Google, or Expo credentials in
source control.
