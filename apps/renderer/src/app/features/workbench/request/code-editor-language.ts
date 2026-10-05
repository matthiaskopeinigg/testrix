export type CodeEditorLanguage = 'json' | 'html' | 'xml' | 'javascript' | 'css' | 'text' | 'graphql';

export function codeEditorLanguageFromBodyMode(mode: string): CodeEditorLanguage {
  if (mode === 'json' || mode === 'html' || mode === 'xml' || mode === 'graphql')
    return mode;
  return 'text';
}

export function canFormatLanguage(language: CodeEditorLanguage): boolean {
  return language === 'json' || language === 'html' || language === 'xml' || language === 'graphql';
}

export function languageFromContentType(contentType: string, body = ''): CodeEditorLanguage {
  const type = contentType.toLowerCase();
  if (type.includes('json') || type.includes('jsonc'))
    return 'json';
  if (type.includes('html'))
    return 'html';
  if (type.includes('xml') || type.includes('svg'))
    return 'xml';
  if (type.includes('javascript') || type.includes('ecmascript') || type.includes('jscript'))
    return 'javascript';
  if (type.includes('css'))
    return 'css';
  if (type.includes('graphql'))
    return 'graphql';
  const trimmed = body.slice(0, 1024).trimStart().slice(0, 80).toLowerCase();
  if (trimmed.startsWith('{') || trimmed.startsWith('['))
    return 'json';
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html'))
    return 'html';
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<svg'))
    return 'xml';
  if (/^(query|mutation|subscription|fragment)\b/.test(trimmed))
    return 'graphql';
  return 'text';
}
