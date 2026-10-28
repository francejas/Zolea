import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZBtn } from './z-btn';

describe('ZBtn', () => {
  let component: ZBtn;
  let fixture: ComponentFixture<ZBtn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZBtn],
    }).compileComponents();

    fixture = TestBed.createComponent(ZBtn);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
