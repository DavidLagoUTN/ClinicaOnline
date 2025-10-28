import { Component } from '@angular/core';
import { Registro } from "../../componentes/registro/registro";
import { Navbar } from "../../componentes/navbar/navbar";

@Component({
  selector: 'app-registrar',
  standalone: true,
  imports: [Registro, Navbar],
  templateUrl: './registrar.html',
  styleUrl: './registrar.scss'
})
export class Registrar { }