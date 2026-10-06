#!/usr/bin/env node
// Downloads the pretzel-desktop installers from a GitHub Release and uploads
// them to Vercel Blob under pretzel-desktop/ (what getDownloads.ts reads),
// then deletes any older-version blobs so the store doesn't accumulate.
//
// electron-builder's --publish always creates its OWN release tag "v<version>"
// (not the "pretzel-desktop-v<version>" git tag that triggers the build) —
// this script targets that release tag.
//
// Usage:
//   pnpm publish-blob:staging [version]
//   pnpm publish-blob:prod [version]
// version defaults to pretzel-desktop/package.json's current version.
import { list, put, del } from '@vercel/blob'
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = 'yarin-mag/mykka.ai'
const PREFIX = 'pretzel-desktop/'

const desktopPkgPath = join(__dirname, '..', '..', 'pretzel-desktop', 'package.json')
const version = process.argv[2] ?? JSON.parse(readFileSync(desktopPkgPath, 'utf-8')).version
const releaseTag = `v${version}`

console.log(`Publishing pretzel-desktop ${version} (GitHub release ${releaseTag}) to Vercel Blob...`)

const tmp = mkdtempSync(join(tmpdir(), 'pretzel-desktop-blob-'))

try {
  execSync(
    `gh release download ${releaseTag} --repo ${REPO} --dir "${tmp}" --clobber ` +
    `--pattern "Pretzel-Desktop-*.dmg" --pattern "Pretzel-Desktop-Setup-*.exe" --pattern "Pretzel-Desktop-*.AppImage"`,
    { stdio: 'inherit' }
  )

  const files = readdirSync(tmp)
  if (files.length !== 4) {
    console.error(`Expected 4 installer files (mac arm64 dmg, mac intel dmg, windows exe, linux AppImage), found ${files.length}: ${files.join(', ')}`)
    process.exit(1)
  }
  console.log(`Downloaded: ${files.join(', ')}`)

  for (const file of files) {
    const buffer = readFileSync(join(tmp, file))
    const blob = await put(`${PREFIX}${file}`, buffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    console.log(`Uploaded ${file} -> ${blob.url}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

const { blobs } = await list({ prefix: PREFIX })
const stale = blobs.filter(b => !b.pathname.includes(version))
if (stale.length > 0) {
  await del(stale.map(b => b.url))
  console.log(`Deleted ${stale.length} stale blob(s) from previous version(s): ${stale.map(b => b.pathname).join(', ')}`)
} else {
  console.log('No stale blobs to delete.')
}

console.log(`\nDone. mykka.ai/download now serves pretzel-desktop ${version}.`)
