import { resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

export interface PathsInput {
  workspacePath: string;
  homeDir?: string;
}

export interface ResolvedPaths {
  workspacePath: string;
  homeDir: string;
}

export function resolvePaths(input: PathsInput): ResolvedPaths {
  const workspacePath = resolveAbsolutePath(input.workspacePath);

  const homeDir = input.homeDir
    ? resolveAbsolutePath(input.homeDir)
    : homedir();

  return {
    workspacePath,
    homeDir,
  };
}

function resolveAbsolutePath(path: string): string {
  if (path.startsWith('~')) {
    return resolve(homedir(), path.slice(1));
  }
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}
