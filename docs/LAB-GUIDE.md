# EcoDeploy experiment — execution and evidence guide

This lab's application is a carbon-aware deployment service with separate customer and admin dashboards. Customers search a service catalog, configure deployments in a cart, submit requests, and track status. Admins review requests, manage catalog availability and customer accounts, and inspect the activity log. SQLite preserves app data; Jenkins, Docker, and Ansible provide the DevOps workflow. This adapts the sample report's customer/admin pattern to EcoDeploy's deployment domain.

## 0. Tools and machine setup

Use PowerShell on Windows. For the Ubuntu/Ansible section, use Ubuntu in WSL2 or a Linux VM. Docker Desktop must be running before Docker commands. Install current stable Git, Node.js LTS, Docker Desktop, and Jenkins from their official vendors; install GitHub CLI (`gh`) if you want to create a remote using commands. Verify every installation and capture the terminal after each group:

```powershell
git --version
git config --global user.name
git config --global user.email
node --version
npm --version
docker --version
docker compose version
java -version
gh --version
```

An unavailable command means that tool still needs installing. Do not paste GitHub tokens, passwords, or private keys into a screenshot or repository. Git commit identity is a display name/email, not the account password. Configure it locally for this repo using the values you choose:

```powershell
git config user.name "YOUR NAME"
git config user.email "YOUR GITHUB-NOREPLY OR EMAIL ADDRESS"
git config --list --show-origin
```

## 1. Local repository, add/commit/status/log, and branches

Run from the project root (`outputs\ecodeploy-carbon-aware`). This deliverable already contains a local `main` repository, a sample lab identity, and a baseline commit, so first inspect the history that is present. To repeat this exercise from a source-only copy without `.git`, use the initialization lines below; replace the sample identity with your own display name/email before committing.

```powershell
git status
git log --oneline --decorate
git status
```

Source-only copy initialization (skip when `.git` already exists):

```powershell
git init -b main
git config user.name "YOUR NAME"
git config user.email "YOUR EMAIL"
git add .
git commit -m "feat: build EcoDeploy carbon-aware deployment planner"
```

Branch exercise. Start a feature branch, make one purposeful change, commit, and merge it to main:

```powershell
git switch -c feature/new-planner-note
# Edit README or a UI label, then:
git add README.md
git commit -m "docs: clarify the carbon-aware planning workflow"
git switch main
git merge --no-ff feature/new-planner-note -m "merge: planner note"
git branch --all
git log --oneline --graph --decorate --all
```

Conflict exercise (same file, different line value on each branch):

```powershell
git switch -c feature/grid-label
# Change the README heading line; save and commit it.
git add README.md; git commit -m "docs: rename grid label"
git switch main
# Change that exact same heading line to a different value; save and commit it.
git add README.md; git commit -m "docs: update project heading"
git merge feature/grid-label
```

Git pauses with a conflict. Open the file, choose/combine the intended wording, remove all `<<<<<<<`, `=======`, `>>>>>>>` markers, then:

```powershell
git status
git add README.md
git commit -m "merge: resolve project heading conflict"
git log --oneline --graph --decorate --all
```

Suggested team strategy: short-lived `feature/<topic>` branches, pull requests into protected `main`, required passing CI, one reviewer, and small merge commits (`--no-ff`) for a readable teaching history. Delete feature branches after merge. Never force-push shared `main`.

## 2. GitHub remote and synchronization

Create an **empty public** GitHub repository named `ecodeploy-carbon-aware` (do not initialize it with a README/license, since this project already has a commit). Authenticate with Git Credential Manager, GitHub CLI, or the connected GitHub integration. Then use the exact URL GitHub displays:

```powershell
gh auth status
git remote add origin https://github.com/YOUR-USER/ecodeploy-carbon-aware.git
git remote -v
git push -u origin main
git status -sb
git clone https://github.com/YOUR-USER/ecodeploy-carbon-aware.git ..\ecodeploy-carbon-aware-clone
git -C ..\ecodeploy-carbon-aware-clone status
```

Use a clean second clone or have a collaborator add a README change and push it. Demonstrate fetch versus pull:

