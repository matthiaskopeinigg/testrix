import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { txIconAssetUrl } from './tx-icon.registry';
import { TxIconService, extractSvgInner } from './tx-icon.service';

describe('TxIconService', () => {
  let service: TxIconService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(TxIconService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('extractSvgInner returns child markup without the root svg', () => {
    const inner = extractSvgInner(
      '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><circle cx="12" cy="12" r="2"/></svg>',
    );
    expect(inner).toContain('<path');
    expect(inner).toContain('<circle');
    expect(inner).not.toContain('<svg');
  });

  it('loadIconInner caches responses', async () => {
    const first = service.loadIconInner('close');
    const second = service.loadIconInner('close');

    const req = httpMock.expectOne(txIconAssetUrl('close'));
    req.flush('<svg xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12"/></svg>');

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    httpMock.expectNone(txIconAssetUrl('close'));
  });
});
