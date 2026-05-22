import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '../../icons/tx-icon.service';
import { TxSidebarComponent } from './tx-sidebar.component';
import type { TxSidebarItem } from './tx-sidebar.types';
import {
  TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX,
  TX_SIDEBAR_RAIL_WIDTH_PX,
} from './tx-sidebar.types';

const MAIN_ITEMS: readonly TxSidebarItem[] = [
  { id: 'collections', label: 'Collections', icon: 'folder' },
  { id: 'testing', label: 'Testing', icon: 'testing' },
];

const FOOTER_ITEMS: readonly TxSidebarItem[] = [
  { id: 'help', label: 'Help', icon: 'help', opensPanel: false },
];

describe('TxSidebarComponent', () => {
  let fixture: ComponentFixture<TxSidebarComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxSidebarComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxSidebarComponent);
    fixture.componentRef.setInput('items', MAIN_ITEMS);
    fixture.componentRef.setInput('footerItems', FOOTER_ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('starts with rail only (no contextual panel)', () => {
    expect(host.classList.contains('tx-sidebar-host--panel-open')).toBe(false);
    expect(host.style.width).toBe(`${TX_SIDEBAR_RAIL_WIDTH_PX}px`);
    expect(host.querySelector('.tx-sidebar__panel')).toBeNull();
  });

  it('opens a contextual panel when a rail icon is clicked', () => {
    const collectionsBtn = host.querySelector(
      '.tx-sidebar__rail-btn[aria-label="Collections"]',
    ) as HTMLButtonElement;
    collectionsBtn.click();
    fixture.detectChanges();

    expect(host.classList.contains('tx-sidebar-host--panel-open')).toBe(true);
    expect(host.style.width).toBe(`${TX_SIDEBAR_RAIL_WIDTH_PX + TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX}px`);
    expect(host.querySelector('.tx-sidebar__panel-title')?.textContent?.trim()).toBe('Collections');
  });

  it('closes the panel when the active rail icon is clicked again', () => {
    const collectionsBtn = host.querySelector(
      '.tx-sidebar__rail-btn[aria-label="Collections"]',
    ) as HTMLButtonElement;
    collectionsBtn.click();
    fixture.detectChanges();
    collectionsBtn.click();
    fixture.detectChanges();

    expect(host.querySelector('.tx-sidebar__panel')).toBeNull();
    expect(host.style.width).toBe(`${TX_SIDEBAR_RAIL_WIDTH_PX}px`);
  });

  it('closes the panel on outside click when enabled', () => {
    fixture.componentRef.setInput('closePanelOnOutsideClick', true);
    const collectionsBtn = host.querySelector(
      '.tx-sidebar__rail-btn[aria-label="Collections"]',
    ) as HTMLButtonElement;
    collectionsBtn.click();
    fixture.detectChanges();
    expect(host.querySelector('.tx-sidebar__panel')).not.toBeNull();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('.tx-sidebar__panel')).toBeNull();
  });

  it('keeps the panel open while a tree drag is active', () => {
    fixture.componentRef.setInput('closePanelOnOutsideClick', true);
    const collectionsBtn = host.querySelector(
      '.tx-sidebar__rail-btn[aria-label="Collections"]',
    ) as HTMLButtonElement;
    collectionsBtn.click();
    fixture.detectChanges();

    document.body.classList.add('tx-tree-dnd-active');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    document.body.classList.remove('tx-tree-dnd-active');

    expect(host.querySelector('.tx-sidebar__panel')).not.toBeNull();
  });

  it('keeps the panel open when pointerdown targets a portaled overlay', () => {
    fixture.componentRef.setInput('closePanelOnOutsideClick', true);
    const collectionsBtn = host.querySelector(
      '.tx-sidebar__rail-btn[aria-label="Collections"]',
    ) as HTMLButtonElement;
    collectionsBtn.click();
    fixture.detectChanges();

    const contextMenu = document.createElement('div');
    contextMenu.className = 'tx-context-menu';
    const menuItem = document.createElement('button');
    contextMenu.appendChild(menuItem);
    document.body.appendChild(contextMenu);

    menuItem.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('.tx-sidebar__panel')).not.toBeNull();

    contextMenu.remove();
  });

  it('does not open the panel for action-only footer items', () => {
    const selected = vi.fn();
    fixture.componentInstance.itemSelect.subscribe(selected);

    const helpBtn = host.querySelector('.tx-sidebar__rail-btn[aria-label="Help"]') as HTMLButtonElement;
    helpBtn.click();
    fixture.detectChanges();

    expect(host.querySelector('.tx-sidebar__panel')).toBeNull();
    expect(host.classList.contains('tx-sidebar-host--panel-open')).toBe(false);
    expect(selected).toHaveBeenCalledWith('help');
  });

  it('emits item id when a rail button is pressed', () => {
    const selected = vi.fn();
    fixture.componentInstance.itemSelect.subscribe(selected);

    const testingBtn = host.querySelector(
      '.tx-sidebar__rail-btn[aria-label="Testing"]',
    ) as HTMLButtonElement;
    testingBtn.click();

    expect(selected).toHaveBeenCalledWith('testing');
  });
});