```powershell
git fetch origin
git status -sb
git log --oneline --decorate --all -8
git diff main..origin/main
git merge --ff-only origin/main
git pull --ff-only origin main
git push origin main
git remote show origin
git remote -v
git log --oneline --graph --decorate --all -12
git status
```

Automatic push is enabled locally by `.githooks/post-commit`. After the initial remote push, every new commit on the current branch runs `git push --set-upstream origin <branch>`. For another clone, run `powershell -ExecutionPolicy Bypass -File .\scripts\enable-auto-push.ps1` after authenticating. Never commit secrets or personal data to this public repository.

**Fetch** downloads remote refs/objects and updates `origin/main`; your current branch/worktree stay put until you inspect and merge/rebase. Example: run `git fetch origin`, then `git log main..origin/main` to review incoming commits before applying them. **Pull** is fetch plus integration (normally merge; `--ff-only` above refuses surprise merge commits). Example: `git pull --ff-only origin main` downloads and advances local `main` if it can fast-forward. If local and remote both diverged, stop and choose/review an explicit merge or rebase rather than blindly pulling. `git status -sb` reports ahead/behind state after either operation.

## 3. Run and demonstrate the website

```powershell
npm test
$env:ADMIN_EMAIL = 'admin@ecodeploy.local'
$env:ADMIN_PASSWORD = Read-Host 'Choose a unique admin password (12+ characters)'
npm start
```

Open `http://localhost:3000`. Create a customer account, browse the catalog, add at least two workload templates to the cart, submit the requests, and inspect **My deployments**. For the admin dashboard, sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` set in the server environment; review the queue, approve a request, move it to **Scheduled**, pause a service, inspect customers, and view the activity log. Public registration can create customer accounts only.

Public API routes include `/api/health`, `/api/intensity`, `/api/estimate`, and `/api/catalog`. Authenticated customer routes include `/api/me`, `/api/deployments`, and `/api/logout`; admin routes include `/api/admin/overview`, `/api/admin/deployments/:id`, `/api/admin/services/:id`, and `/api/admin/customers/:id`.

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/estimate -ContentType 'application/json' -Body '{"region":"Europe","workload":30,"runtime":2}'
```

Forecast figures are seeded demonstration profiles in `app/server.js`, not live emissions or validated carbon savings.

## 4. Docker images and lifecycle

With Docker Desktop running, from repo root:

```powershell
Copy-Item .env.example .env
# Edit .env and set a unique ADMIN_PASSWORD before using Compose.
notepad .env
docker pull node:24-alpine
docker image ls
docker build -t ecodeploy:local .
$adminPassword = Read-Host 'Enter a unique admin password'
docker run -d --name ecodeploy-demo -p 3000:3000 -e ADMIN_EMAIL=admin@ecodeploy.local -e "ADMIN_PASSWORD=$adminPassword" -v ecodeploy-data:/app/data ecodeploy:local
Remove-Variable adminPassword
docker ps
Invoke-RestMethod http://localhost:3000/api/health
docker logs ecodeploy-demo
docker inspect ecodeploy-demo --format '{{.State.Health.Status}}'
docker stop ecodeploy-demo
docker ps -a
docker start ecodeploy-demo
docker exec ecodeploy-demo node --version
docker rm -f ecodeploy-demo
```

Compare an OS utility image and the Java example:

```powershell
docker build -f docker/Dockerfile.ubuntu -t ecodeploy-os:ubuntu .
docker build -f docker/Dockerfile.alpine -t ecodeploy-os:alpine .
docker images ecodeploy-os
docker run --rm ecodeploy-os:ubuntu
docker run --rm ecodeploy-os:alpine
docker build -f docker/Dockerfile.java -t ecodeploy-java:local .
docker run --rm ecodeploy-java:local
docker image ls
```

Sizes vary with architecture, registry layers, and cached base tags; compare output from the same machine and don't treat size as a security or performance score. Alpine is usually smaller; Ubuntu offers broader compatibility. The Node app image uses Alpine and runs as the non-root `node` user. Compose provides a persistent named data volume and health check:

```powershell
docker compose up --build -d
docker compose ps
docker compose logs --tail 40
curl -fsS http://localhost:3001/api/health
docker compose down
docker volume ls
```

