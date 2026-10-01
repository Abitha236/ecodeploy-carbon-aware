# EcoDeploy experiment — execution and evidence guide

This is a reproducible single-project lab with a coherent result: a user enters deployment size/runtime, sees the estimated current footprint and lowest modeled hourly window, then saves a named deployment plan. The web UI is the experiment output. The CI pipeline verifies the API, emits test reports, builds an image, and reports a build status. Container and Ansible exercises deploy the same app.

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

Create an **empty** public or private GitHub repository named `ecodeploy-carbon-aware` (do not initialize it with a README/license, since this project already has a commit). Authenticate with `gh auth login`, or use the GitHub browser UI and its credential manager. Then use the exact URL GitHub displays:

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

**Fetch** downloads remote refs/objects and updates `origin/main`; your current branch/worktree stay put until you inspect and merge/rebase. Example: run `git fetch origin`, then `git log main..origin/main` to review incoming commits before applying them. **Pull** is fetch plus integration (normally merge; `--ff-only` above refuses surprise merge commits). Example: `git pull --ff-only origin main` downloads and advances local `main` if it can fast-forward. If local and remote both diverged, stop and choose/review an explicit merge or rebase rather than blindly pulling. `git status -sb` reports ahead/behind state after either operation.

## 3. Run and demonstrate the website

```powershell
npm test
npm start
```

Open `http://localhost:3000`; show calculator inputs and the recommended hour, submit a project name, register with a throwaway password, and show the new queue row. In another PowerShell window:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/estimate -ContentType 'application/json' -Body '{"region":"Europe","workload":30,"runtime":2}'
```

Forecast figures are seeded demonstration profiles in `app/server.js`. Say so in the report; do not claim live emissions or validated carbon savings.

## 4. Docker images and lifecycle

With Docker Desktop running, from repo root:

```powershell
docker pull node:22-alpine
docker image ls
docker build -t ecodeploy:local .
docker run -d --name ecodeploy-demo -p 3000:3000 -v ecodeploy-data:/app/data ecodeploy:local
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
docker compose down
docker volume ls
```

## 5. Jenkins Freestyle job, pipeline, and GitHub webhook

Install Jenkins LTS using its official Windows installer or run on a Linux VM. Complete the initial unlock and install suggested plugins plus **Git**, **Pipeline**, **JUnit**, and (for webhooks) **GitHub Integration**. Install Git and Node on the Jenkins agent and ensure `git`, `node`, `npm`, and Docker CLI/daemon are available to that agent. For production, use a dedicated build agent and managed secrets.

**Freestyle demonstration:** New Item → Freestyle project `EcoDeploy-Freestyle` → Source Code Management: Git → Repository URL: your GitHub URL → Branch `*/main` → Build Triggers: **GitHub hook trigger for GITScm polling** → Build step: Execute shell (`npm test`, `docker build -t ecodeploy:freestyle .`) on Linux, or Windows batch (`npm test` and `docker build -t ecodeploy:freestyle .`) on Windows. Save → Build Now → inspect Console Output and test exit code.

**Pipeline:** Create a Pipeline job `EcoDeploy-Pipeline`; SCM → Git → set repo URL/branch and Script Path `Jenkinsfile`; check **GitHub hook trigger for GITScm polling**; save. The Jenkinsfile checks out, builds, runs tests into JUnit XML + TAP artifacts, builds a tagged container, and prints success/failure status. Confirm the agent has a Docker daemon; the pipeline intentionally fails at image build if it does not. Configure GitHub credentials in Jenkins Credentials if a private repository requires access. Do not place tokens in the Jenkinsfile.

**Webhook:** Jenkins must be reachable from GitHub over HTTPS. A local-only `localhost` Jenkins cannot receive GitHub webhooks; use a secured public Jenkins URL or a trusted temporary tunnel approved by your organization. In GitHub → repository Settings → Webhooks → Add webhook, set Payload URL to `https://YOUR-JENKINS/github-webhook/`, Content type `application/json`, choose **push** events, and save. For a GitHub Enterprise or private Jenkins instance, configure supported authentication/allowlists. Push a harmless README commit, then inspect webhook Recent Deliveries (expect HTTP 200) and Jenkins build history. The GitHub webhook is push notification; Jenkins plugin/trigger and a reachable URL are required. If webhook hosting is unavailable, use **Poll SCM** as a fallback and label the demo polling, not webhook-triggered.

