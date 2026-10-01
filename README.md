# EcoDeploy — carbon-aware software deployment

EcoDeploy is a small but complete web application and DevOps lab. It estimates deployment emissions from **illustrative** hourly regional grid data, recommends a lower-intensity hour, and stores local project plans. The repo includes a Node.js API, responsive dashboard, automated tests, Docker images, a Jenkins pipeline, and an Ansible playbook that installs a web server and manages the app container.

> **Model limitation:** Forecast values are demonstration data, not live grid readings or a verified emissions inventory. Replace `intensity` in `app/server.js` with an authoritative, timestamped grid-intensity API before making production decisions. User accounts and plans are stored on the server filesystem; do not expose this demo to the public internet without adding a real database, session-based authentication, TLS, CSRF protection, rate limiting, and secret management.

## Run the project

Requires Node.js 20+ (tested with Node 24) and Git. No third-party Node packages are required.

```powershell
cd outputs\ecodeploy-carbon-aware
node --version
npm --version
git --version
npm test
npm start
```

Visit `http://localhost:3000`. Try the calculator, save a service plan, and create an account using a throwaway password. The API is available at `/api/health`, `/api/intensity`, `/api/estimate`, `/api/plans`, `/api/plan`, and `/api/register`.

## Project structure

| Path | Purpose |
|---|---|
| `app/server.js` | Dependency-free HTTP API, static server, carbon estimate, account registration, and plan store |
| `app/public/` | Responsive dashboard, chart, forms, and styles |
| `tests/app.test.js` | Health, estimate bounds, recommendations, and invalid input tests |
| `Dockerfile`, `compose.yaml` | Non-root Node app, health check, port 3000, persistent data volume |
| `docker/Dockerfile.*` | Ubuntu and Alpine OS comparison plus Java runtime example |
| `Jenkinsfile` | Checkout, build, continuous tests, JUnit/TAP reports, Docker image build, status |
| `ansible/deploy.yml` | Install nginx + Docker, pull/run container, configure reverse proxy |
| `docs/LAB-GUIDE.md` | End-to-end experiment commands and GitHub/Jenkins setup |

## Fast local checks

```powershell
npm test
docker compose up --build -d
Invoke-RestMethod http://localhost:3000/api/health
docker compose ps
docker compose logs --tail 30 ecodeploy
docker compose down
```

The project and all tutorial files are ready locally. Creating a GitHub repo, pushing to it, configuring webhooks, and running the Docker/Ansible infrastructure need your GitHub sign-in and installed services. Follow [the lab guide](docs/LAB-GUIDE.md) in order. The screenshot folder has a capture checklist; this environment does not currently provide a terminal window or screen-capture-to-file path, so the guide shows exactly which real PowerShell/Ubuntu terminal captures to add when you run the labs.
