import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';

@Injectable({
  providedIn: 'root'
})
export class PdfService {

  constructor() { }

  /**
   * Genera el PDF de la historia clínica.
   * @param filename Nombre del archivo a descargar.
   * @param historial Lista completa de atenciones.
   * @param pacienteData Datos del paciente (nombre, apellido, dni, edad, obraSocial).
   * @param filtroEspecialidad (Opcional) Si se recibe, filtra el historial por esa especialidad.
   */
  async generarHistoriaClinicaPdf(
    filename: string,
    historial: any[],
    pacienteData: { nombre: string; apellido: string; dni?: string; edad?: number; obraSocial?: string },
    filtroEspecialidad?: string
  ): Promise<void> {

    // 1. Filtrar si corresponde
    let datosParaImprimir = [...historial];
    if (filtroEspecialidad && filtroEspecialidad !== 'todas') {
      datosParaImprimir = datosParaImprimir.filter(item => item.especialidad === filtroEspecialidad);
    }

    // Ordenar por fecha descendente (lo más nuevo arriba)
    datosParaImprimir.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    try {
      const logoUrl = 'assets/logo.png';
      let logoBase64 = null;
      try {
        logoBase64 = await this.loadImage(logoUrl);
      } catch (e) {
        console.warn('No se pudo cargar el logo, se generará sin él.');
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let cursorY = margin;

      // --- Función Header ---
      const drawHeader = () => {
        // Fondo suave encabezado
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, pageWidth, 50, 'F');

        if (logoBase64) {
          doc.addImage(logoBase64, 'PNG', margin, 10, 25, 25);
        }

        doc.setFontSize(24);
        doc.setTextColor(16, 78, 167);
        doc.setFont('helvetica', 'bold');
        doc.text('CLÍNICA ONLINE DLL', pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(14);
        doc.setTextColor(80, 80, 80);
        
        // Título dinámico según filtro
        const tituloReporte = filtroEspecialidad && filtroEspecialidad !== 'todas' 
          ? `HISTORIA CLÍNICA: ${filtroEspecialidad.toUpperCase()}`
          : 'INFORME DE HISTORIA CLÍNICA COMPLETA';
          
        doc.text(tituloReporte, pageWidth / 2, 29, { align: 'center' });

        doc.setDrawColor(16, 78, 167);
        doc.setLineWidth(0.8);
        doc.line(margin, 38, pageWidth - margin, 38);

        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);

        const startDataY = 45;
        doc.setFont('helvetica', 'bold');
        doc.text('PACIENTE:', margin, startDataY);
        doc.setFont('helvetica', 'normal');
        doc.text(`${pacienteData.apellido.toUpperCase()}, ${pacienteData.nombre}`, margin + 25, startDataY);

        doc.setFont('helvetica', 'bold');
        const dniLabelX = pageWidth - margin - 70;
        doc.text('DNI:', dniLabelX, startDataY);
        doc.setFont('helvetica', 'normal');
        doc.text(pacienteData.dni || '-', dniLabelX + 10, startDataY);

        if (pacienteData.edad) {
          doc.setFont('helvetica', 'bold');
          doc.text('EDAD:', dniLabelX + 40, startDataY);
          doc.setFont('helvetica', 'normal');
          doc.text(String(pacienteData.edad), dniLabelX + 55, startDataY);
        }

        return 55;
      };

      // --- Función Secciones Datos ---
      const drawDataSection = (title: string, data: any[], startY: number): number => {
        if (!data || data.length === 0) return startY;

        // Título
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(title.toUpperCase(), margin, startY);
        
        const titleWidth = doc.getTextWidth(title.toUpperCase());
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.1);
        doc.line(margin, startY + 1, margin + titleWidth, startY + 1);

        startY += 5;

        let currentX = margin;
        const lineHeight = 5;

        data.forEach((d, index) => {
          const key = (d.clave || '').toString().toUpperCase();
          
          let valRaw = d.valor;
          let val = '';
          if (valRaw === true || valRaw === 'true') val = 'Sí';
          else if (valRaw === false || valRaw === 'false') val = 'No';
          else val = (valRaw || '').toString();

          const sep = index < data.length - 1 ? '  |  ' : '';

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(16, 78, 167);
          const keyText = key + ': ';
          const keyWidth = doc.getTextWidth(keyText);

          doc.setFont('helvetica', 'normal');
          const valWidth = doc.getTextWidth(val);
          const sepWidth = doc.getTextWidth(sep);

          if (currentX + keyWidth + valWidth + sepWidth > pageWidth - margin) {
            startY += lineHeight;
            currentX = margin;
          }

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(16, 78, 167);
          doc.text(keyText, currentX, startY);
          currentX += keyWidth;

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          doc.text(val, currentX, startY);
          currentX += valWidth;

          if (sep) {
            doc.setTextColor(150, 150, 150);
            doc.text(sep, currentX, startY);
            currentX += sepWidth;
          }
        });

        return startY + 6;
      };

      // Inicio del PDF
      cursorY = drawHeader();

      // Info extra bajo el header
      if (pacienteData.obraSocial) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 78, 167);
        doc.text('OBRA SOCIAL:', margin, cursorY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(pacienteData.obraSocial.toUpperCase(), margin + 30, cursorY);
      }

