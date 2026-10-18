import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const cases = [
  { name: 'published release', output: 'false', status: 0, expected: 1 },
  { name: 'draft release', output: 'true', status: 0, expected: 0 },
  { name: 'missing release', error: 'release not found', status: 1, expected: 0 },
  { name: 'API failure', error: 'HTTP 403: Forbidden', status: 1, expected: 1 },
  { name: 'network failure', error: 'connection refused', status: 1, expected: 1 },
  { name: 'invalid response', output: 'null', status: 0, expected: 1 }
]

for (const scenario of cases) {
  test(scenario.name, () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-release-'))
    try {
      writeFileSync(
        join(dir, 'gh'),
        '#!/usr/bin/env bash\nprintf "%s\\n" "$MOCK_OUTPUT"\nprintf "%s\\n" "$MOCK_ERROR" >&2\nexit "$MOCK_STATUS"\n',
        { mode: 0o755 }
      )
      const result = spawnSync('bash', ['.github/scripts/guard-release.sh'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}${delimiter}${process.env.PATH}`,
          RELEASE_TAG: 'v2.1.0',
          MOCK_OUTPUT: scenario.output ?? '',
          MOCK_ERROR: scenario.error ?? '',
          MOCK_STATUS: String(scenario.status)
        }
      })
      assert.equal(result.status, scenario.expected, result.stdout + result.stderr)
      if (scenario.name === 'published release') {
        assert.match(result.stdout, /拒绝覆盖/)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
