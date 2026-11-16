import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { StatsApi } from './stats.api';

describe('StatsApi', () => {
  it('get hace GET /api/resorts/my/stats con las dos fechas', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(StatsApi);
    const http = TestBed.inject(HttpTestingController);

    api.get('2026-10-01', '2026-12-31').subscribe();

    const req = http.expectOne(
      `${environment.apiUrl}/api/resorts/my/stats?from=2026-10-01&to=2026-12-31`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({});
    http.verify();
  });
});
