import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const actionPath = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(actionPath, 'scripts', 'prepare.mjs')

const baseEnv = (workspace, output) => ({
  ...process.env,
  GITHUB_ACTION_PATH: actionPath,
  GITHUB_WORKSPACE: workspace,
  GITHUB_OUTPUT: output,
  INPUT_APP_URL: 'http://127.0.0.1:4173',
  INPUT_QA_CONTEXT: 'A user can save an item.',
  INPUT_INSTRUCTIONS: 'Verify refresh persistence.',
  INPUT_INSTRUCTIONS_FILE: '',
  INPUT_DEVICE: 'iPhone 14',
  INPUT_MODEL: 'claude-sonnet-5',
  INPUT_MAX_TURNS: '80',
  INPUT_AGENT_BROWSER_VERSION: '0.32.3',
  INPUT_REPORT_PATH: 'qa-report.md',
  INPUT_SCREENSHOTS_DIR: 'qa-screenshots',
  INPUT_VIDEOS_DIR: 'qa-videos',
  INPUT_PROVENANCE_PATH: 'qa-provenance.json',
  INPUT_RECORD_VIDEO: 'true',
  INPUT_CLEAR_STORAGE: 'true',
  INPUT_PR_NUMBER: '42',
  INPUT_TESTED_HEAD_SHA: 'a'.repeat(40),
  INPUT_ARTIFACT_NAME: 'agentic-browser-qa-42',
})

test('prepares bounded action outputs and renders trusted instructions', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'agentic-qa-prepare-'))
  const output = path.join(workspace, 'output.txt')
  await writeFile(path.join(workspace, 'instructions.md'), 'Prefer keyboard navigation.\n')
  const env = baseEnv(workspace, output)
  env.INPUT_INSTRUCTIONS_FILE = 'instructions.md'
  const result = spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const rendered = await readFile(output, 'utf8')
  assert.match(rendered, /^model=claude-sonnet-5$/m)
  assert.match(rendered, /^max-turns=80$/m)
  assert.match(rendered, /A user can save an item\./)
  assert.match(rendered, /Verify refresh persistence\./)
  assert.match(rendered, /Prefer keyboard navigation\./)
  assert.match(rendered, /agent-browser record start qa-videos\/walkthrough\.webm/)
})

test('rejects command-line interpolation characters and escaping paths', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'agentic-qa-invalid-'))
  const output = path.join(workspace, 'output.txt')
  const invalidModel = baseEnv(workspace, output)
  invalidModel.INPUT_MODEL = 'model\n--dangerous'
  const modelResult = spawnSync(process.execPath, [scriptPath], { env: invalidModel, encoding: 'utf8' })
  assert.notEqual(modelResult.status, 0)

  const invalidPath = baseEnv(workspace, output)
  invalidPath.INPUT_REPORT_PATH = '../report.md'
  const pathResult = spawnSync(process.execPath, [scriptPath], { env: invalidPath, encoding: 'utf8' })
  assert.notEqual(pathResult.status, 0)
})

