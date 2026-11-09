import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaymentPending } from './payment-pending';

describe('PaymentPending', () => {
  it('se crea', async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentPending],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaymentPending);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });
});
