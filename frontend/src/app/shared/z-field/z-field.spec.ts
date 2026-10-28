import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZField } from './z-field';

describe('ZField', () => {
  let component: ZField;
  let fixture: ComponentFixture<ZField>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZField],
    }).compileComponents();

    fixture = TestBed.createComponent(ZField);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
