/**
 * [DEPRECATED - HTTP Server Mode]
 *
 * This file is retained for potential future HTTP Server mode support.
 * Current implementation uses Local Mode (see src/local.ts).
 *
 * DO NOT USE for new code.
 */

import { resolvePaths } from './paths.js';
import { randomBytes } from 'node:crypto';

/**
 * @deprecated Use LocalRuntimeConfig from './types.js' instead
 */
export interface RuntimeConfig {
  workspacePath: string;
  configDir?: string;
  host?: string;
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  bearerToken?: string;
  corsOrigins?: string[];
}

/**
 * @deprecated HTTP Server mode is not currently implemented
 */
export interface ResolvedRuntimeConfig {
  workspacePath: string;
  configDir: string;
  host: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  bearerToken: string;
  corsOrigins: string[];
}

/**
 * @deprecated Use createLocalRuntime() from './local.js' instead
 */
export function resolveConfig(config: RuntimeConfig): ResolvedRuntimeConfig {
  const paths = resolvePaths({
    workspacePath: config.workspacePath,
  });

  const bearerToken =
    config.bearerToken || randomBytes(32).toString('base64url');

  return {
    workspacePath: paths.workspacePath,
    configDir: config.configDir ?? '.mastracode',
    host: config.host ?? '127.0.0.1',
    port: config.port ?? 0,
    logLevel: config.logLevel ?? 'info',
    bearerToken,
    corsOrigins: config.corsOrigins ?? [],
  };
}
