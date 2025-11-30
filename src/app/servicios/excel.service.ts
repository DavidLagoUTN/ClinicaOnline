import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import * as FileSaver from 'file-saver';

@Injectable({
    providedIn: 'root'
})
export class ExcelService {
    constructor() { }

    exportarComoExcel(data: any[], nombreArchivo: string, nombreHoja = 'Usuarios'): void {
        const hoja = XLSX.utils.json_to_sheet(data);
        const libro = { Sheets: { [nombreHoja]: hoja }, SheetNames: [nombreHoja] };
        const excelBuffer: any = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });

        this.guardarArchivo(excelBuffer, nombreArchivo);
    }

    exportarDesdeAoA(aoa: any[][], nombreArchivo: string, nombreHoja = 'Sheet1'): void {
        const hoja = XLSX.utils.aoa_to_sheet(aoa);
        const libro = { Sheets: { [nombreHoja]: hoja }, SheetNames: [nombreHoja] };
        const excelBuffer: any = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
        this.guardarArchivo(excelBuffer, nombreArchivo);
    }

    private guardarArchivo(buffer: any, nombre: string): void {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        FileSaver.saveAs(blob, `${nombre}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }


}