      const fechaEmision = new Date().toLocaleString();
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Fecha de emisión: ${fechaEmision}`, pageWidth - margin, cursorY, { align: 'right' });

      cursorY += 6;

      if (datosParaImprimir.length === 0) {
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('No hay registros disponibles para el criterio seleccionado.', margin, cursorY + 10);
      }

      const contentWidth = pageWidth - (margin * 2);

      // --- Loop Principal ---
      for (const item of datosParaImprimir) {
        
        // Calculo estimado de altura
        let estimatedHeight = 22 + 20; // Header + Bio
        const dinLen = (item.dinamicos || []).length;
        if (dinLen > 0) estimatedHeight += 8 + (Math.ceil(dinLen / 2) * 5);
        const opLen = (item.opcionales || []).length;
        if (opLen > 0) estimatedHeight += 8 + (Math.ceil(opLen / 2) * 5);
        if (item.diagnostico) estimatedHeight += 15 + (item.diagnostico.length / 80 * 5);
        if (item.resenia) estimatedHeight += 15 + (item.resenia.length / 80 * 5);

        // Salto de página
        if (cursorY + estimatedHeight > pageHeight - margin) {
          doc.addPage();
          cursorY = drawHeader();
          cursorY += 6;
        }

        doc.setLineWidth(0.2);

        // 1. Barra Título
        doc.setFillColor(230, 235, 240);
        doc.setDrawColor(16, 78, 167);
        doc.rect(margin, cursorY, contentWidth, 7, 'FD');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(item.fechaStr, margin + 3, cursorY + 5);

        doc.setFont('helvetica', 'normal');
        doc.text(item.especialidad.toUpperCase(), pageWidth - margin - 3, cursorY + 5, { align: 'right' });

        cursorY += 12;

        // 2. Especialista
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.text('Profesional:', margin, cursorY);

        doc.setFont('helvetica', 'bold');
        doc.text(item.especialista, margin + 25, cursorY);

        cursorY += 6;

        // 3. Biométricos
        const startX = margin;
        const cardWidth = (contentWidth - 6) / 4;
        const boxHeight = 10;

        const drawMetric = (label: string, value: string, x: number) => {
          doc.setDrawColor(255, 255, 255);
          doc.setFillColor(255, 255, 255);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(16, 78, 167);
          doc.text(label, x, cursorY);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          doc.text(value, x, cursorY + 4);
        };

        drawMetric('ALTURA', item.altura ? `${item.altura} cm` : '-', startX);
        drawMetric('PESO', item.peso ? `${item.peso} kg` : '-', startX + cardWidth + 2);
        drawMetric('TEMP.', item.temperatura ? `${item.temperatura} °C` : '-', startX + (cardWidth + 2) * 2);
        drawMetric('PRESIÓN', item.presion ? `${item.presion} mmHg` : '-', startX + (cardWidth + 2) * 3);

        cursorY += boxHeight + 2;

        doc.setDrawColor(16, 78, 167);
        doc.setLineWidth(0.2);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 4;

        // 4. Datos
        cursorY = drawDataSection('Datos Adicionales', item.dinamicos, cursorY);
        cursorY = drawDataSection('Otros Datos', item.opcionales, cursorY);

        // 5. Diagnóstico
        if (item.diagnostico) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text('DIAGNÓSTICO', margin, cursorY);
          const tW = doc.getTextWidth('DIAGNÓSTICO');
          doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.1);
          doc.line(margin, cursorY + 1, margin + tW, cursorY + 1);
          cursorY += 4;

          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          const splitDiag = doc.splitTextToSize(item.diagnostico, contentWidth);
          doc.text(splitDiag, margin, cursorY);
          cursorY += (splitDiag.length * 4) + 4;
        }

        // 6. Reseña
        if (item.resenia) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text('RESEÑA', margin, cursorY);
          const tW = doc.getTextWidth('RESEÑA');
          doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.1);
          doc.line(margin, cursorY + 1, margin + tW, cursorY + 1);
          cursorY += 4;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          const splitRes = doc.splitTextToSize(item.resenia, contentWidth);
          doc.text(splitRes, margin, cursorY);
          cursorY += (splitRes.length * 4) + 4;
        }

        // Línea final
        doc.setDrawColor(16, 78, 167);
        doc.setLineWidth(0.2);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);

        cursorY += 6;
      }

      doc.save(filename);

    } catch (err) {
      console.error(err);
      throw err; // Re-throw para que el componente maneje el error visualmente
    }
  }

  private loadImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (e) => reject(e);
    });
  }
}