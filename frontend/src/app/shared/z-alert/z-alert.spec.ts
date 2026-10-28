import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ZAlert } from './z-alert';

describe('ZAlert', () => {
  let component: ZAlert;
  let fixture: ComponentFixture<ZAlert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZAlert]
    }).compileComponents();

    fixture = TestBed.createComponent(ZAlert);
    component = fixture.componentInstance;
    
    fixture.componentRef.setInput('variant', 'info');
    fixture.componentRef.setInput('text', 'Aviso de prueba');
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});