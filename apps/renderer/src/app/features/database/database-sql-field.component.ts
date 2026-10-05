import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  databaseQueryEditorLanguageLabel,
  databaseQueryEditorPlaceholder,
  type DatabaseType,
} from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import { DatabaseStore } from './database.store';
import {
  applySqlSuggestion,
  formatSql,
  pairSqlKey,
  sqlGhost,
  suggestSql,
  tokenizeSqlHighlight,
  unpairSqlKey,
  type SqlCompleteContext,
  type SqlSuggestion,
} from './database-sql-complete';

@Component({
  selector: 'tx-database-sql-field',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './database-sql-field.component.html',
  styleUrl: './database-sql-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseSqlFieldComponent {
  private readonly store = inject(DatabaseStore);
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  private readonly highlightRef = viewChild<ElementRef<HTMLElement>>('highlight');
  private readonly ghostRef = viewChild<ElementRef<HTMLElement>>('ghostPane');
  private readonly gutterRef = viewChild<ElementRef<HTMLElement>>('gutter');

  readonly value = input('');
  readonly connectionId = input('');
  readonly schema = input('');
  readonly connectionType = input<DatabaseType | null>(null);
  readonly ariaLabel = input('Query');

  readonly valueChange = output<string>();

  readonly caret = signal(0);
  readonly completeOpen = signal(false);
  readonly completeIndex = signal(0);
  readonly suggestPos = signal({ top: 24, left: 12 });

  readonly placeholder = computed(() => databaseQueryEditorPlaceholder(this.connectionType()));
  readonly languageLabel = computed(() => databaseQueryEditorLanguageLabel(this.connectionType()));

  readonly completeContext = computed((): SqlCompleteContext => {
    const connectionId = this.connectionId();
    const cache = connectionId ? this.store.catalogByConnection()[connectionId] : undefined;
    const schema = this.schema();
    const tables = Object.entries(cache?.tablesBySchema ?? {}).flatMap(([itemSchema, items]) =>
      items.map((table) => ({ schema: itemSchema, name: table.name })),
    );
    const columns = Object.entries(cache?.columnsByTable ?? {})
      .filter(([key]) => !schema || key.startsWith(`${schema}.`))
      .flatMap(([, items]) => items.map((column) => ({ name: column.name, type: column.type })));
    const routines = (cache?.routinesBySchema[schema] ?? []).map((item) => ({
      name: item.name,
      kind: item.kind,
    }));
    return {
      schemas: cache?.schemas ?? [],
      tables: schema ? tables.filter((item) => item.schema === schema) : tables,
      columns,
      routines,
    };
  });

  readonly suggestions = computed(() => suggestSql(this.value(), this.caret(), this.completeContext()));

  readonly ghost = computed(() => {
    if (this.completeOpen())
      return null;
    return sqlGhost(this.value(), this.caret(), this.suggestions()[this.completeIndex()] ?? this.suggestions()[0]);
  });

  readonly highlightTokens = computed(() => tokenizeSqlHighlight(this.value()));

  readonly lineNumbers = computed(() => {
    const count = Math.max(1, this.value().split('\n').length);
    return Array.from({ length: count }, (_, index) => index + 1);
  });

  constructor() {
    effect(() => {
      const connectionId = this.connectionId();
      if (connectionId)
        this.store.loadCatalog(connectionId);
    });
    effect(() => {
      const connectionId = this.connectionId();
      const schema = this.schema();
      if (connectionId && schema)
        void this.store.loadSchemaObjects(connectionId, schema);
    });
    effect(() => {
      const next = this.value();
      const editor = this.editor()?.nativeElement;
      if (!editor || editor.value === next)
        return;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = next;
      editor.setSelectionRange(Math.min(start, next.length), Math.min(end, next.length));
    });
  }

  handleInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.writeValue(target.value, target.selectionStart);
  }

  handleCaret(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.caret.set(target.selectionStart);
    this.updateSuggestPos();
  }

  handleScroll(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    const top = target.scrollTop;
    const left = target.scrollLeft;
    const highlight = this.highlightRef()?.nativeElement;
    const ghost = this.ghostRef()?.nativeElement;
    const gutter = this.gutterRef()?.nativeElement;
    if (highlight) {
      highlight.scrollTop = top;
      highlight.scrollLeft = left;
    }
    if (ghost) {
      ghost.scrollTop = top;
      ghost.scrollLeft = left;
    }
    if (gutter)
      gutter.scrollTop = top;
    this.updateSuggestPos();
  }

  handleEditorKey(event: KeyboardEvent): void {
    const editor = this.editor()?.nativeElement;
    if (!editor)
      return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.completeOpen.set(true);
      this.completeIndex.set(0);
      this.caret.set(editor.selectionStart);
      this.updateSuggestPos();
      return;
    }
    if (this.completeOpen()) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.completeIndex.set(Math.min(this.suggestions().length - 1, this.completeIndex() + 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.completeIndex.set(Math.max(0, this.completeIndex() - 1));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.completeOpen.set(false);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = this.suggestions()[this.completeIndex()];
        if (item) {
          event.preventDefault();
          this.applySuggestion(item);
          return;
        }
      }
    }
    if (event.key === 'Tab' && this.ghost()) {
      const item = this.suggestions()[0];
      if (item) {
        event.preventDefault();
        this.applySuggestion(item);
        return;
      }
    }
    if (event.key === 'Backspace') {
      const next = unpairSqlKey(editor.value, editor.selectionStart);
      if (next) {
        event.preventDefault();
        this.writeValue(next.value, next.cursor);
      }
      return;
    }
    const paired = pairSqlKey(editor.value, editor.selectionStart, event.key);
    if (!paired)
      return;
    event.preventDefault();
    this.writeValue(paired.value, paired.cursor);
  }

  applySuggestion(item: SqlSuggestion): void {
    const editor = this.editor()?.nativeElement;
    const applied = applySqlSuggestion(this.value(), editor?.selectionStart ?? this.caret(), item.value);
    this.writeValue(applied.value, applied.cursor);
    this.completeOpen.set(false);
  }

  handleFormat(): void {
    const next = formatSql(this.value());
    if (next === this.value())
      return;
    this.writeValue(next, next.length);
  }

  @HostListener('document:pointerdown', ['$event'])
  handlePointerDown(event: PointerEvent): void {
    const target = event.target;
    if (this.completeOpen() && target instanceof Element && !target.closest('.tx-db-sql-field__suggest'))
      this.completeOpen.set(false);
  }

  private writeValue(value: string, cursor: number): void {
    this.valueChange.emit(value);
    this.caret.set(cursor);
    const editor = this.editor()?.nativeElement;
    if (editor && editor.value !== value)
      editor.value = value;
    queueMicrotask(() => {
      const next = this.editor()?.nativeElement;
      if (!next)
        return;
      next.setSelectionRange(cursor, cursor);
      this.updateSuggestPos();
    });
  }

  private updateSuggestPos(): void {
    const editor = this.editor()?.nativeElement;
    if (!editor)
      return;
    const metrics = caretMetrics(editor);
    const maxLeft = Math.max(8, editor.clientWidth - 272);
    const maxTop = Math.max(8, editor.clientHeight - 80);
    this.suggestPos.set({
      top: Math.min(maxTop, Math.max(8, metrics.top - editor.scrollTop + 18)),
      left: Math.min(maxLeft, Math.max(8, metrics.left - editor.scrollLeft)),
    });
  }
}

function caretMetrics(editor: HTMLTextAreaElement): { top: number; left: number } {
  const mirror = document.createElement('div');
  const style = getComputedStyle(editor);
  for (const prop of [
    'box-sizing',
    'width',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'letter-spacing',
    'line-height',
    'text-transform',
    'word-spacing',
    'white-space',
    'word-wrap',
    'tab-size',
  ])
    mirror.style.setProperty(prop, style.getPropertyValue(prop));
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflow = 'auto';
  mirror.textContent = editor.value.slice(0, editor.selectionStart);
  const marker = document.createElement('span');
  marker.textContent = '|';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  mirror.remove();
  return { top, left };
}
