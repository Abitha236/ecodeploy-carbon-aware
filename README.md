# EcoDeploy — carbon-aware deployment workspace

EcoDeploy has separate **customer** and **admin** dashboards for managing carbon-aware software deployment requests. The attached sample is a Digital Canteen project; EcoDeploy keeps the user's original deployment-planning topic and adapts the sample's customer/admin workflows to that topic.

Customers search a categorized service catalog, configure region/compute/runtime, build a deployment cart, submit requests, and track statuses and administrator notes. Admins review/approve/reject requests, move them through deployment status, manage customer access, manage service availability, add service templates, and inspect an audit trail. The app stores accounts, requests, catalog data, and audit events in SQLite.

## Run locally

Requires Node.js 24+ and Git. The runtime uses Node's built-in SQLite module and has no third-party npm dependencies.

```powershell
node --version
npm --version
npm test
npm start
```

Open `http://localhost:3000`.

**Demo administrator:** `admin@ecodeploy.local` / `ecodeploy-admin-change-me`. This is a classroom default; set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` before sharing or deploying the app. New registrations always get the customer role; the public form cannot create admins.

## Workflows

### Customer

1. Create an account or sign in.
2. Browse and search service templates by category.
3. Configure a region, vCPU count, and runtime; add one or more services to the cart.
4. Submit the cart. The app stores each request, a modeled footprint, and the recommended UTC hour.
5. Track status and administrator notes; cancel requests that are still pending or scheduled.

### Admin

1. Sign in with the configured admin account.
2. Review the overview and pending deployment queue.
3. Move valid requests through **Requested → Approved → Scheduled → Deploying → Completed**. Reject, cancel, or mark failed when appropriate; invalid status jumps are refused.
4. Pause/reactivate catalog entries, add service templates, suspend/reactivate customer access, and review the audit log.

## Implementation

| Path | Purpose |
|---|---|
| `app/server.js` | HTTP API, role checks, password hashing, sessions, SQLite schema/migration, carbon estimate, and state transitions |
| `app/public/` | Responsive marketing page, customer dashboard, admin console, catalog, cart, planner, and styles |
| `data/ecodeploy.db` | SQLite data: users, services, deployments, and audit events |
| `tests/app.test.js` | 12 tests covering catalog, accounts, roles, deployment requests, admin transitions, and access control |
| `Dockerfile`, `compose.yaml` | Non-root Node 24 image, health check, port 3000, admin environment, persistent data volume |
| `docker/Dockerfile.*` | Ubuntu/Alpine image comparison and a small Java container example |
| `Jenkinsfile` | Checkout, build, tests, JUnit/TAP output, container build, and status |
| `ansible/deploy.yml` | Install nginx and Docker, run the published image, configure the reverse proxy |
| `docs/LAB-GUIDE.md` | Git/GitHub, Jenkins/webhook, Docker, and Ansible lab steps |

## Local verification

```powershell
npm test
docker compose up --build -d
Invoke-RestMethod http://localhost:3000/api/health
docker compose ps
docker compose logs --tail 30 ecodeploy
docker compose down
```

The deployment statuses are a workflow demonstration; EcoDeploy does not provision cloud resources yet. Carbon profiles are illustrative seeded data, not live measurements or validated emissions. Estimated costs are informational; the demo collects no payment. Session cookies are in-memory and expire when the server restarts. Use this as a local/classroom project, not a public production service, without adding production identity/session management, rate limits, CSRF protections, HTTPS, and live grid data.

The local Git repository already demonstrates feature branches and conflict resolution. GitHub creation/push, Jenkins, Docker, and Ansible require the account and services described in [the lab guide](docs/LAB-GUIDE.md).
