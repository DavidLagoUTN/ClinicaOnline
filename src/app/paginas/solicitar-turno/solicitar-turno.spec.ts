import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SolicitarTurno } from './solicitar-turno';

describe('SolicitarTurno', () => {
  let component: SolicitarTurno;
  let fixture: ComponentFixture<SolicitarTurno>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SolicitarTurno]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SolicitarTurno);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
