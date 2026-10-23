import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const releaseDir = join(projectRoot, 'release')
const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
const portable = `Grace-PHP-Host-Backup-${packageJson.version}-portable.exe`

if (!(await stat(join(releaseDir, portable)).catch(() => null))) {
  throw new Error(`未找到 portable EXE 构建产物：${portable}`)
}

const source = join(releaseDir, portable)
const localized = join(releaseDir, '恩典PHP主机一键备份.exe')
await copyFile(source, localized)

const hash = createHash('sha256')
const stream = createReadStream(localized)
for await (const chunk of stream) {
  hash.update(chunk)
}

const info = await stat(localized)
await mkdir(releaseDir, { recursive: true })
console.log(`Built: ${localized}`)
console.log(`Size:  ${info.size} bytes`)
console.log(`SHA256: ${hash.digest('hex')}`)
