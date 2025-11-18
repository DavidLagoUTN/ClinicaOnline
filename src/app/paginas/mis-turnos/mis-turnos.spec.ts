import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MisTurnos } from './mis-turnos';

describe('MisTurnos', () => {
  let component: MisTurnos;
  let fixture: ComponentFixture<MisTurnos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MisTurnos]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MisTurnos);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
