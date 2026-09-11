import { describe, it, expect } from 'vitest';
import { resolvePaths } from '../src/paths.js';

describe('paths', () => {
  it('resolves absolute workspace path', () => {
    const result = resolvePaths({
      workspacePath: '/Users/test/project',
    });

    expect(result.workspacePath).toBe('/Users/test/project');
  });

  it('resolves relative workspace path', () => {
    const result = resolvePaths({
      workspacePath: './test-project',
    });

    expect(result.workspacePath).toContain('test-project');
  });

  it('uses the OS home directory when homeDir is not provided', () => {
    const result = resolvePaths({
      workspacePath: '/Users/test/project',
    });

    expect(result.homeDir).toBeTruthy();
  });

  it('resolves a custom homeDir', () => {
    const result = resolvePaths({
      workspacePath: '/Users/test/project',
      homeDir: './test-home',
    });

    expect(result.homeDir).toContain('test-home');
  });
});
