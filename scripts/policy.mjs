import { appendFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const FINAL_VERDICTS = new Set(['HEALTHY', 'MINOR_ISSUES', 'CRITICAL_BUGS'])
export const REQUIRED_SECTIONS = [
  'Acceptance Criteria',
  'Evidence',
  'Bugs / Observations',
  'Accessibility Findings',
  'Console',
  'Confidence',
]

export function extractMarkdownSection(body, heading) {
  if (!body) return ''
  const escaped = heading.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const pattern = new RegExp(
    String.raw`^##\s+${escaped}\s*$\n([\s\S]*?)(?=^##\s+|(?![\s\S]))`,
    'im',
  )
  return body.match(pattern)?.[1]?.trim() ?? ''
}

export function validateStructuredOutput(raw) {
  if (!raw?.trim()) return { ready: false, reason: 'Structured output is missing' }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return { ready: false, reason: 'Structured output is not valid JSON' }
  }
  if (!FINAL_VERDICTS.has(data.verdict)) {
    return { ready: false, reason: 'Structured output has no final verdict' }
  }
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    return { ready: false, reason: 'Structured output has no summary' }
  }
  if (!Array.isArray(data.tests) || data.tests.length === 0) {
    return { ready: false, reason: 'Structured output has no completed tests' }
  }
  const testsValid = data.tests.every((test) =>
    typeof test?.name === 'string' && test.name.trim()
    && ['pass', 'fail', 'skip'].includes(test.result)
    && typeof test.details === 'string' && test.details.trim(),
  )
  if (!testsValid) return { ready: false, reason: 'Structured output contains incomplete tests' }
  if (!Array.isArray(data.bugs) || !Array.isArray(data.console_errors)) {
    return { ready: false, reason: 'Structured output is missing bug or console arrays' }
  }
  return { ready: true, verdict: data.verdict }
}

export function validateQaReport(report, structuredOutput = '') {
  if (!report?.trim()) return { ready: false, reason: 'QA report is missing' }
  const verdict = report.match(/^##\s+Verdict:\s*([A-Z_]+)\s*$/im)?.[1]?.toUpperCase()
  if (!verdict || !FINAL_VERDICTS.has(verdict)) {
    return { ready: false, reason: 'QA report has no final verdict' }
  }
  if (/\b(?:TBD|TODO|Pending|Testing in progress|N\/A)\b/i.test(report)) {
    return { ready: false, reason: 'QA report still contains unfinished placeholders' }
  }
  const missing = REQUIRED_SECTIONS.filter((section) =>
    !new RegExp(`^##\\s+${section.replace('/', '\\/')}\\s*$`, 'im').test(report),
  )
  if (missing.length > 0) {
    return { ready: false, reason: `QA report is missing sections: ${missing.join(', ')}` }
  }
  const empty = REQUIRED_SECTIONS.filter((section) => {
    const content = extractMarkdownSection(report, section)
    return !content || /^(?:\.\.\.|tbd|todo|pending|n\/a)$/i.test(content)
  })
  if (empty.length > 0) {
    return { ready: false, reason: `QA report has empty sections: ${empty.join(', ')}` }
  }
  if (structuredOutput.trim()) {
    const structured = validateStructuredOutput(structuredOutput)
    if (!structured.ready) return structured
    if (structured.verdict !== verdict) {
      return { ready: false, reason: 'Markdown and structured verdicts do not match' }
    }
  }
  return { ready: true, verdict }
}

export function isValidScreenshotFilename(name) {
  return typeof name === 'string'
    && name.length <= 100
    && /^[a-z0-9][a-z0-9_-]*\.png$/.test(name)
}

export function isValidVideoFilename(name) {
  return typeof name === 'string'
    && name.length <= 100
    && /^[a-z0-9][a-z0-9_-]*\.webm$/.test(name)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reportPath = process.argv[2] ?? 'qa-report.md'
  const report = await readFile(reportPath, 'utf8').catch(() => '')
  const result = validateQaReport(report, process.env.STRUCTURED_OUTPUT ?? '')
  const lines = [
    `ready=${result.ready}`,
    `verdict=${result.verdict ?? ''}`,
    `reason=${result.reason ?? ''}`,
  ]
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
  }
  console.info(result.ready
    ? `QA report ready: ${result.verdict}`
    : `QA report incomplete: ${result.reason}`)
  if (!result.ready) process.exitCode = 1
}
