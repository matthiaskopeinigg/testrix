/**
 * A parsed MongoDB shell snippet that Testrix can run against the Node driver.
 */
export type MongoShellCommand =
  | { readonly kind: 'listDatabases' }
  | { readonly kind: 'listCollections'; readonly database?: string }
  | {
      readonly kind: 'find';
      readonly database?: string;
      readonly collection: string;
      readonly filter: unknown;
      readonly projection?: unknown;
      readonly skip?: number;
      readonly limit?: number;
    }
  | {
      readonly kind: 'findOne';
      readonly database?: string;
      readonly collection: string;
      readonly filter: unknown;
      readonly projection?: unknown;
    }
  | {
      readonly kind: 'aggregate';
      readonly database?: string;
      readonly collection: string;
      readonly pipeline: unknown[];
    }
  | {
      readonly kind: 'insertOne';
      readonly database?: string;
      readonly collection: string;
      readonly document: unknown;
    }
  | {
      readonly kind: 'insertMany';
      readonly database?: string;
      readonly collection: string;
      readonly documents: unknown[];
    }
  | {
      readonly kind: 'updateOne' | 'updateMany';
      readonly database?: string;
      readonly collection: string;
      readonly filter: unknown;
      readonly update: unknown;
    }
  | {
      readonly kind: 'deleteOne' | 'deleteMany';
      readonly database?: string;
      readonly collection: string;
      readonly filter: unknown;
    }
  | {
      readonly kind: 'countDocuments';
      readonly database?: string;
      readonly collection: string;
      readonly filter: unknown;
    }
  | {
      readonly kind: 'listIndexes';
      readonly database?: string;
      readonly collection: string;
    }
  | {
      readonly kind: 'command';
      readonly database?: string;
      readonly command: Record<string, unknown>;
    };

