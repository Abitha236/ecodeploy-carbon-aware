# EcoDeploy — carbon-aware software deployment system

## Abstract

EcoDeploy is a web application and DevOps learning project that estimates compute emissions from hourly regional grid-intensity profiles and recommends a lower-intensity deployment time. It provides an interactive deployment planner, a saved-plan queue, developer registration/sign-in, and a deployment pipeline. The repository demonstrates local Git branching and merge-conflict resolution, automated Node.js tests, Docker packaging, Jenkins CI configuration, and Ansible-based web-server/container automation.

## Objective

Build a useful, presentable application and use it to demonstrate Git/GitHub collaboration, CI testing, container lifecycle management, and infrastructure automation. The application output should make the experiment meaningful: estimate a workload, compare grid hours, recommend a time, and save a service deployment plan.

## Architecture

```text
Browser dashboard
   │ HTTP / JSON
   ▼
Node.js app ── salted account hashes + deployment plans (data volume)
   │
   ├── Docker image + Compose port 3000 and persistent volume
   ├── Jenkins checkout → build → JUnit/TAP tests → Docker image → status
   └── Ansible → nginx + Docker → published EcoDeploy image → reverse proxy
```

## Implementation

- Responsive dashboard with an hourly emissions chart, region selector, workload/runtime inputs, recommendations, and project queue.
- Server endpoints for health, intensity profiles, estimates, registration, sign-in, and project plans.
- Accounts store a per-user random salt and scrypt hash; passwords are never stored as plain text. Use throwaway demo credentials.
- Docker image uses Node Alpine, runs as non-root, exposes port 3000, and has a health check. Compose persists app data in a named volume.
- Additional Ubuntu/Alpine OS images and a multi-stage Java image are provided for image-size/lifecycle comparisons.
- Jenkinsfile publishes a JUnit test report and archives TAP output.
- Ansible playbook installs nginx and Docker, pulls the published app image, manages the container, and configures nginx proxying.

## Verified results in this workspace

| Check | Result |
|---|---|
| Git | Local `main` repository created; sample local identity configured; project committed. |
| Branching | `feature/dashboard-copy` merged to `main`; separate `feature/grid-window` created a same-line conflict and was merged after resolution. |
| Git status/log | Clean working tree after the merge; graph shows both branches and merge commits. |
| Node syntax | `app/server.js` and browser `app.js` pass `node --check`. |
| Automated tests | 8 passed, 0 failed: health, clamping, safe region fallback, estimate API, malformed JSON, plan persistence, salted registration/sign-in, and invalid credentials. |
| JUnit output | Node's built-in JUnit reporter emits XML accepted by Jenkins' JUnit publisher. |
| Website | Served successfully in a browser; dashboard rendered live model output and the 24-hour chart. |

## External lab results to capture

These require tools/accounts/hosts not present in the build environment. Run the steps in [LAB-GUIDE.md](LAB-GUIDE.md), then replace the status notes with your captured outputs:

| Experiment | Required evidence / status |
|---|---|
| GitHub create remote, push, clone, fetch/pull/push | Pending your GitHub sign-in and repository URL. |
| Jenkins Freestyle job + GitHub webhook | Pending Jenkins installation/public HTTPS endpoint and GitHub access. |
| Docker image/containers/port/volume and size comparison | Pending Docker Engine/Desktop installation. |
| Ansible nginx + app-container deployment | Pending Ubuntu control/target host, SSH access, and a published image. |
| Real terminal and service screenshots | See numbered capture plan below; the authoring environment did not expose PowerShell/Ubuntu windows for authentic capture. |

## Screenshot checklist

Save screenshots as PNGs in `../screenshots/` at the highest readable resolution available (target 1920×1080). Capture PowerShell or Ubuntu Terminal for command output, Jenkins for builds/reports, Docker Desktop for image/container state, and the app in a browser. Do not include the assistant interface or real credentials. The ordered filenames, capture moments, and exact commands are in [LAB-GUIDE.md](LAB-GUIDE.md#8-screenshots-and-report-evidence). Insert the actual screenshots here after capture, for example:

```markdown
![PowerShell tool versions](../screenshots/01-versions-powershell.png)
![Carbon-aware planner result](../screenshots/07-app-planner.png)
```

## Limitations and conclusion

Grid profiles are illustrative seeded values, so savings are modeled comparisons rather than measured or live carbon reductions. The demo uses a local JSON store and credential verification without production sessions; do not expose it publicly as-is. GitHub pushes/webhook delivery, Jenkins execution, Docker lifecycle, registry publication, and Ansible deployment have not been claimed as complete because their required services/account were unavailable here. Once the numbered labs are run and screenshots added, the report can include actual remote-build and deployment evidence.
