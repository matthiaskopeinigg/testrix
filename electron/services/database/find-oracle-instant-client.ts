import fs from 'node:fs';
import path from 'node:path';

/**
 * File name of the Instant Client / Oracle Client library on this platform.
 */
export function oracleClientLibraryName(): string {
  if (process.platform === 'win32') {
    return 'oci.dll';
  }
  if (process.platform === 'darwin') {
    return 'libclntsh.dylib';
  }
  return 'libclntsh.so';
}

/**
 * True when `dir` (or `dir/bin`) contains the Oracle Client library.
 */
export function resolveOracleClientLibDir(
  dir: string | undefined,
  exists: (filePath: string) => boolean = fs.existsSync,
): string | undefined {
  const trimmed = dir?.trim();
  if (!trimmed) {
    return undefined;
  }
  const lib = oracleClientLibraryName();
  if (exists(path.join(trimmed, lib))) {
    return trimmed;
  }
  const bin = path.join(trimmed, 'bin');
  if (exists(path.join(bin, lib))) {
    return bin;
  }
  return undefined;
}

/**
 * Directories that may contain Instant Client or a full Oracle Client.
 * DataGrip does not ship this library (it uses JDBC); SQL*Plus / Instant Client do.
 */
export function listOracleClientSearchDirs(): string[] {
  const out: string[] = [];
  const push = (value: string | undefined): void => {
    const trimmed = value?.trim();
    if (trimmed) {
      out.push(trimmed);
    }
  };
  push(process.env['OCI_LIB_DIR']);
  push(process.env['ORACLE_HOME']);
  push(process.env['ORACLE_BASE']);
  const pathEnv = process.env['PATH'] ?? process.env['Path'] ?? '';
  for (const part of pathEnv.split(path.delimiter)) {
    push(part);
  }
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    out.push(
      path.join(programFiles, 'Oracle'),
      path.join(programFilesX86, 'Oracle'),
      'C:\\oracle',
      'C:\\Oracle',
      'C:\\app',
    );
  } else {
    out.push('/opt/oracle', '/usr/lib/oracle', '/usr/local/lib');
  }
  return out;
}

/**
 * First Instant Client / Oracle Client directory that contains the OCI library.
 */
export function findOracleInstantClientDir(explicit?: string): string | undefined {
  const seen = new Set<string>();
  const consider = (dir: string | undefined): string | undefined => {
    const resolved = resolveOracleClientLibDir(dir);
    if (!resolved || seen.has(resolved)) {
      return undefined;
    }
    seen.add(resolved);
    return resolved;
  };
  const fromExplicit = consider(explicit);
  if (fromExplicit) {
    return fromExplicit;
  }
  for (const dir of listOracleClientSearchDirs()) {
    const found = consider(dir);
    if (found) {
      return found;
    }
    if (looksLikeOracleParent(dir)) {
      const nested = scanImmediateChildren(dir, consider);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function looksLikeOracleParent(dir: string): boolean {
  const base = path.basename(dir).toLowerCase();
  return base === 'oracle' || base === 'app' || base.includes('instantclient');
}

function scanImmediateChildren(
  dir: string,
  consider: (child: string) => string | undefined,
): string | undefined {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  for (const name of entries) {
    const found = consider(path.join(dir, name));
    if (found) {
      return found;
    }
  }
  return undefined;
}
