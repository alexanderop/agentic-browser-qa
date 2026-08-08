import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractMarkdownSection,
  isValidScreenshotFilename,
  isValidVideoFilename,
  validateQaReport,
  validateStructuredOutput,
} from './policy.mjs'

const completeReport = `# Agentic Browser QA Report

## Verdict: HEALTHY

## Acceptance Criteria
The primary flow completed successfully.

## Evidence
Observed the saved result and captured a screenshot.

## Bugs / Observations
No product bugs found.

## Accessibility Findings
Primary controls exposed accessible names and keyboard focus.

## Console
No relevant errors observed.

## Confidence
High confidence based on the completed happy path and edge check.
`

const structured = JSON.stringify({
  verdict: 'HEALTHY',
  summary: 'The primary flow worked.',
  tests: [{ name: 'Primary flow', area: 'core_features', result: 'pass', details: 'Completed.' }],
  bugs: [],
  console_errors: [],
})

test('accepts a complete report and matching structured output', () => {
  assert.deepEqual(validateQaReport(completeReport, structured), { ready: true, verdict: 'HEALTHY' })
})

test('rejects missing and empty required sections', () => {
  const missing = completeReport.replace('## Confidence\nHigh confidence based on the completed happy path and edge check.\n', '')
  assert.match(validateQaReport(missing).reason, /missing sections: Confidence/)
  const empty = completeReport.replace('## Console\nNo relevant errors observed.', '## Console\n')
  assert.match(validateQaReport(empty).reason, /empty sections: Console/)
})

test('rejects placeholders and verdict disagreements', () => {
  assert.match(validateQaReport(completeReport.replace('No product bugs found.', 'TBD')).reason, /unfinished placeholders/)
  const mismatch = structured.replace('HEALTHY', 'MINOR_ISSUES')
  assert.match(validateQaReport(completeReport, mismatch).reason, /do not match/)
})

test('structured output requires observed tests', () => {
  const emptyTests = JSON.stringify({ verdict: 'HEALTHY', summary: 'Done.', tests: [], bugs: [], console_errors: [] })
  assert.match(validateStructuredOutput(emptyTests).reason, /no completed tests/)
})

test('extracts exact markdown sections', () => {
  assert.equal(extractMarkdownSection(completeReport, 'Console'), 'No relevant errors observed.')
})

test('validates safe flat evidence filenames', () => {
  assert.equal(isValidScreenshotFilename('ac1-saved.png'), true)
  assert.equal(isValidScreenshotFilename('../secret.png'), false)
  assert.equal(isValidScreenshotFilename('Upper.png'), false)
  assert.equal(isValidVideoFilename('walkthrough.webm'), true)
  assert.equal(isValidVideoFilename('nested/demo.webm'), false)
  assert.equal(isValidVideoFilename('walkthrough.mp4'), false)
})

