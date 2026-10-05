import type { CompletionSource } from '@codemirror/autocomplete';
import { json, jsonLanguage } from '@codemirror/lang-json';
import { xml, xmlLanguage } from '@codemirror/lang-xml';
import { StreamLanguage, type Language, type StreamParser } from '@codemirror/language';
import { Facet, type Extension } from '@codemirror/state';

import type { CodeEditorLanguage } from './code-editor-language';
import { graphqlKeywordSource, htmlTagSource } from './code-editor-placeholders';

const GRAPHQL_KEYWORDS = new Set([
  'query',
  'mutation',
  'subscription',
  'fragment',
  'on',
  'true',
  'false',
  'null',
  'schema',
  'extend',
  'scalar',
  'type',
  'interface',
  'union',
  'enum',
  'input',
  'directive',
  'implements',
  'repeatable',
]);

interface GraphqlStreamState {
  inBlock: boolean;
}

const graphqlStream: StreamParser<GraphqlStreamState> = {
  name: 'graphql',
  startState() {
    return { inBlock: false };
  },
  token(stream, state) {
    if (state.inBlock) {
      if (stream.match(/.*?"""/)) {
        state.inBlock = false;
        return 'string';
      }
      stream.skipToEnd();
      return 'string';
    }
    if (stream.eatSpace())
      return null;
    if (stream.match('"""')) {
      state.inBlock = true;
      return 'string';
    }
    if (stream.match(/^#.*/))
      return 'comment';
    if (stream.match(/^"(?:\\.|[^\\"])*"?/))
      return 'string';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/))
      return 'number';
    if (stream.match(/^\$[A-Za-z_][A-Za-z0-9_]*/))
      return 'variableName';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();
      if (GRAPHQL_KEYWORDS.has(word))
        return 'keyword';
      return 'atom';
    }
    stream.next();
    return 'punctuation';
  },
};

const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
  'in', 'instanceof', 'let', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield', 'async',
  'await', 'of',
]);

interface ScriptStreamState {
  inBlock: boolean;
  inLine: boolean;
}

const javascriptStream: StreamParser<ScriptStreamState> = {
  name: 'javascript',
  startState() {
    return { inBlock: false, inLine: false };
  },
  token(stream, state) {
    if (state.inLine) {
      stream.skipToEnd();
      state.inLine = false;
      return 'comment';
    }
    if (state.inBlock) {
      if (stream.match(/.*?\*\//)) {
        state.inBlock = false;
        return 'comment';
      }
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace())
      return null;
    if (stream.match('//')) {
      state.inLine = true;
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.inBlock = true;
      return 'comment';
    }
    if (stream.match(/^"(?:\\.|[^\\"])*"?/) || stream.match(/^'(?:\\.|[^\\'])*'?/) || stream.match(/^`(?:\\.|[^\\`])*`?/))
      return 'string';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/))
      return 'number';
    if (stream.match(/^[A-Za-z_$][\w$]*/)) {
      const word = stream.current();
      if (JS_KEYWORDS.has(word))
        return 'keyword';
      return 'variableName';
    }
    stream.next();
    return 'punctuation';
  },
};

const CSS_KEYWORDS = new Set(['important', 'from', 'to']);

const cssStream: StreamParser<ScriptStreamState> = {
  name: 'css',
  startState() {
    return { inBlock: false, inLine: false };
  },
  token(stream, state) {
    if (state.inBlock) {
      if (stream.match(/.*?\*\//)) {
        state.inBlock = false;
        return 'comment';
      }
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace())
      return null;
    if (stream.match('/*')) {
      state.inBlock = true;
      return 'comment';
    }
    if (stream.match(/^#[0-9a-fA-F]{3,8}/) || stream.match(/^-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?/))
      return 'number';
    if (stream.match(/^"(?:\\.|[^\\"])*"?/) || stream.match(/^'(?:\\.|[^\\'])*'?/))
      return 'string';
    if (stream.match(/^--[\w-]+/) || stream.match(/^[\w-]+(?=\s*:)/))
      return 'propertyName';
    if (stream.match(/^[\w-]+/)) {
      const word = stream.current();
      if (CSS_KEYWORDS.has(word))
        return 'keyword';
      return 'tagName';
    }
    stream.next();
    return 'punctuation';
  },
};

const graphqlLanguage = StreamLanguage.define(graphqlStream);
const javascriptLanguage = StreamLanguage.define(javascriptStream);
const cssLanguage = StreamLanguage.define(cssStream);

export const editorLanguageFacet = Facet.define<CodeEditorLanguage, CodeEditorLanguage>({
  combine(values) {
    return values[values.length - 1] ?? 'text';
  },
});

export function languageExtension(language: CodeEditorLanguage): Extension {
  if (language === 'json')
    return json();
  if (language === 'html' || language === 'xml')
    return xml();
  if (language === 'graphql')
    return graphqlLanguage;
  if (language === 'javascript')
    return javascriptLanguage;
  if (language === 'css')
    return cssLanguage;
  return [];
}

/** Language instance for offline Lezer highlighting (readonly viewers). */
export function highlightLanguage(language: CodeEditorLanguage): Language | null {
  if (language === 'json')
    return jsonLanguage;
  if (language === 'html' || language === 'xml')
    return xmlLanguage;
  if (language === 'graphql')
    return graphqlLanguage;
  if (language === 'javascript')
    return javascriptLanguage;
  if (language === 'css')
    return cssLanguage;
  return null;
}

export function languageCompletionSources(language: CodeEditorLanguage): CompletionSource[] {
  if (language === 'graphql')
    return [graphqlKeywordSource];
  if (language === 'html' || language === 'xml')
    return [htmlTagSource];
  return [];
}
