import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fechaFormato',
  standalone: true,
})
export class FechaFormatoPipe implements PipeTransform {
  transform(timestamp: any): string {
    if (!timestamp) return '';

    // Si viene de Firebase puede ser un Timestamp object o un string
    let fecha = timestamp;
    if (timestamp.toDate) {
      fecha = timestamp.toDate();
    } else if (typeof timestamp === 'string') {
      fecha = new Date(timestamp);
    }

    return (
      fecha.toLocaleDateString() +
      ' ' +
      fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }
}
