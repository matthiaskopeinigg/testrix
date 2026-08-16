export interface SecretScanFinding {
  readonly fileName: string;
  readonly kind: 'private-key' | 'aws-key' | 'jwt' | 'bearer' | 'inline-env-secret' | 'inline-db-password';
  readonly severity: 'block' | 'warn';
  readonly excerpt: string;
}

const PATTERNS: readonly {
  readonly kind: SecretScanFinding['kind'];
  readonly severity: SecretScanFinding['severity'];
  readonly re: RegExp;
}[] = [
  {
    kind: 'private-key',
    severity: 'block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    kind: 'aws-key',
    severity: 'block',
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    kind: 'jwt',
    severity: 'warn',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    kind: 'bearer',
    severity: 'warn',
    re: /\bBearer\s+[A-Za-z0-9._\-+=/]{16,}\b/,
  },
];

/**
 * Scans workspace JSON text for high-confidence secrets that should not be pushed.
 */
export function scanWorkspaceTextForSecrets(
  fileName: string,
  raw: string,
): readonly SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];
  for (const pattern of PATTERNS) {
    const match = pattern.re.exec(raw);
    if (!match) {
      continue;
    }
    findings.push({
      fileName,
      kind: pattern.kind,
      severity: pattern.severity,
      excerpt: match[0].slice(0, 48),
    });
  }
  if (fileName.endsWith('environments.json')) {
    try {
      const parsed = JSON.parse(raw) as {
        environments?: Array<{
          nodes?: Array<{ kind?: string; secret?: boolean; value?: string; children?: unknown[] }>;
        }>;
      };
      const walk = (nodes: unknown[] | undefined): boolean => {
        if (!Array.isArray(nodes)) {
          return false;
        }
        for (const node of nodes) {
          if (!node || typeof node !== 'object') {
            continue;
          }
          const record = node as {
            kind?: string;
            secret?: boolean;
            value?: string;
            children?: unknown[];
          };
          if (record.kind === 'variable' && record.secret && (record.value ?? '').trim()) {
            return true;
          }
          if (record.kind === 'folder' && walk(record.children)) {
            return true;
          }
        }
        return false;
      };
      if (parsed.environments?.some((environment) => walk(environment.nodes))) {
        findings.push({
          fileName,
          kind: 'inline-env-secret',
          severity: 'block',
          excerpt: 'secret:true variable still has an inline value',
        });
      }
    } catch {
      /* ignore invalid JSON */
    }
  }
  if (fileName.endsWith('databases.json')) {
    try {
      const parsed = JSON.parse(raw) as { nodes?: unknown[] };
      const hasPassword = (nodes: unknown[] | undefined): boolean => {
        if (!Array.isArray(nodes)) {
          return false;
        }
        for (const node of nodes) {
          if (!node || typeof node !== 'object') {
            continue;
          }
          const record = node as { kind?: string; password?: string; children?: unknown[] };
          if ((record.password ?? '').trim()) {
            return true;
          }
          if (record.kind === 'folder' && hasPassword(record.children)) {
            return true;
          }
        }
        return false;
      };
      if (hasPassword(parsed.nodes)) {
        findings.push({
          fileName,
          kind: 'inline-db-password',
          severity: 'block',
          excerpt: 'database connection password must stay local',
        });
      }
    } catch {
      /* ignore invalid JSON */
    }
  }
  return findings;
}

/**
 * True when any finding should block a Teams push.
 */
export function secretScanShouldBlock(findings: readonly SecretScanFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'block');
}
