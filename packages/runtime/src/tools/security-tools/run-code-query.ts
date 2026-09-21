/**
 * run_code_query: 批量结构化源码检索，面向白盒安全分析 (read-only)。
 *
 * 安全工具域成员：实现 pentest 的 RuntimePentestTool 契约，由
 * pentest 域的 executor 与安全闸统一调度：
 * - 只读检索：支持 rg / grep / ast-grep / comby 的 match-only 模式，不写入、不出网
 * - argv 数组 spawn（不经 shell），stdout/stderr 共享 2MB 预算、单查询超时受控
 * - 所有查询路径经词法 + realpath 双重校验，严格约束在工作区内（防符号链接逃逸）
 * - 完整输出落盘 .agents/pentest/code-queries/，上下文只保留前 40 行样本
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { realpathSync } from 'node:fs'
import { runSpawnBounded } from '../runtime-tools/bounded-process.js'
import type { RuntimePentestTool } from '../../pentest/tools.js'
import { resolvePentestArtifactsRoot } from './documentApp.js'

const MAX_INLINE_MATCHES = 40
const MAX_QUERY_CAPTURE_BYTES = 2 * 1024 * 1024
const MAX_QUERIES = 40
const DEFAULT_TIMEOUT_SECONDS = 20
const MAX_TIMEOUT_SECONDS = 900

const QUERY_ENGINES = ['rg', 'grep', 'ast-grep', 'comby'] as const
type QueryEngine = (typeof QUERY_ENGINES)[number]

const RUN_CODE_QUERY_DESCRIPTION = [
  'Run batch structured source-code searches for whitebox analysis.',
  `Engines: ${QUERY_ENGINES.join(' / ')} (default rg; must be installed locally).`,
  'Arguments: queries (1-40 items of { pattern, path? }; path is a file/directory',
  'relative to the workspace and must stay inside it), cwd (optional query root,',
  'default workspacePath), engine (optional), timeoutSeconds (optional, default 20, max 900).',
  'Returns per-query match counts, the first 40 lines as a sample, and artifact paths;',
  'full output is persisted under .agents/pentest/code-queries/.'
].join(' ')

interface CodeQuery {
  pattern: string
  path?: string
}

interface QueryResult {
  engine: string
  pattern: string
  path: string
  exitCode: number | null
  matchCount: number
  sample: string[]
  artifactPath?: string
  outputTruncated?: boolean
  timedOut?: boolean
  error?: string
}

function buildEngineArgs(engine: QueryEngine, pattern: string, targetPath: string): string[] {
  switch (engine) {
    case 'rg':
      return ['--line-number', '--no-heading', '--', pattern, targetPath]
    case 'ast-grep':
      return ['run', '--pattern', pattern, targetPath]
    case 'comby':
      return [pattern, '', '-match-only', targetPath]
    default:
      return ['-rn', '--', pattern, targetPath]
  }
}

function isUnderRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 将查询路径约束在工作区根内：先词法校验（拦截 `..` 穿越），存在时再做
 * realpath 双向校验（拦截符号链接逃逸）。
 */
function resolveWithinWorkspace(root: string, subPath: string): string {
  const absRoot = resolve(root)
  const candidate = isAbsolute(subPath) ? resolve(subPath) : resolve(absRoot, subPath)
  if (!isUnderRoot(absRoot, candidate)) {
    throw new Error(`Path escapes the workspace root: ${subPath}`)
  }
  if (existsSync(candidate)) {
    const realRoot = realpathSync(absRoot)
    const realCandidate = realpathSync(candidate)
    if (!isUnderRoot(realRoot, realCandidate)) {
      throw new Error(`Path escapes the workspace root via symlink: ${subPath}`)
    }
  }
  return candidate
}

function safeArtifactName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/\.\.+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function parseQueries(value: unknown): CodeQuery[] {
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      throw new Error('run_code_query arguments.queries must be an array or a JSON array string.')
    }
  }
  if (!Array.isArray(raw)) {
    throw new Error('run_code_query requires arguments.queries to be an array of { pattern, path? }.')
  }
  const queries: CodeQuery[] = []
  for (const entry of raw.slice(0, MAX_QUERIES)) {
    if (typeof entry === 'string') {
      if (entry.trim()) queries.push({ pattern: entry })
      continue
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      if (typeof record.pattern === 'string' && record.pattern.trim()) {
        queries.push({
          pattern: record.pattern,
          path: typeof record.path === 'string' && record.path ? record.path : undefined
        })
      }
    }
  }
  return queries
}

