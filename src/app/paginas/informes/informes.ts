import { Component, OnInit, inject, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// --- IMPORTACIONES REALES ---
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType, Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';
import { TurnosService } from '../../servicios/turnos.service';
import { Navbar } from '../../componentes/navbar/navbar';
import { AgrandarDirective } from '../../directivas/agrandar.directive';
import { BordeRedondeadoDirective } from '../../directivas/borde-redondeado.directive';
import { FechaFormatoPipe } from '../../pipes/fecha-formato.pipe';
import { ResaltarPipe } from '../../pipes/resaltar.pipe';

Chart.register(...registerables);

@Component({
  selector: 'app-informes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    Navbar,
    AgrandarDirective,
    BordeRedondeadoDirective,
    FechaFormatoPipe,
    ResaltarPipe,
  ],
  templateUrl: './informes.html',
  styleUrls: ['./informes.scss'],
})
export class Informes implements OnInit {
  @ViewChildren(BaseChartDirective) charts: QueryList<BaseChartDirective> | undefined;

  private turnosService = inject(TurnosService);
  private firestore = inject(Firestore);

  turnos: any[] = [];
  logs: any[] = [];
  
  nombresEspecialistas: { [id: string]: string } = {};

  fechaInicio: string = '';
  fechaFin: string = '';

