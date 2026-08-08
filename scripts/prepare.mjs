import { randomUUID } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

const actionPath = process.env.GITHUB_ACTION_PATH
const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
const outputPath = process.env.GITHUB_OUTPUT

if (!actionPath) throw new Error('GITHUB_ACTION_PATH is required')
if (!outputPath) throw new Error('GITHUB_OUTPUT is required')

const input = (name) => process.env[`INPUT_${name.replaceAll('-', '_').toUpperCase()}`] ?? ''

export function validateRelativePath(value, label) {
  if (!value || value.length > 180 || value.includes('\0') || value.includes('\\')) {
    throw new Error(`${label} must be a non-empty workspace-relative POSIX path`)
  }
  if (path.posix.isAbsolute(value) || value.split('/').includes('..')) {
    throw new Error(`${label} must stay inside the workspace`)
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
    throw new Error(`${label} contains unsupported characters`)
  }
  return value
}

export function validateBoolean(value, label) {
  if (value !== 'true' && value !== 'false') throw new Error(`${label} must be true or false`)
  return value
}

export function validateInputs(values) {
  const url = new URL(values.appUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('app-url must use http or https')
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(values.model)) {
    throw new Error('model contains unsupported characters')
  }
  if (!/^[0-9]+$/.test(values.maxTurns) || Number(values.maxTurns) < 1 || Number(values.maxTurns) > 200) {
    throw new Error('max-turns must be an integer from 1 through 200')
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(values.agentBrowserVersion)) {
    throw new Error('agent-browser-version must be an exact semantic version')
  }
  if (values.device.length > 80 || /[\r\n]/.test(values.device)) {
    throw new Error('device must be a single line no longer than 80 characters')
  }
  validateRelativePath(values.reportPath, 'report-path')
  validateRelativePath(values.screenshotsDir, 'screenshots-dir')
  validateRelativePath(values.videosDir, 'videos-dir')
  validateRelativePath(values.provenancePath, 'provenance-path')
  if (values.instructionsFile) validateRelativePath(values.instructionsFile, 'instructions-file')
  validateBoolean(values.recordVideo, 'record-video')
  validateBoolean(values.clearStorage, 'clear-storage')
  if (values.prNumber && !/^[1-9][0-9]*$/.test(values.prNumber)) {
    throw new Error('pr-number must be a positive integer')
  }
  if (values.testedHeadSha && !/^[0-9a-f]{40}$/.test(values.testedHeadSha)) {
    throw new Error('tested-head-sha must be a 40-character lowercase commit SHA')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(values.artifactName)) {
    throw new Error('artifact-name contains unsupported characters')
  }
  return values
}

async function readTrustedInstructions(file) {
  if (!file) return ''
  const resolvedWorkspace = await realpath(workspace)
  const requested = path.resolve(resolvedWorkspace, file)
  const resolved = await realpath(requested)
  if (resolved !== resolvedWorkspace && !resolved.startsWith(`${resolvedWorkspace}${path.sep}`)) {
    throw new Error('instructions-file resolves outside the workspace')
  }
  const stat = await lstat(resolved)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100_000) {
    throw new Error('instructions-file must be a regular file no larger than 100 KB')
  }
  return readFile(resolved, 'utf8')
}

const values = validateInputs({
  appUrl: input('app-url'),
  qaContext: input('qa-context'),
  instructions: input('instructions'),
  instructionsFile: input('instructions-file'),
  device: input('device'),
  model: input('model'),
  maxTurns: input('max-turns'),
  agentBrowserVersion: input('agent-browser-version'),
  reportPath: input('report-path'),
  screenshotsDir: input('screenshots-dir'),
  videosDir: input('videos-dir'),
  provenancePath: input('provenance-path'),
  recordVideo: input('record-video'),
  clearStorage: input('clear-storage'),
  prNumber: input('pr-number'),
  testedHeadSha: input('tested-head-sha'),
  artifactName: input('artifact-name'),
})

const [systemPrompt, taskTemplate, retryTemplate, rawSchema, fileInstructions] = await Promise.all([
  readFile(path.join(actionPath, 'prompts/system.md'), 'utf8'),
  readFile(path.join(actionPath, 'prompts/task.md'), 'utf8'),
  readFile(path.join(actionPath, 'prompts/retry.md'), 'utf8'),
  readFile(path.join(actionPath, 'schema/report.json'), 'utf8'),
  readTrustedInstructions(values.instructionsFile),
])

const trustedInstructions = [values.instructions.trim(), fileInstructions.trim()].filter(Boolean).join('\n\n')
  || 'No additional repository-specific instructions were supplied.'
const qaContext = values.qaContext.trim() || 'No explicit acceptance criteria were supplied. Run a focused smoke test of the primary user flow.'
const deviceCommand = values.device ? `agent-browser set device "${values.device.replaceAll('"', '\\"')}"` : '# Use the default desktop browser context.'
const videoInstructions = values.recordVideo === 'true'
  ? `Record one walkthrough as \`${values.videosDir}/walkthrough.webm\`. Start recording before the primary flow, then take a fresh snapshot because recording creates a new browser context:\n\n\`\`\`bash\nagent-browser record start ${values.videosDir}/walkthrough.webm\n${deviceCommand}\nagent-browser reload\nagent-browser snapshot -i\n# Perform the flow, then:\nagent-browser record stop\n\`\`\``
  : 'Do not record video for this run.'

const replacements = new Map([
  ['{{APP_URL}}', values.appUrl],
  ['{{DEVICE}}', values.device || 'default desktop'],
  ['{{DEVICE_COMMAND}}', deviceCommand],
  ['{{REPORT_PATH}}', values.reportPath],
  ['{{SCREENSHOTS_DIR}}', values.screenshotsDir],
  ['{{VIDEOS_DIR}}', values.videosDir],
  ['{{RECORD_VIDEO}}', values.recordVideo],
  ['{{VIDEO_INSTRUCTIONS}}', videoInstructions],
  ['{{QA_CONTEXT}}', qaContext],
  ['{{TRUSTED_INSTRUCTIONS}}', trustedInstructions],
])

const render = (template) => {
  let rendered = template
  for (const [placeholder, value] of replacements) rendered = rendered.replaceAll(placeholder, value)
  return rendered
}

const prompt = `${systemPrompt.trim()}\n\n---\n\n${render(taskTemplate).trim()}\n`
const retryPrompt = `${systemPrompt.trim()}\n\n---\n\n${render(retryTemplate).trim()}\n`
const schema = JSON.stringify(JSON.parse(rawSchema))
if (schema.includes("'")) throw new Error('schema must not contain single quotes')

const appendMultiline = async (name, value) => {
  const delimiter = `AGENTIC_QA_${randomUUID().replaceAll('-', '')}`
  await import('node:fs/promises').then(({ appendFile }) =>
    appendFile(outputPath, `${name}<<${delimiter}\n${value}\n${delimiter}\n`),
  )
}

const { appendFile } = await import('node:fs/promises')
await appendFile(
  outputPath,
  [
    `model=${values.model}`,
    `max-turns=${values.maxTurns}`,
    `agent-browser-version=${values.agentBrowserVersion}`,
    `schema=${schema}`,
  ].join('\n') + '\n',
)
await appendMultiline('prompt', prompt)
await appendMultiline('retry-prompt', retryPrompt)

