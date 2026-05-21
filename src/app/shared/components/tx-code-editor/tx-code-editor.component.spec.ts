import { TestBed } from '@angular/core/testing';

import { createDefaultSettings } from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { TxIconService } from '../../icons/tx-icon.service';
import { highlightCodeEditorContent } from './tx-code-editor-highlight';
import { tryFormatCodeEditorContent } from './tx-code-editor-format';
import { TxCodeEditorComponent } from './tx-code-editor.component';

describe('tx-code-editor helpers', () => {
  it('highlights JSON keys and strings', () => {
    const html = highlightCodeEditorContent('{"a":1}', 'json');
    expect(html).toContain('token-key');
    expect(html).toContain('token-number');
  });

  it('formats JSON with indentation', () => {
    const out = tryFormatCodeEditorContent('{"a":1}', 'json');
    expect(out).toContain('"a": 1');
  });

  it('formats XML when valid', () => {
    const out = tryFormatCodeEditorContent('<root><item>x</item></root>', 'xml');
    expect(out).toContain('<root>');
    expect(out).toContain('<item>');
  });

  it('highlights GraphQL keywords', () => {
    const html = highlightCodeEditorContent('query { users }', 'graphql');
    expect(html).toContain('token-keyword');
    expect(html).toContain('query');
  });

  it('highlights TypeScript interface keyword', () => {
    const html = highlightCodeEditorContent('interface User {}', 'ts');
    expect(html).toContain('data-tok="k"');
    expect(html).toContain('interface');
  });

  it('highlights CSS selectors', () => {
    const html = highlightCodeEditorContent('.app { color: red; }', 'css');
    expect(html).toContain('token-key');
  });

  it('highlights SCSS variables', () => {
    const html = highlightCodeEditorContent('$primary: #fff;', 'scss');
    expect(html).toContain('token-attribute');
    expect(html).toContain('$primary');
  });

  it('formats HTML documents', () => {
    const out = tryFormatCodeEditorContent('<div><span>x</span></div>', 'html');
    expect(out).toContain('<div>');
    expect(out).toContain('<span>');
  });
});

describe('TxCodeEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxCodeEditorComponent],
      providers: [
        {
          provide: ConfigService,
          useValue: { settings: () => createDefaultSettings() },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>') },
        },
      ],
    }).compileComponents();
  });

  it('renders toolbar badge for language', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentRef.setInput('language', 'xml');
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.tx-code-editor__badge');
    expect(badge?.textContent?.trim()).toBe('XML');
  });

  it('renders custom language badge label and hides toolbar actions', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentRef.setInput('language', 'js');
    fixture.componentRef.setInput('languageBadgeLabel', 'Javascript');
    fixture.componentRef.setInput('hideToolbarActions', true);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.tx-code-editor__badge');
    expect(badge?.textContent?.trim()).toBe('Javascript');
    expect(fixture.nativeElement.querySelector('.tx-code-editor__toolbar-actions')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.tx-code-editor')?.classList.contains('tx-code-editor--badge-toolbar'),
    ).toBe(true);
  });

  it('shows placeholder when empty', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentRef.setInput('placeholder', '// hint');
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.tx-code-editor__placeholder');
    expect(el?.textContent).toContain('hint');
  });

  it('does not open completion when typing a space', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentRef.setInput('language', 'js');
    fixture.detectChanges();
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = 'const x = ';
    textarea.dispatchEvent(
      new InputEvent('input', { data: ' ', inputType: 'insertText', bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-code-editor__completion')).toBeFalsy();
  });

  it('filters completion list while typing after Ctrl+Space', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentRef.setInput('language', 'js');
    fixture.detectChanges();
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-code-editor__completion')).toBeTruthy();

    textarea.value = 'vari';
    textarea.setSelectionRange(4, 4);
    textarea.dispatchEvent(new InputEvent('input', { data: 'i', inputType: 'insertText', bubbles: true }));
    fixture.detectChanges();

    const labels = [
      ...fixture.nativeElement.querySelectorAll('.tx-code-editor__completion-label'),
    ].map((el: Element) => el.textContent?.toLowerCase() ?? '');
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.includes('vari')).toBe(true);
    }
    expect(labels.some((l) => l.includes('environment'))).toBe(false);
  });

  it('opens JavaScript completion on Ctrl+Space', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentRef.setInput('language', 'js');
    fixture.detectChanges();
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-code-editor__completion')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('pm.variables.get');
  });

  it('indents the active line on Tab', async () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentInstance.writeValue('line');
    fixture.detectChanges();
    await Promise.resolve();
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.setSelectionRange(4, 4);
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    fixture.detectChanges();
    expect(textarea.value).toBe('  line');
    expect(onChange).toHaveBeenCalledWith('  line');
  });

  it('cuts the current line on Ctrl+X when nothing is selected', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.componentInstance.writeValue('alpha\nbeta\ngamma');
    fixture.detectChanges();
    await Promise.resolve();
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.setSelectionRange(6, 6);
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }));
    fixture.detectChanges();
    await Promise.resolve();
    expect(textarea.value).toBe('alpha\ngamma');
    expect(onChange).toHaveBeenCalledWith('alpha\ngamma');
    expect(writeText).toHaveBeenCalledWith('beta\n');
  });

  it('undoes typing with Ctrl+Z', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.detectChanges();
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    textarea.value = 'x';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(textarea.value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('emits value changes from textarea input', () => {
    const fixture = TestBed.createComponent(TxCodeEditorComponent);
    fixture.detectChanges();
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = '{"ok":true}';
    textarea.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('{"ok":true}');
  });
});
