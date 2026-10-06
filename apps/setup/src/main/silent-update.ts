import { createRequire } from 'node:module';
import nodeFs, { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// The Setup bundle is CommonJS. esbuild leaves `import.meta.url` empty there,
// and createRequire(undefined) crashes the installer before any window opens.
const require = createRequire(__filename);

/**
 * Electron patches `node:fs` so it can read asar archives. That patch throws
 * `Invalid package` when Setup copies `resources/app.asar` into the install folder.
 */
function loadUnpatchedFs(): typeof nodeFs {
  try {
    return require('original-fs') as typeof nodeFs;
  } catch {
    return nodeFs;
  }
}

const unpatchedFs = loadUnpatchedFs();

/**
 * Copies the extracted Setup Electron app (exe + resources + ICU data), not just the exe.
 * A lone Testrix.exe in `installDir/setup` exits before any window appears.
 */
export function copySetupRuntime(
  sourceDir: string,
  destDir: string,
  io: Pick<typeof nodeFs, 'existsSync' | 'rmSync' | 'mkdirSync' | 'cpSync'> = unpatchedFs,
): void {
  const from = path.resolve(sourceDir);
  const to = path.resolve(destDir);
  if (from === to) return;
  if (io.existsSync(to)) io.rmSync(to, { recursive: true, force: true });
  io.mkdirSync(path.dirname(to), { recursive: true });
  io.cpSync(from, to, { recursive: true });
}

function normalizePath(file: string): string {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** True when `inner` is `outer` or a file/folder under it. */
export function isPathInside(inner: string, outer: string): boolean {
  const child = normalizePath(inner);
  const parent = normalizePath(outer);
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Deletes an install tree with Electron's unpatched fs so `app.asar` does not hang
 * the walk. Skips `keepDir` (the running Setup runtime) when it lives inside the tree.
 */
export async function deleteInstallContents(
  installDir: string,
  keepDir: string | null = null,
  io: Pick<typeof nodeFs, 'existsSync' | 'readdirSync' | 'promises'> = unpatchedFs,
): Promise<void> {
  if (!io.existsSync(installDir)) return;
  const keep = keepDir && isPathInside(keepDir, installDir) ? path.resolve(keepDir) : null;
  if (!keep) {
    await io.promises.rm(installDir, {
      recursive: true,
      force: true,
      maxRetries: 2,
      retryDelay: 150,
    });
    return;
  }
  const entries = io.readdirSync(installDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(installDir, entry.name);
    if (isPathInside(keep, full) || isPathInside(full, keep)) continue;
    await io.promises.rm(full, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
  }
}

/**
 * Writes a VBScript that waits for Testrix `pid` to exit, then deletes `folder`.
 * `wscript.exe` has no console, so this cannot flash a `find` window or loop in Terminal.
 */
export function writeDeferredDeleteScript(folder: string, pid: number, scriptPath: string): string {
  const folderLiteral = folder.replace(/"/g, '""');
  const body = [
    'Option Explicit',
    'Dim pid, folder, deadline, wmi, procs, proc, name, sh, fso',
    `pid = ${Math.floor(pid)}`,
    `folder = "${folderLiteral}"`,
    'deadline = DateAdd("n", 10, Now)',
    'Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")',
    'Do While Now < deadline',
    '  Set procs = wmi.ExecQuery("SELECT Name FROM Win32_Process WHERE ProcessId=" & pid)',
    '  If procs.Count = 0 Then Exit Do',
    '  name = ""',
    '  For Each proc In procs',
    '    name = LCase(proc.Name)',
    '  Next',
    '  If name <> "testrix.exe" Then Exit Do',
    '  WScript.Sleep 500',
    'Loop',
    'Set sh = CreateObject("WScript.Shell")',
    'sh.Run "cmd.exe /c rmdir /s /q """ & folder & """", 0, True',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'On Error Resume Next',
    'fso.DeleteFile WScript.ScriptFullName, True',
    '',
  ].join('\r\n');
  unpatchedFs.writeFileSync(scriptPath, body, 'utf8');
  return scriptPath;
}

/** Hidden `wscript` launch so deferred cleanup never attaches to Windows Terminal. */
export function deferredDeleteSpawn(scriptPath: string): { command: string; args: string[] } {
  return { command: 'wscript.exe', args: ['//B', '//Nologo', scriptPath] };
}

/** Files Setup wrote into the install folder that the app payload does not contain. */
export const PRESERVED_INSTALL_FILES: readonly string[] = ['.install-meta.json', 'uninstall.cmd'];

export interface SilentUpdateArgs {
  readonly installDir: string | null;
  readonly waitPid: number | null;
  readonly relaunch: boolean;
  readonly logFile: string | null;
  readonly updatedFrom: string | null;
  /** Portable Setup's inner exe has no appended zip; the downloaded wrapper does. */
  readonly payloadFile: string | null;
}

export interface SwapFs {
  readonly copyDir: (from: string, to: string) => Promise<void>;
  readonly copyFile: (from: string, to: string) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly remove: (target: string) => Promise<void>;
  readonly exists: (target: string) => boolean;
}

export type UpdateLog = (line: string) => void;

export const nodeSwapFs: SwapFs = {
  copyDir: (from, to) => unpatchedFs.promises.cp(from, to, { recursive: true }),
  copyFile: (from, to) => unpatchedFs.promises.copyFile(from, to),
  rename: (from, to) => unpatchedFs.promises.rename(from, to),
  remove: (target) => unpatchedFs.promises.rm(target, { recursive: true, force: true }),
  exists: (target) => unpatchedFs.existsSync(target),
};

function readValue(argv: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  const value = hit?.slice(prefix.length).trim();
  return value ? value : null;
}

/**
 * The TESTRIXPK footer is on the portable wrapper the app downloaded. After
 * electron-builder extracts that wrapper, `app.getPath('exe')` is the inner
 * Setup.exe and has no payload.
 */
export function resolvePayloadExePath(options: {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly fallbacks?: readonly (string | null | undefined)[];
  readonly exists?: (file: string) => boolean;
}): string | null {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const fromArg = readValue(argv, 'payload-file');
  const fromEnv = env['TESTRIX_PAYLOAD_FILE']?.trim() || env['PORTABLE_EXECUTABLE_FILE']?.trim();
  for (const file of [fromArg, fromEnv, ...(options.fallbacks ?? [])]) {
    if (file && exists(file)) return file;
  }
  return null;
}

export function parseSilentUpdateArgs(argv: readonly string[]): SilentUpdateArgs {
  const pid = Number(readValue(argv, 'wait-pid'));
  return {
    installDir: readValue(argv, 'install-dir'),
    waitPid: Number.isInteger(pid) && pid > 0 ? pid : null,
    relaunch: argv.includes('--relaunch'),
    logFile: readValue(argv, 'log-file'),
    updatedFrom: readValue(argv, 'updated-from'),
    payloadFile: readValue(argv, 'payload-file'),
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Resolves true once `pid` has exited, false when it is still running after `timeoutMs`. */
export async function waitForExit(
  pid: number,
  timeoutMs: number,
  isAlive: (pid: number) => boolean = isProcessAlive,
  pollMs = 250,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return true;
}

/** Appends timestamped lines to the update log; logging never fails the update. */
export function createUpdateLog(file: string | null): UpdateLog {
  return (line) => {
    if (!file) return;
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      appendFileSync(file, `${new Date().toISOString()} ${line}\r\n`, 'utf8');
    } catch {
      // The log folder is unwritable; the update itself carries on.
    }
  };
}

async function withRetries<T>(
  run: () => Promise<T>,
  attempts: number,
  delayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export interface SwapInstallOptions {
  readonly source: string;
  readonly installDir: string;
  readonly fs?: SwapFs;
  readonly log?: UpdateLog;
  /** Windows keeps the folder locked for a moment after the app exits. */
  readonly renameAttempts?: number;
  readonly retryDelayMs?: number;
}

/**
 * Replaces `installDir` with `source`: stage a full copy beside it, move the current
 * build aside, move the staged copy in, then delete the old build. Any failure before
 * the last step puts the old build back, so the install folder is never half-written.
 */
export async function swapInstall(options: SwapInstallOptions): Promise<void> {
  const fs = options.fs ?? nodeSwapFs;
  const log = options.log ?? (() => undefined);
  const attempts = options.renameAttempts ?? 20;
  const delayMs = options.retryDelayMs ?? 500;
  const staged = `${options.installDir}.new`;
  const previous = `${options.installDir}.old`;

  await fs.remove(staged);
  await fs.remove(previous);
  log(`Staging ${options.source} in ${staged}`);
  try {
    await fs.copyDir(options.source, staged);
    for (const name of PRESERVED_INSTALL_FILES) {
      const file = path.join(options.installDir, name);
      if (fs.exists(file)) await fs.copyFile(file, path.join(staged, name));
    }
  } catch (error) {
    await fs.remove(staged);
    throw error;
  }

  try {
    await withRetries(() => fs.rename(options.installDir, previous), attempts, delayMs);
  } catch (error) {
    log('The install folder is still in use; the update was not applied.');
    await fs.remove(staged);
    throw error;
  }

  try {
    await withRetries(() => fs.rename(staged, options.installDir), attempts, delayMs);
  } catch (error) {
    log('Moving the new build into place failed; restoring the previous build.');
    await withRetries(() => fs.rename(previous, options.installDir), attempts, delayMs);
    await fs.remove(staged);
    throw error;
  }

  try {
    await fs.remove(previous);
  } catch {
    log(`Could not delete ${previous}; it is removed on the next update.`);
  }
  log('Swap finished.');
}
