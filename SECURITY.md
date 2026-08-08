# Security policy

## Reporting a vulnerability

Please report vulnerabilities through GitHub private vulnerability reporting
for this repository. Do not open a public issue for a secret-exposure,
workflow-injection, artifact-validation, or privilege-boundary vulnerability.

## Trust model

The reusable workflow treats the following as untrusted:

- Pull-request source and build output.
- Pull-request and issue text.
- Browser page content.
- Claude-generated reports, screenshots, video, and structured output.

The PR build runs in a separate job with no secrets, no persisted checkout
credentials, and no shared dependency cache. Only an internal PR is accepted.
The privileged QA job checks out the caller's default branch and consumes a
bounded static artifact. The publisher revalidates immutable provenance and
the live PR head before using write permissions.

Do not weaken these boundaries to support fork PRs. Do not execute commands
derived from PR text, page content, or agent output. Keep third-party actions
pinned to full commit SHAs.

## Supported versions

Only the latest `v1` release receives security updates.