**Report evidence:** Jenkins job config trigger, one Freestyle console result, one Pipeline stage view, passing JUnit report with test counts, archived TAP report, and a build started by a GitHub push (with delivery status).

## 6. Continuous testing and result analysis

```powershell
npm test
```

Five tests cover health response, clamped estimates, unknown-region defaults, hourly recommendation API, and malformed JSON. A non-zero test exit fails Jenkins. Pipeline JUnit publishing makes pass/fail and individual durations visible; archived TAP is the raw report. Capture the Jenkins test-results page. If tests fail, inspect the first assertion/stack trace, fix the code, rerun locally, commit, and confirm the new build is green.

## 7. Ansible web server and automated Docker management

Run from Ubuntu/WSL2 or a Linux control node with SSH access to an Ubuntu/Debian target. Ansible is not natively supported as a Windows control node. First publish the image you built from this repository to a container registry the server can access. `ansible/deploy.yml` installs nginx and Docker, pulls that EcoDeploy image, starts/updates the container, and enables nginx reverse proxy routing.

```bash
sudo apt update
sudo apt install -y ansible-core python3-pip
ansible-galaxy collection install -r ansible/requirements.yml
cp ansible/inventory.ini.example ansible/inventory.ini
# Edit inventory.ini: set real Ubuntu host/IP and SSH user; don't commit real host inventory.
ansible web -i ansible/inventory.ini -m ping
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml --syntax-check
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml --syntax-check
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml --diff -e ecodeploy_image=YOUR_REGISTRY/ecodeploy:1.0.0
ansible web -i ansible/inventory.ini -b -m command -a 'docker ps'
```

After the playbook, visit `http://YOUR_UBUNTU_SERVER_IP/` and inspect `docker ps`, `systemctl status nginx`, and the Ansible recap. The playbook changes a real target host. Use a disposable VM for this lab and update SSH/firewall rules to your requirements. Configure authenticated registry access on the host first if the registry is private.

## 8. Screenshots and report evidence

Save real screenshots in `screenshots/` at 1920×1080 or higher when available. Capture the **PowerShell or Ubuntu terminal window itself** (for commands), browser app window (for the website), Jenkins (for jobs/reports), and Docker Desktop (for containers/images). Do not use screenshots of Codex/assistant. Keep text readable; capture after output completes and include enough window title/context to identify the app.

Suggested sequence (rename files in order):

1. `01-versions-powershell.png` — every tool version; show absent tools honestly.
2. `02-git-config-status.png` — user.name/email, status, initial commit and log.
3. `03-branches-merge.png` — feature branch merge graph.
4. `04-conflict-resolution.png` — conflict markers, resolved status, merge commit.
5. `05-github-remote-push.png` — remote -v, push success, clean status.
6. `06-fetch-vs-pull.png` — before/after refs and commands.
7. `07-app-planner.png` — planner result + recommendation in browser.
8. `08-app-registration-queue.png` — demo registration and saved project row (never show a real password).
9. `09-tests-junit.png` — test command and Jenkins JUnit test results.
10. `10-freestyle-build.png` — Jenkins Freestyle console build.
11. `11-pipeline-webhook.png` — Jenkins pipeline result and successful GitHub delivery.
12. `12-docker-lifecycle.png` — image list, running container, health endpoint, stop/start/remove.
13. `13-docker-size-comparison.png` — Ubuntu/Alpine/Java `docker images` output.
14. `14-ansible-run.png` — play recap and `docker ps` on the target.
15. `15-deployed-site.png` — deployed site in a browser.

Use Windows Snipping Tool (`Win+Shift+S`) or the OS screenshot utility, save PNG directly into `screenshots/`, and verify text is legible. For a formal report, include the experiment objective, architecture, implementation, command observations, screenshots, test table, image-size values observed, limitations, and conclusion. The screenshot folder includes a manifest so captures are easy to cross-check.

## Expected outcome

The planner returns a current estimate plus the modeled cleanest hour, and a plan appears in the queue. Automated checks pass locally and in Jenkins; an image can be started on port 3000 and its health endpoint returns `{"status":"ok"...}`. Ansible recap reports changed/successful tasks and nginx serves the app through the container. Real GitHub push, live webhook, Jenkins host, Docker daemon, Ubuntu target, and screenshot files require the local accounts/hosts described above.
