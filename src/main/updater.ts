import { app } from 'electron'
import type { UpdateCheckResult } from '../shared/types'

const REPOSITORY = 'JJosephph/Grace-PHP-Host-Backup'
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  published_at?: string
  assets: GitHubReleaseAsset[]
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }

  return 0
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Grace-PHP-Host-Backup'
    }
  })

  if (!response.ok) {
    throw new Error(`更新服务器返回 ${response.status}`)
  }

  const release = (await response.json()) as GitHubRelease
  if (!release.tag_name || !release.html_url) {
    throw new Error('更新服务器返回格式异常')
  }
  const currentVersion = normalizeVersion(app.getVersion())
  const latestVersion = normalizeVersion(release.tag_name)
  const portableAsset = release.assets.find(
    (asset) => /^Grace-PHP-Host-Backup-.*-portable\.exe$/i.test(asset.name)
  )

  return {
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: release.html_url,
    downloadUrl: portableAsset?.browser_download_url,
    publishedAt: release.published_at
  }
}