const FIND_CHAIN = /^(db(?:\.getSiblingDB\(\s*(['"])(.+?)\2\s*\))?(?:\.getCollection\(\s*(['"])(.+?)\4\s*\)|\.([A-Za-z_][\w$]*))\s*\.\s*find\s*\()/i;

/**
 * True when a Mongo snippet is a `find` that can take skip/limit paging.
 */
export function canPageMongoFind(query: string): boolean {
  const trimmed = stripTrailingSemicolons(query);
  return FIND_CHAIN.test(trimmed) && !/\.aggregate\s*\(/i.test(trimmed);
}

/**
 * Appends `.skip` / `.limit` onto a `db.collection.find(...)` snippet.
 */
export function wrapMongoFindPage(query: string, limit: number, offset: number): string {
  const inner = stripTrailingSemicolons(query)
    .replace(/\.skip\s*\(\s*\d+\s*\)/gi, '')
    .replace(/\.limit\s*\(\s*\d+\s*\)/gi, '')
    .trim();
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  return `${inner}.skip(${safeOffset}).limit(${safeLimit})`;
}

/**
 * Parses a small Mongo shell / JSON command subset used by the query tab and catalog.
 */
export function parseMongoShellQuery(query: string, defaultDatabase?: string): MongoShellCommand {
  const trimmed = stripTrailingSemicolons(query);
  if (!trimmed) {
    throw new Error('MongoDB command is required');
  }
  const show = trimmed.toLowerCase();
  if (show === 'show dbs' || show === 'show databases') {
    return { kind: 'listDatabases' };
  }
  if (show === 'show collections' || show === 'show tables') {
    return { kind: 'listCollections', database: defaultDatabase };
  }
  const siblingCollections = trimmed.match(
    /^db\.getSiblingDB\(\s*(['"])(.+?)\1\s*\)\.getCollectionNames\s*\(\s*\)\s*$/i,
  );
  if (siblingCollections?.[2]) {
    return { kind: 'listCollections', database: siblingCollections[2] };
  }
  if (trimmed.startsWith('{')) {
    const command = parseJsonArg(trimmed, 'command');
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new Error('MongoDB command JSON must be an object');
    }
    return { kind: 'command', command: command as Record<string, unknown>, database: defaultDatabase };
  }
  const header = trimmed.match(
    /^db(?:\.getSiblingDB\(\s*(['"])(.+?)\1\s*\))?(?:\.getCollection\(\s*(['"])(.+?)\3\s*\)|\.([A-Za-z_][\w$]*))\s*\.\s*([A-Za-z_][\w$]*)\s*\(/s,
  );
  if (!header || header.index !== 0) {
    throw new Error(
      'Use show dbs, db.collection.find({}), or a JSON command object. Filters must be JSON (quoted keys).',
    );
  }
  const database = header[2] || defaultDatabase;
  const collection = header[4] || header[5] || '';
  const method = header[6] ?? '';
  const openParen = header[0].length - 1;
  const closeParen = matchingParen(trimmed, openParen);
  if (closeParen < 0) {
    throw new Error('Unclosed MongoDB argument list');
  }
  const argSource = trimmed.slice(openParen + 1, closeParen).trim();
  const rest = trimmed.slice(closeParen + 1);
  const args = splitTopLevelArgs(argSource).map((part) => part.trim()).filter(Boolean);
  const chain = parseFindChain(rest);

  switch (method) {
    case 'find':
      return {
        kind: 'find',
        database,
        collection,
        filter: args[0] ? parseJsonArg(args[0], 'filter') : {},
        projection: args[1] ? parseJsonArg(args[1], 'projection') : undefined,
        skip: chain.skip,
        limit: chain.limit,
      };
    case 'findOne':
      return {
        kind: 'findOne',
        database,
        collection,
        filter: args[0] ? parseJsonArg(args[0], 'filter') : {},
        projection: args[1] ? parseJsonArg(args[1], 'projection') : undefined,
      };
    case 'aggregate': {
      const pipeline = args[0] ? parseJsonArg(args[0], 'pipeline') : [];
      if (!Array.isArray(pipeline)) {
        throw new Error('aggregate() pipeline must be a JSON array');
      }
      return { kind: 'aggregate', database, collection, pipeline };
    }
    case 'insertOne':
      return {
        kind: 'insertOne',
        database,
        collection,
        document: args[0] ? parseJsonArg(args[0], 'document') : {},
      };
    case 'insertMany': {
      const documents = args[0] ? parseJsonArg(args[0], 'documents') : [];
      if (!Array.isArray(documents)) {
        throw new Error('insertMany() must receive a JSON array');
      }
      return { kind: 'insertMany', database, collection, documents };
    }
    case 'updateOne':
    case 'updateMany':
      return {
        kind: method,
        database,
        collection,
        filter: args[0] ? parseJsonArg(args[0], 'filter') : {},
        update: args[1] ? parseJsonArg(args[1], 'update') : {},
      };
    case 'deleteOne':
    case 'deleteMany':
      return {
        kind: method,
        database,
        collection,
        filter: args[0] ? parseJsonArg(args[0], 'filter') : {},
      };
    case 'countDocuments':
      return {
        kind: 'countDocuments',
        database,
        collection,
        filter: args[0] ? parseJsonArg(args[0], 'filter') : {},
      };
    case 'getIndexes':
    case 'listIndexes':
      return { kind: 'listIndexes', database, collection };
    default:
      throw new Error(`Unsupported MongoDB method: ${method}`);
  }
}

function parseFindChain(rest: string): { skip?: number; limit?: number } {
  const skip = rest.match(/\.skip\s*\(\s*(\d+)\s*\)/i);
  const limit = rest.match(/\.limit\s*\(\s*(\d+)\s*\)/i);
  return {
    skip: skip ? Number(skip[1]) : undefined,
    limit: limit ? Number(limit[1]) : undefined,
  };
}

function parseJsonArg(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(`MongoDB ${label} must be JSON with quoted keys`);
  }
}

function splitTopLevelArgs(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      continue;
    }
    if (ch === ',' && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function matchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let inString: string | null = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function stripTrailingSemicolons(query: string): string {
  return query.trim().replace(/;+\s*$/g, '');
}
