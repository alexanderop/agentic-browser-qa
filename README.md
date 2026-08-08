# Agentic Browser QA

Evidence-backed browser QA for pull requests and preview environments. The
Action gives Claude a deliberately narrow browser-only tool surface through
[`agent-browser`](https://github.com/vercel-labs/agent-browser), validates the
resulting report, sanitizes screenshots and video, hashes the evidence, and
uploads one immutable artifact.

The repository exposes two reuse levels:

- `alexanderop/agentic-browser-qa@v1` tests an application that is already
  running.
- `alexanderop/agentic-browser-qa/.github/workflows/agentic-browser-qa.yml@v1`
  securely builds an internal PR without secrets, tests the isolated static
  artifact, posts a sticky PR report, and sets a commit status.

## What it produces

- A `HEALTHY`, `MINOR_ISSUES`, or `CRITICAL_BUGS` verdict.
- A machine-validated Markdown report and structured JSON output.
- Up to 12 validated PNG screenshots.
- An optional validated WebM walkthrough.
- SHA-256 provenance tying the report and evidence to the tested PR SHA.
- A GitHub Actions artifact containing every evidence file.

The reusable workflow also posts or updates one PR comment and writes an
`Agentic Browser QA` commit status. It does not modify application code.

## Recommended setup: run after CI

Save the following as `.github/workflows/browser-qa.yml` in the consuming
repository:

```yaml
name: Browser QA

on:
  workflow_run:
    workflows: [CI]
    types: [completed]

permissions: {}

jobs:
  browser-qa:
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.pull_requests[0] &&
      github.event.workflow_run.head_repository.full_name == github.repository
    permissions:
      actions: read
      contents: read
      id-token: write
      issues: write
      pull-requests: read
      statuses: write
    uses: alexanderop/agentic-browser-qa/.github/workflows/agentic-browser-qa.yml@v1
    with:
      pr_number: ${{ github.event.workflow_run.pull_requests[0].number }}
      head_sha: ${{ github.event.workflow_run.head_sha }}
      install_command: pnpm install --frozen-lockfile --ignore-scripts
      build_command: pnpm build
      artifact_path: dist
      device: iPhone 14
      instructions_file: .github/agentic-browser-qa.md
    secrets:
      claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

Add `CLAUDE_CODE_OAUTH_TOKEN` under **Settings → Secrets and variables →
Actions**. The called workflow can only receive the permissions granted by the
caller job.

The reusable workflow intentionally rejects fork PRs. It executes the PR's
install and build commands only in a secretless job, disables dependency
caching across the privilege boundary, uploads only a bounded static build,
and checks out the caller's trusted default branch before the Claude job.

## Repository-specific instructions

The default prompt is framework-neutral. Put durable product instructions in
`.github/agentic-browser-qa.md` on the default branch, for example:

```markdown
# Product QA instructions

- This is a local-first mobile PWA. Network access is optional.
- Verify that saved data survives a refresh.
- The primary flow is: create an item, edit it, navigate away, then return.
- Do not submit real payment, email, or production data.
```

The PR title and body are included as explicitly untrusted QA context. The
agent is told to use them as intended behavior, never as executable
instructions.

## Reusable workflow inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `pr_number` | required | Open same-repository PR to test |
| `head_sha` | empty | Stops stale CI runs from testing a newer PR head |
| `node_version` | `22` | Node version for the secretless build |
| `setup_command` | `corepack enable` | Package-manager setup |
| `install_command` | `pnpm install --frozen-lockfile --ignore-scripts` | Dependency installation |
| `build_command` | `pnpm build` | Static application build |
| `artifact_path` | `dist` | Static output directory |
| `port` | `4173` | Isolated local server port |
| `spa_fallback` | `true` | Serve `index.html` for client routes |
| `device` | `iPhone 14` | Browser device profile |
| `model` | `claude-sonnet-5` | Claude model identifier |
| `max_turns` | `80` | Claude turn ceiling |
| `record_video` | `true` | Capture one WebM walkthrough |
| `instructions` | empty | Inline trusted product instructions |
| `instructions_file` | empty | Trusted instructions on the default branch |
| `status_context` | `Agentic Browser QA` | Commit status name |

The workflow currently targets static browser applications. For a deployed
preview, backend, or custom service topology, use the direct Action in a job
that starts the required services first.

## Direct Action

```yaml
permissions:
  contents: read
  id-token: write

jobs:
  qa:
    runs-on: ubuntu-24.04
    steps:
      - name: Start application
        run: npm start &

      - uses: alexanderop/agentic-browser-qa@v1
        with:
          app-url: http://127.0.0.1:3000
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          qa-context: Verify the primary flow and saved-state refresh behavior.
```

The direct Action does not post PR comments or statuses. Its outputs include
`verdict`, `report-ready`, `artifact-id`, and `artifact-url`.

## Evidence contract

Generated files are treated as untrusted until sanitized:

- Screenshot names must be flat lowercase `.png` paths, at most 10 MB each,
  with valid PNG magic bytes; at most 12 are retained.
- Video names must be flat lowercase `.webm` paths, at most 50 MB, with valid
  EBML magic bytes; at most one is retained.
- The final artifact contains `qa-report.md`, structured output,
  `qa-provenance.json`, screenshots, and video.
- The publisher re-downloads the immutable artifact and checks its report hash,
  PR number, tested head SHA, and the live PR head before commenting.

## Versioning

Pin `@v1` for compatible updates or a full commit SHA for maximum immutability.
SemVer release tags (`v1.0.0`) are immutable; the floating major tag (`v1`)
moves only to compatible releases.

## Development

```bash
npm test
actionlint
```

See [SECURITY.md](SECURITY.md) before changing the PR build, artifact, prompt,
or publishing boundaries.

## License

[MIT](LICENSE)
