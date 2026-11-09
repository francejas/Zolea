import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaymentSuccess } from './payment-success';

describe('PaymentSuccess', () => {
  it('se crea', async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentSuccess],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaymentSuccess);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });
});
