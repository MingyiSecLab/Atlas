#!/usr/bin/env node
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const hostWorkspace = resolve(
  process.env.MINGYI_SANDBOX_WORKSPACE_DIR || join(homedir(), '.atlas', 'sandbox_workspace')
)
mkdirSync(hostWorkspace, { recursive: true })

const containerName = process.env.MINGYI_SANDBOX_CONTAINER || 'mingyi-sandbox'
const image = process.env.MINGYI_SANDBOX_IMAGE || 'mingyi-sandbox:latest'
const networkMode = process.env.MINGYI_SANDBOX_NETWORK || 'host'
const mountPath = hostWorkspace.replaceAll('\\', '/')

console.log(`[Atlas Sandbox] Checking container '${containerName}'...`)

const inspectRes = spawnSync(
  'docker',
  ['inspect', '--type', 'container', '--format', '{{.State.Status}}\n{{json .HostConfig.Binds}}', containerName],
  { encoding: 'utf8' }
)

if (inspectRes.status === 0) {
  const [status, rawBinds] = inspectRes.stdout.trim().split('\n')
  let binds = []
  try {
    binds = JSON.parse(rawBinds || '[]')
  } catch {}

  const isMatched = binds.some((b) => {
    const m = b.match(/^(.*?):(\/[^:]+)(?::.*)?$/)
    if (!m) return false
    const host = resolve(m[1]).replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '')
    const target = mountPath.toLowerCase().replace(/\/+$/, '')
    return m[2] === '/home/kali/workspace' && host === target
  })

  if (isMatched && status === 'running') {
    console.log(`[Atlas Sandbox] Container '${containerName}' is already running with workspace mounted at: ${hostWorkspace}`)
    process.exit(0)
  }

  console.log(`[Atlas Sandbox] Existing container has mismatched configuration (status=${status}, matchedMount=${isMatched}). Recreating...`)
  spawnSync('docker', ['rm', '-f', containerName], { stdio: 'inherit' })
}

console.log(`[Atlas Sandbox] Starting Kali sandbox container '${containerName}'...`)
console.log(`[Atlas Sandbox] Host Workspace: ${hostWorkspace}`)
console.log(`[Atlas Sandbox] Container Workspace: /home/kali/workspace`)

const runArgs = [
  'run',
  '-d',
  '--name',
  containerName,
  '--network',
  networkMode,
  '--cap-add=NET_RAW',
  '--cap-add=NET_ADMIN',
  '-v',
  `${mountPath}:/home/kali/workspace`,
  image
]

const runRes = spawnSync('docker', runArgs, { stdio: 'inherit' })
if (runRes.status === 0) {
  console.log(`[Atlas Sandbox] Kali sandbox container started successfully.`)
} else {
  console.error(`[Atlas Sandbox] Failed to start container (exit code ${runRes.status})`)
}
process.exit(runRes.status ?? 0)
