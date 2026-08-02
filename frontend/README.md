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

## Credentialed or remote workflows

Do not use `eas build`, `eas update`, `eas submit`, or trigger the publishing
options in `.github/workflows/react-native-cicd.yml` for routine validation.
Those paths can require Expo, Apple, Google Play, notification, or Google Drive
credentials and can consume hosted runner time, service quota, or store access.

The workflow expects repository secrets such as `EXPO_TOKEN2`,
`ASC_API_KEY_P8_BASE64`, `GOOGLE_PLAY_SERVICE_ACCOUNT`, `SLACK_WEBHOOK`,
`DISCORD_WEBHOOK`, `RCLONE_CONFIG_GDRIVE_TYPE`, and
`RCLONE_CONFIG_GDRIVE_TOKEN`. Store submission also depends on the local
credential file names configured in `eas.json`; neither credential file belongs
in source control.
