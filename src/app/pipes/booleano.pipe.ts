import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'booleano',
  standalone: true,
})
export class BooleanoPipe implements PipeTransform {
  transform(valor: boolean): string {
    return valor ? 'Sí' : 'No';
  }
}
