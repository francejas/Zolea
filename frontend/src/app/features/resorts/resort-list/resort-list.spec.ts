import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResortList } from './resort-list';

describe('ResortList', () => {
  let component: ResortList;
  let fixture: ComponentFixture<ResortList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResortList],
    }).compileComponents();

    fixture = TestBed.createComponent(ResortList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
