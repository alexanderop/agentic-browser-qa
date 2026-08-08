import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isValidScreenshotFilename, isValidVideoFilename } from './policy.mjs'

const reportPath = process.env.REPORT_PATH ?? 'qa-report.md'
const screenshotsDir = process.env.SCREENSHOTS_DIR ?? 'qa-screenshots'
const videosDir = process.env.VIDEOS_DIR ?? 'qa-videos'
const provenancePath = process.env.PROVENANCE_PATH ?? 'qa-provenance.json'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function hasPngSignature(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
}

export function hasWebmSignature(bytes) {
  return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
}

async function sanitizeDirectory(directory, options) {
  await mkdir(directory, { recursive: true })
  const names = (await readdir(directory)).sort()
  const accepted = []
  for (const name of names) {
    const file = path.join(directory, name)
    const stat = await lstat(file)
    const bytes = stat.isFile() && !stat.isSymbolicLink() ? await readFile(file) : Buffer.alloc(0)
    const valid = stat.isFile()
      && !stat.isSymbolicLink()
      && options.filename(name)
      && stat.size > 0
      && stat.size <= options.maxBytes
      && options.signature(bytes)
      && accepted.length < options.maxFiles
    if (!valid) {
      await rm(file, { recursive: true, force: true })
      console.warn(`Dropped invalid QA evidence: ${file}`)
      continue
    }
    accepted.push({ file: name, sha256: sha256(bytes), bytes: stat.size })
  }
  return accepted
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const screenshots = await sanitizeDirectory(screenshotsDir, {
    filename: isValidScreenshotFilename,
    signature: hasPngSignature,
    maxBytes: 10 * 1024 * 1024,
    maxFiles: 12,
  })
  const videos = await sanitizeDirectory(videosDir, {
    filename: isValidVideoFilename,
    signature: hasWebmSignature,
    maxBytes: 50 * 1024 * 1024,
    maxFiles: 1,
  })

  const report = await readFile(reportPath).catch(() => null)
  const provenance = {
    schema_version: 1,
    action_ref: process.env.ACTION_REF ?? '',
    pr_number: process.env.PR_NUMBER ?? '',
    tested_head_sha: process.env.TESTED_HEAD_SHA ?? '',
    report_sha256: report ? sha256(report) : '',
    screenshots,
    videos,
  }
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
}