export function createRunCodeQueryTool(): RuntimePentestTool {
  return {
    name: 'run_code_query',
    kind: 'read-only',
    description: RUN_CODE_QUERY_DESCRIPTION,
    timeoutMs: 300_000,
    async execute(command, context) {
      const args = command.arguments ?? {}
      const engine: QueryEngine = QUERY_ENGINES.includes(args.engine as QueryEngine)
        ? (args.engine as QueryEngine)
        : 'rg'
      const queries = parseQueries(args.queries)
      if (queries.length === 0) {
        throw new Error(
          'run_code_query requires at least one query with a non-empty pattern in arguments.queries.'
        )
      }
      const rawTimeout = Number(args.timeoutSeconds)
      const timeoutSeconds =
        Number.isFinite(rawTimeout) && rawTimeout > 0
          ? Math.min(Math.floor(rawTimeout), MAX_TIMEOUT_SECONDS)
          : DEFAULT_TIMEOUT_SECONDS

      const workspaceRoot = resolve(context.workspacePath)
      let rootPath: string
      try {
        rootPath =
          typeof args.cwd === 'string' && args.cwd
            ? resolveWithinWorkspace(workspaceRoot, args.cwd)
            : workspaceRoot
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          output: JSON.stringify(
            {
              success: false,
              summary: message,
              results: [] as QueryResult[],
              artifactPaths: [],
              nextActions: ['Use cwd and query paths inside the workspace root.'],
              recovery: 'Relative cwd is resolved from the workspace root and constrained under it.'
            },
            null,
            2
          ),
          exitCode: 0
        }
      }

      const artifactsRoot = resolvePentestArtifactsRoot(context)
      const queriesDir = resolve(artifactsRoot, '.agents', 'pentest', 'code-queries')
      if (!queriesDir.startsWith(artifactsRoot + sep)) {
        throw new Error('Code query artifacts directory escapes the workspace root.')
      }

      const results: QueryResult[] = []
      for (const query of queries) {
        let targetPathForEngine = '.'
        try {
          const absTarget = resolveWithinWorkspace(rootPath, query.path ?? '.')
          targetPathForEngine = relative(rootPath, absTarget) || '.'
        } catch (error) {
          results.push({
            engine,
            pattern: query.pattern,
            path: query.path ?? '.',
            exitCode: null,
            matchCount: 0,
            sample: [],
            error: error instanceof Error ? error.message : String(error)
          })
          continue
        }

        const output = await runSpawnBounded({
          command: [engine, ...buildEngineArgs(engine, query.pattern, targetPathForEngine)],
          cwd: rootPath,
          timeoutSeconds,
          maxTotalBytes: MAX_QUERY_CAPTURE_BYTES,
          detached: false
        })

        const lines = output.stdout.split('\n').filter(Boolean)
        const combined = output.stdout + (output.stderr ? `\n\n[stderr]\n${output.stderr}` : '')

        let artifactPath: string | undefined
        if (combined.trim().length > 0 || output.timedOut || output.outputTruncated) {
          await mkdir(queriesDir, { recursive: true })
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const filename = `${timestamp}-${safeArtifactName(`${engine}-${query.pattern.slice(0, 40)}`)}.txt`
          const filepath = join(queriesDir, filename)
          const content =
            [
              `# ${engine} query for ${query.pattern}`,
              `# cwd: ${rootPath}`,
              `# path: ${targetPathForEngine}`,
              '',
              combined,
              output.outputTruncated ? '\n[mingyi] stdout/stderr truncated at byte cap.' : '',
              output.timedOut ? '\n[mingyi] query timed out.' : ''
            ]
              .filter(Boolean)
              .join('\n') + '\n'
          await writeFile(filepath, content, 'utf-8')
          artifactPath = filepath
        }

        results.push({
          engine,
          pattern: query.pattern,
          path: targetPathForEngine,
          exitCode: output.exitCode,
          matchCount: lines.length,
          sample: lines.slice(0, MAX_INLINE_MATCHES),
          artifactPath,
          outputTruncated: output.outputTruncated,
          timedOut: output.timedOut,
          error:
            output.exitCode === null
              ? `Engine unavailable or failed to start: ${output.stderr || 'unknown error'}`
              : output.exitCode === 0 || output.exitCode === 1
                ? undefined
                : output.stderr || undefined
        })
      }

      const totalMatches = results.reduce((sum, result) => sum + result.matchCount, 0)
      return {
        output: JSON.stringify(
          {
            success: results.every((result) => !result.error),
            summary: `Ran ${results.length} ${engine} query(s), ${totalMatches} match line(s).`,
            results,
            artifactPaths: results
              .map((result) => result.artifactPath)
              .filter((path): path is string => Boolean(path)),
            nextActions: [
              'Read high-signal files around representative matches.',
              'Trace candidate sinks backward to attacker-controlled sources.'
            ],
            truncated: results.some((result) => result.matchCount > MAX_INLINE_MATCHES),
            recovery: results.some((result) => result.error)
              ? 'If the engine is unavailable or the pattern syntax failed, retry with engine=grep or a simpler pattern.'
              : undefined
          },
          null,
          2
        ),
        exitCode: 0
      }
    }
  }
}
