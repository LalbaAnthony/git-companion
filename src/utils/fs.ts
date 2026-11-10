import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

// Key under which two paths to the same entry compare equal: symbolic links
// resolved, and the letter case on Windows. A path that cannot be resolved is
// only made absolute.
export async function canonicalPath(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch {
    return path.resolve(target);
  }
}

// The helpers below follow symbolic links and answer false on any error
// (missing entry, permission denied...)

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}