Compose serves the container on `http://localhost:3001` by default to avoid a conflict with the Node development server on port 3000. Set `ECODEPLOY_PORT` in `.env` to change the host port.

## 5. Jenkins Freestyle job, pipeline, and GitHub webhook

Jenkins is installed locally at `http://localhost:8080`; sign in with the account created during Jenkins setup. Install/enable **Git**, **Pipeline**, **JUnit**, and **GitHub** plugins. Ensure Git, Node 24, and the Docker CLI/daemon are available on the build agent. If Jenkins runs as a Windows service, it may not inherit the signed-in user's PATH. Set Jenkins **Manage Jenkins → System → Global properties → Environment variables** to `NODE_HOME` (the Node.js `bin` directory) and `DOCKER_HOME` (the Docker CLI directory); the Jenkinsfile's setup stage adds both to PATH. The Jenkinsfile uses `githubPush()` and runs on Windows or Linux agents. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the app's runtime environment before deploying it. For production, use a dedicated build agent and managed secrets.

**Freestyle demonstration:** New Item → Freestyle project `EcoDeploy-Freestyle` → Source Code Management: Git → Repository URL: your GitHub URL → Branch `*/main` → Build Triggers: **GitHub hook trigger for GITScm polling** → Build step: Execute shell (`npm test`, `docker build -t ecodeploy:freestyle .`) on Linux, or Windows batch (`npm test` and `docker build -t ecodeploy:freestyle .`) on Windows. Save → Build Now → inspect Console Output and test exit code.

**Pipeline:** Create a Pipeline job `EcoDeploy-Pipeline`; SCM → Git → set repo URL/branch and Script Path `Jenkinsfile`; save. The Jenkinsfile checks out, syntax-checks, runs tests into JUnit XML + TAP artifacts, builds a tagged container, and prints success/failure status. Confirm the agent has a Docker daemon; the pipeline intentionally fails at image build if it does not. Configure GitHub credentials in Jenkins Credentials if required. Do not place tokens in the Jenkinsfile.

**Webhook:** Jenkins must be reachable from GitHub over HTTPS. The current Jenkins listens on local `localhost:8080` and cannot receive GitHub webhooks; use a secured public Jenkins URL or a trusted temporary tunnel approved by your organization. In GitHub → repository Settings → Webhooks → Add webhook, set Payload URL to `https://YOUR-JENKINS/github-webhook/`, Content type `application/json`, choose **push** events, and save. For a GitHub Enterprise or private Jenkins instance, configure supported authentication/allowlists. Push a harmless README commit, then inspect webhook Recent Deliveries (expect HTTP 200) and Jenkins build history. The GitHub webhook is push notification; Jenkins plugin/trigger and a reachable URL are required. If webhook hosting is unavailable, use **Poll SCM** as a fallback and label the demo polling, not webhook-triggered.

**Report evidence:** Jenkins job config trigger, one Freestyle console result, one Pipeline stage view, passing JUnit report with test counts, archived TAP report, and a build started by a GitHub push (with delivery status).

## 6. Continuous testing and result analysis

```powershell
npm test
```

Twelve tests cover health/storage, estimates, catalog search/category, customer registration and password hashing, deployment requests, history, role access, admin workflow transitions, service/customer management, and failed login. A non-zero test exit fails Jenkins. Pipeline JUnit publishing shows pass/fail and durations; archived TAP is the raw output. If tests fail, inspect the first assertion/stack trace, fix the code, rerun locally, commit, and confirm the new build is green.

## 7. Ansible web server and automated Docker management

For a local Docker Desktop demonstration with no separate SSH server, use `ansible/manage-local-container.yml`. In Ubuntu/WSL, install the Docker Python client and collection, export the ignored project `.env` values, then run the localhost playbook:

```bash
sudo apt install -y python3-docker
ansible-galaxy collection install -r ansible/requirements.yml
set -a
source .env
set +a
ansible-playbook -i localhost, ansible/manage-local-container.yml
curl -fsS http://localhost:3001/api/health
```

The playbook builds `ecodeploy:local`, maintains the `ecodeploy-data` volume and `ecodeploy-web` container, applies the health check, and reports the local URL. Keep `.env` private; do not paste its admin password into chat. The remote-host playbook below remains available for a separate Ubuntu/Debian server.

