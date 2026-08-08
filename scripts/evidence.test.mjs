import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { hasPngSignature, hasWebmSignature } from './evidence.mjs'

const scriptPath = fileURLToPath(new URL('./evidence.mjs', import.meta.url))

test('recognizes PNG and WebM magic bytes', () => {
  assert.equal(hasPngSignature(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true)
  assert.equal(hasPngSignature(Buffer.from('not png')), false)
  assert.equal(hasWebmSignature(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), true)
  assert.equal(hasWebmSignature(Buffer.from('not webm')), false)
})

test('sanitizes evidence and writes hash provenance', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agentic-qa-evidence-'))
  await mkdir(path.join(directory, 'shots'))
  await mkdir(path.join(directory, 'videos'))
  await writeFile(path.join(directory, 'report.md'), 'verified report\n')
  await writeFile(
    path.join(directory, 'shots', 'valid.png'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]),
  )
  await writeFile(path.join(directory, 'shots', 'invalid.png'), Buffer.from('not png'))
  await writeFile(
    path.join(directory, 'videos', 'walkthrough.webm'),
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1]),
  )

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: directory,
    env: {
      ...process.env,
      REPORT_PATH: 'report.md',
      SCREENSHOTS_DIR: 'shots',
      VIDEOS_DIR: 'videos',
      PROVENANCE_PATH: 'provenance.json',
      PR_NUMBER: '42',
      TESTED_HEAD_SHA: 'a'.repeat(40),
    },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const provenance = JSON.parse(await readFile(path.join(directory, 'provenance.json'), 'utf8'))
  assert.equal(provenance.pr_number, '42')
  assert.match(provenance.report_sha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(provenance.screenshots.map(({ file }) => file), ['valid.png'])
  assert.deepEqual(provenance.videos.map(({ file }) => file), ['walkthrough.webm'])
  await assert.rejects(readFile(path.join(directory, 'shots', 'invalid.png')))
})