  // Configuración de Gráficos
  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true } }
  };
  public pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right' } }
  };

  // Datos Iniciales
  public dataEspecialidad: ChartData<'pie', number[], string | string[]> = {
    labels: [], datasets: [{ data: [] }],
  };
  public dataPorDia: ChartData<'bar'> = {
    labels: [], datasets: [{ data: [], label: 'Turnos' }]
  };
  public dataMedicoSolicitado: ChartData<'bar'> = {
    labels: [], datasets: [{ data: [], label: 'Solicitados' }],
  };
  public dataMedicoFinalizado: ChartData<'bar'> = {
    labels: [], datasets: [{ data: [], label: 'Finalizados' }],
  };

  // Datos para exportar
  statsEspecialidad: any[] = [];
  statsPorDia: any[] = [];
  statsMedicos: any[] = [];

  async ngOnInit() {
    await this.cargarNombresEspecialistas();

    this.turnosService.obtenerTodosLosTurnos().subscribe((data) => {
      this.turnos = data;
      this.cargarGraficos();
    });

    this.turnosService.obtenerLogsIngresos().subscribe((data) => {
      this.logs = data;
    });
  }

  async cargarNombresEspecialistas() {
    try {
      const usersCol = collection(this.firestore, 'usuarios');
      const q = query(usersCol, where('tipo', '==', 'especialista'));
      const snapshot = await getDocs(q);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        this.nombresEspecialistas[doc.id] = `${data['nombre']} ${data['apellido']}`;
      });
    } catch (err) {
      console.error('Error cargando especialistas:', err);
    }
  }

  cargarGraficos() {
    this.generarGraficoEspecialidad();
    this.generarGraficoPorDia();
    this.filtrarPorLapso();

    setTimeout(() => {
      this.charts?.forEach((c) => c.update());
    }, 100);
  }

  generarGraficoEspecialidad() {
    const contador: any = {};
    this.turnos.forEach((t) => {
      const esp = t.especialidad || 'Sin especialidad';
      contador[esp] = (contador[esp] || 0) + 1;
    });

    this.statsEspecialidad = Object.keys(contador).map((key) => ({
      Especialidad: key,
      Cantidad: contador[key],
    }));

    this.dataEspecialidad = {
      labels: Object.keys(contador),
      datasets: [{ data: Object.values(contador) }],
    };
  }

  generarGraficoPorDia() {
    const contador: { [fecha: string]: number } = {};
    this.turnos.forEach((t) => {
      const fecha = this.getFecha(t.fechaHora);
      // Usamos ISO para ordenar correctamente
      const keySort = fecha.toISOString().split('T')[0]; 
      contador[keySort] = (contador[keySort] || 0) + 1;
    });

    const fechasOrdenadas = Object.keys(contador).sort();
    const labels: string[] = [];
    const data: number[] = [];

    fechasOrdenadas.forEach(isoDate => {
      // Formatear para vista (dd/mm/yyyy)
      const [year, month, day] = isoDate.split('-');
      // Ojo: new Date(year, month-1, day) crea fecha local correcta
      const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
      const labelVisible = dateObj.toLocaleDateString('es-AR');
      labels.push(labelVisible);
      data.push(contador[isoDate]);
    });

    this.statsPorDia = labels.map((l, i) => ({ Fecha: l, Cantidad: data[i] }));

    this.dataPorDia = {
      labels: labels,
      datasets: [{ data: data, label: 'Turnos por Día', backgroundColor: '#3498db' }],
    };
  }

  filtrarPorLapso() {
    let filtrados = this.turnos;

    if (this.fechaInicio && this.fechaFin) {
      // CORRECCIÓN DE FECHA: Agregamos T00:00:00 para que sea local
      const inicio = new Date(this.fechaInicio + 'T00:00:00');
      const fin = new Date(this.fechaFin + 'T23:59:59');

      filtrados = this.turnos.filter((t) => {
        const f = this.getFecha(t.fechaHora);
        return f >= inicio && f <= fin;
      });
    }

    const sol: { [nombre: string]: number } = {};
    const fin: { [nombre: string]: number } = {};

    filtrados.forEach((t) => {
      const espId = t.id_especialista || '';
      let nombreMedico = this.nombresEspecialistas[espId];
      
      if (!nombreMedico) {
        if (t.usuarios_especialista?.nombre) {
          nombreMedico = `${t.usuarios_especialista.nombre} ${t.usuarios_especialista.apellido}`;
        } else {
          nombreMedico = espId || 'Desconocido';
        }
      }

      if (espId) {
        sol[nombreMedico] = (sol[nombreMedico] || 0) + 1;
      }

      const estado = t.estado ? t.estado.toLowerCase() : '';
      if (['realizado', 'finalizado', 'atendido'].includes(estado)) {
        if (espId) {
          fin[nombreMedico] = (fin[nombreMedico] || 0) + 1;
        }
      }
    });

    const todosLosMedicos = new Set([...Object.keys(sol), ...Object.keys(fin)]);
    this.statsMedicos = Array.from(todosLosMedicos).map((medico) => ({
      Medico: medico,
      Solicitados: sol[medico] || 0,
      Finalizados: fin[medico] || 0,
    }));

    this.dataMedicoSolicitado = {
      labels: Object.keys(sol),
      datasets: [{ data: Object.values(sol), label: 'Turnos Solicitados', backgroundColor: '#f1c40f' }],
    };

    this.dataMedicoFinalizado = {
      labels: Object.keys(fin),
      datasets: [{ data: Object.values(fin), label: 'Turnos Finalizados', backgroundColor: '#27ae60' }],
    };

    setTimeout(() => {
      this.charts?.forEach((c) => c.update());
    }, 50);
  }

  private getFecha(fechaHora: any): Date {
    if (!fechaHora) return new Date();
    if (fechaHora instanceof Date) return fechaHora;
    if (fechaHora.seconds) return new Date(fechaHora.seconds * 1000);
    if (fechaHora.toDate) return fechaHora.toDate();
    return new Date(fechaHora);
  }

  // --- DESCARGAS ---

  descargarExcelLogs() {
    const dataLogs = this.logs.map((log) => ({
      Usuario: `${log.nombre} ${log.apellido}`,
      Rol: log.tipo,
      Fecha: this.getFecha(log.fecha).toLocaleString(),
    }));

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    const wsLogs: XLSX.WorkSheet = XLSX.utils.json_to_sheet(dataLogs);
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Logs Ingresos');

    const wsEsp: XLSX.WorkSheet = XLSX.utils.json_to_sheet(this.statsEspecialidad);
    XLSX.utils.book_append_sheet(wb, wsEsp, 'Especialidades');

    const wsDia: XLSX.WorkSheet = XLSX.utils.json_to_sheet(this.statsPorDia);
    XLSX.utils.book_append_sheet(wb, wsDia, 'Por Día');

    const wsMed: XLSX.WorkSheet = XLSX.utils.json_to_sheet(this.statsMedicos);
    XLSX.utils.book_append_sheet(wb, wsMed, 'Médicos');

    XLSX.writeFile(wb, 'informes_clinica_completo.xlsx');
  }

  descargarPDF() {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Capturar imágenes
    const chartImages: string[] = [];
    if (this.charts) {
      this.charts.forEach((c) => {
        if (c.chart) {
          chartImages.push(c.chart.toBase64Image());
        }
      });
    }

    // --- PAGINA 1 ---
    let yPos = 15;
    doc.setFontSize(18);
    doc.text('Informe Estadístico Clínica Online', 10, yPos);
    yPos += 10;
    doc.setFontSize(12);
    doc.text(`Fecha de emisión: ${fecha}`, 10, yPos);
    yPos += 15;

    doc.setFontSize(14);
    doc.text('Turnos por Especialidad:', 10, yPos);
    yPos += 7;
    autoTable(doc, {
      startY: yPos,
      head: [['Especialidad', 'Cantidad']],
      body: this.statsEspecialidad.map((s) => [s.Especialidad, s.Cantidad]),
    });
    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    if (chartImages[0]) {
      const imgWidth = 90; 
      const imgHeight = 50; 
      const xPos = (pageWidth - imgWidth) / 2;
      doc.addImage(chartImages[0], 'PNG', xPos, yPos, imgWidth, imgHeight); 
    }

    // --- PAGINA 2 ---
    doc.addPage();
    yPos = 20;

    doc.setFontSize(14);
    doc.text('Cantidad de Turnos por Día:', 10, yPos);
    yPos += 7;
    autoTable(doc, {
      startY: yPos,
      head: [['Fecha', 'Cantidad']],
      body: this.statsPorDia.map((s) => [s.Fecha, s.Cantidad]),
    });
    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    if (chartImages[1]) {
      const imgWidth = 110; 
      const imgHeight = 55;
      const xPos = (pageWidth - imgWidth) / 2;
      doc.addImage(chartImages[1], 'PNG', xPos, yPos, imgWidth, imgHeight); 
    }

    // --- PAGINA 3 ---
    doc.addPage(); 
    yPos = 20;

    doc.setFontSize(16);
    doc.text('Desempeño por Médico', 10, yPos);
    yPos += 8;

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100); 
    let rangoTexto = 'Período analizado: Histórico completo';
    if (this.fechaInicio && this.fechaFin) {
        // Mostrar fechas corregidas para visualización
        // (Usamos split y no new Date para evitar conversion UTC)
        const [yi, mi, di] = this.fechaInicio.split('-');
        const [yf, mf, df] = this.fechaFin.split('-');
        rangoTexto = `Período analizado: Del ${di}/${mi}/${yi} al ${df}/${mf}/${yf}`;
    }
    doc.text(rangoTexto, 10, yPos);
    yPos += 12;

    doc.setTextColor(0);
    autoTable(doc, {
      startY: yPos,
      head: [['Médico', 'Solicitados', 'Finalizados']],
      body: this.statsMedicos.map((s) => [s.Medico, s.Solicitados, s.Finalizados]),
    });
    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    if (chartImages[2]) {
        if (yPos + 60 > 280) { doc.addPage(); yPos = 20; }
        const imgWidth = 110;
        const imgHeight = 55;
        const xPos = (pageWidth - imgWidth) / 2;
        doc.setFontSize(12); doc.text('Turnos Solicitados:', 10, yPos); yPos += 7;
        doc.addImage(chartImages[2], 'PNG', xPos, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
    }

    if (chartImages[3]) {
        if (yPos + 70 > 280) { doc.addPage(); yPos = 20; }
        const imgWidth = 110;
        const imgHeight = 55;
        const xPos = (pageWidth - imgWidth) / 2;
        doc.setFontSize(12); doc.text('Turnos Finalizados:', 10, yPos); yPos += 7;
        doc.addImage(chartImages[3], 'PNG', xPos, yPos, imgWidth, imgHeight);
    }

    doc.save('estadisticas_clinica_completo.pdf');
  }
}