Run from Ubuntu/WSL2 or a Linux control node with SSH access to an Ubuntu/Debian target. Ansible is not natively supported as a Windows control node. First publish the image you built from this repository to a container registry the server can access. `ansible/deploy.yml` installs nginx and Docker, pulls that EcoDeploy image, starts/updates the container, and enables nginx reverse proxy routing.

```bash
sudo apt update
sudo apt install -y ansible-core python3-pip
ansible-galaxy collection install -r ansible/requirements.yml
cp ansible/inventory.ini.example ansible/inventory.ini
# Edit inventory.ini: set real Ubuntu host/IP and SSH user; don't commit real host inventory.
ansible web -i ansible/inventory.ini -m ping
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml --syntax-check
ansible-vault create ansible/secrets.yml
# Add ecodeploy_admin_password to the encrypted file.
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml --diff -e ecodeploy_image=YOUR_REGISTRY/ecodeploy:1.0.0 --ask-vault-pass --extra-vars @ansible/secrets.yml
ansible web -i ansible/inventory.ini -b -m command -a 'docker ps'
```

After the playbook, visit `http://YOUR_UBUNTU_SERVER_IP/` and inspect `docker ps`, `systemctl status nginx`, and the Ansible recap. The playbook changes a real target host. Use a disposable VM for this lab and update SSH/firewall rules to your requirements. Configure authenticated registry access on the host first if the registry is private.

## 8. Screenshot capture checklist

Save real screenshots in `screenshots/` at 1920×1080 or higher when available. Capture the **PowerShell or Ubuntu terminal window itself** (for commands), browser app window (for the website), Jenkins (for jobs/reports), and Docker Desktop (for containers/images). Do not use screenshots of Codex/assistant. Keep text readable; capture after output completes and include enough window title/context to identify the app.

Suggested sequence (rename files in order):

1. `01-versions-powershell.png` — every tool version; show absent tools honestly.
2. `02-git-config-status.png` — user.name/email, status, initial commit and log.
3. `03-branches-merge.png` — feature branch merge graph.
4. `04-conflict-resolution.png` — conflict markers, resolved status, merge commit.
5. `05-github-remote-push.png` — remote -v, push success, clean status.
6. `06-fetch-vs-pull.png` — before/after refs and commands.
7. `07-customer-dashboard.png` — customer overview and request summary.
8. `08-service-catalog-cart.png` — catalog filters and configured multi-service cart.
9. `09-customer-deployments.png` — request IDs, estimates, recommended times, and statuses.
10. `10-admin-overview.png` — separate admin dashboard and queue metrics.
11. `11-admin-request-management.png` — request review, status update, and customer note.
12. `12-admin-catalog-customers.png` — service availability and customer access.
13. `13-carbon-planner.png` — modeled estimate and recommended hour.
14. `14-sqlite-volume.png` — persistent app database / Docker volume.
15. `15-jenkins-tests.png` — passing test count and build status.
16. `16-freestyle-build.png` — Jenkins Freestyle console build.
17. `17-pipeline-webhook.png` — Jenkins pipeline result and successful GitHub delivery.
18. `18-docker-lifecycle.png` — image list, running container, health endpoint, stop/start/remove.
19. `19-docker-size-comparison.png` — Ubuntu/Alpine/Java `docker images` output.
20. `20-ansible-run.png` — play recap and `docker ps` on the target.
21. `21-deployed-site.png` — deployed customer-facing page in a browser.

Use Windows Snipping Tool (`Win+Shift+S`) or the OS screenshot utility, save PNG directly into `screenshots/`, and verify text is legible. Capture customer and admin browser views separately; never include an account password. The screenshot folder includes a manifest so captures are easy to cross-check.

## Expected outcome

Customers can submit multiple deployment requests and track admin status changes; admins can manage the queue, catalog, and account access. SQLite records persist in `/app/data` through the Docker volume. Automated checks pass locally and in Jenkins; the app health endpoint returns OK. Ansible recap should show successful tasks and nginx should serve the app through the container. GitHub push, live webhook, Jenkins host, Docker daemon, Ubuntu target, and terminal screenshots still require the local accounts/hosts described above. EcoDeploy models the workflow but does not provision real cloud workloads yet.
