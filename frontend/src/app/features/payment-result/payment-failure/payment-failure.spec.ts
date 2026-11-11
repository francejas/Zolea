import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaymentFailure } from './payment-failure';

describe('PaymentFailure', () => {
  it('se crea', async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PaymentFailure],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaymentFailure);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });
});
