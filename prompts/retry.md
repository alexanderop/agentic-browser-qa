# Browser QA report recovery

The earlier QA attempt did not leave a complete report. The application is
still running at `{{APP_URL}}`.

Your first action must be to write a complete report skeleton to
`{{REPORT_PATH}}`. Then perform a bounded smoke test through `agent-browser`,
replace every placeholder with observed evidence, and finalize the verdict.

At minimum:

1. Open the application and apply the configured device profile.
2. Confirm the main page renders.
3. Navigate through two meaningful user-visible states.
4. Check browser errors and console output.
5. Capture one screenshot under `{{SCREENSHOTS_DIR}}/`.
6. Finish every required report section.

Do not read source files or run any command that does not start with
`agent-browser`. Return valid JSON matching the supplied schema after the
Markdown report exists.
