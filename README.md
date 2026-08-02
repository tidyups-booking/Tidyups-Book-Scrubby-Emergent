# Tidyups / Book Scrubby

The actively developed client is the Expo app in [`frontend`](frontend). It is
the only JavaScript package root in the main application and uses **Yarn
Classic**, pinned by `frontend/package.json` and `frontend/yarn.lock`.

From this repository root, the recommended local start command is:

```powershell
corepack yarn --cwd frontend dev
```

Install dependencies first with:

```powershell
corepack yarn --cwd frontend install --frozen-lockfile
```

See [`frontend/README.md`](frontend/README.md) for environment setup, local
validation commands, and the distinction between local Expo checks and
credentialed EAS/store workflows.

The Python API in [`backend`](backend) is a separate service. It is not required
to start the client against the configured hosted API. If backend work is
needed, copy `backend/.env.example` to `backend/.env`, provide a local MongoDB,
install `backend/requirements.txt` in a Python virtual environment, and run:

```powershell
python -m uvicorn server:app --app-dir backend --reload
```
