import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
  type ElementRef,
} from '@angular/core';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import { linter } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';

import {
  canFormatLanguage,
  type CodeEditorLanguage,
} from './code-editor-language';
import { formatCode, lintCode } from './code-editor-format';
import {
  placeholderCompletionSource,
  placeholderDecorations,
  placeholderOriginsFacet,
  placeholderVariablesFacet,
} from './code-editor-placeholders';
import {
  editorLanguageFacet,
  languageCompletionSources,
  languageExtension,
} from './code-editor-support';
import { codeEditorTheme } from './code-editor-theme';
import { PLACEHOLDER_ORIGIN_HOST, placeholderActivateFromDataset, shouldOpenPlaceholderOrigin } from './placeholder-origin';

@Component({
  selector: 'tx-code-editor-view',
  standalone: true,
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeEditorComponent {
  readonly value = input('');
  readonly language = input<CodeEditorLanguage>('text');
  readonly readonly = input(false);
  readonly ariaLabel = input('Code editor');
  readonly variables = input<readonly string[]>([]);
  readonly wrap = input(false);
  readonly lint = input(true);
  readonly complete = input(true);
  readonly placeholders = input(true);
  readonly valueChange = output<string>();

  private readonly originHost = inject(PLACEHOLDER_ORIGIN_HOST, { optional: true });
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  private readonly languageComp = new Compartment();
  private readonly editableComp = new Compartment();
  private readonly variablesComp = new Compartment();
  private readonly originsComp = new Compartment();
  private readonly wrapComp = new Compartment();
  private readonly extrasComp = new Compartment();
  private readonly placeholdersComp = new Compartment();
  private view: EditorView | null = null;
  private syncing = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => this.mount());
    destroyRef.onDestroy(() => {
      this.view?.destroy();
      this.view = null;
    });
    effect(() => {
      const value = this.value();
      this.applyExternal(value);
    });
    effect(() => {
      const language = this.language();
      this.view?.dispatch({ effects: this.languageComp.reconfigure(this.languageBundle(language)) });
    });
    effect(() => {
      const readonly = this.readonly();
      this.view?.dispatch({ effects: this.editableComp.reconfigure(this.editableBundle(readonly)) });
    });
    effect(() => {
      const variables = this.variables();
      this.view?.dispatch({ effects: this.variablesComp.reconfigure(placeholderVariablesFacet.of(variables)) });
    });
    effect(() => {
      const origins = this.originHost?.placeholderOrigins() ?? [];
      this.view?.dispatch({ effects: this.originsComp.reconfigure(placeholderOriginsFacet.of(origins)) });
    });
    effect(() => {
      this.view?.dispatch({ effects: this.wrapComp.reconfigure(this.wrap() ? EditorView.lineWrapping : []) });
    });
    effect(() => {
      this.view?.dispatch({
        effects: this.extrasComp.reconfigure(this.extrasBundle(this.language(), this.complete(), this.lint())),
      });
    });
    effect(() => {
      this.view?.dispatch({
        effects: this.placeholdersComp.reconfigure(this.placeholdersBundle(this.placeholders())),
      });
    });
  }

  format(): boolean {
    const view = this.view;
    if (!view || view.state.readOnly)
      return false;
    const language = view.state.facet(editorLanguageFacet);
    if (!canFormatLanguage(language))
      return false;
    const current = view.state.doc.toString();
    const next = formatCode(current, language);
    if (next === current)
      return false;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    return true;
  }

  private mount(): void {
    const parent = this.host()?.nativeElement;
    if (!parent || this.view)
      return;
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: this.value(),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          highlightSelectionMatches(),
          search(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          codeEditorTheme,
          this.placeholdersComp.of(this.placeholdersBundle(this.placeholders())),
          this.languageComp.of(this.languageBundle(this.language())),
          this.editableComp.of(this.editableBundle(this.readonly())),
          this.variablesComp.of(placeholderVariablesFacet.of(this.variables())),
          this.originsComp.of(placeholderOriginsFacet.of(this.originHost?.placeholderOrigins() ?? [])),
          this.wrapComp.of(this.wrap() ? EditorView.lineWrapping : []),
          this.extrasComp.of(this.extrasBundle(this.language(), this.complete(), this.lint())),
          EditorView.domEventHandlers({
            click: (event) => this.handlePlaceholderClick(event),
          }),
          Prec.high(
            keymap.of([
              {
                key: 'Shift-Alt-f',
                preventDefault: true,
                run: (view) => this.formatFromView(view),
              },
              ...closeBracketsKeymap,
            ]),
          ),
          keymap.of([
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || this.syncing)
              return;
            this.valueChange.emit(update.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ 'aria-label': this.ariaLabel() }),
        ],
      }),
    });
  }

  private languageBundle(language: CodeEditorLanguage): Extension[] {
    return [
      editorLanguageFacet.of(language),
      languageExtension(language),
    ];
  }

  private extrasBundle(language: CodeEditorLanguage, complete: boolean, lint: boolean): Extension[] {
    const extras: Extension[] = [];
    if (complete) {
      extras.push(
        autocompletion({
          override: [placeholderCompletionSource, ...languageCompletionSources(language)],
          activateOnTyping: true,
        }),
      );
    }
    if (lint) {
      extras.push(
        linter((view) => {
          return lintCode(view.state.doc.toString(), language).map((item) => ({
            from: item.from,
            to: item.to,
            severity: item.severity,
            message: item.message,
          }));
        }),
      );
    }
    return extras;
  }

  private placeholdersBundle(enabled: boolean): Extension {
    return enabled ? Prec.highest(placeholderDecorations()) : [];
  }

  private editableBundle(readonly: boolean) {
    return [
      EditorState.readOnly.of(readonly),
      EditorView.editable.of(!readonly),
    ];
  }

  private applyExternal(value: string): void {
    const view = this.view;
    if (!view || view.state.doc.toString() === value)
      return;
    this.syncing = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    this.syncing = false;
  }

  private formatFromView(view: EditorView): boolean {
    if (view.state.readOnly)
      return false;
    const language = view.state.facet(editorLanguageFacet);
    if (!canFormatLanguage(language))
      return false;
    const current = view.state.doc.toString();
    const next = formatCode(current, language);
    if (next === current)
      return false;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    return true;
  }

  private handlePlaceholderClick(event: MouseEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element))
      return false;
    const chip = target.closest('[data-tx-ph-kind]');
    if (!chip)
      return false;
    if (!shouldOpenPlaceholderOrigin(event))
      return false;
    const activate = placeholderActivateFromDataset(chip);
    if (!activate)
      return false;
    event.preventDefault();
    this.originHost?.openPlaceholder(activate);
    return true;
  }
}
