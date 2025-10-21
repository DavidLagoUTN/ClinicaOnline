import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LoadingComponent } from "../../componentes/loading/loading";
import { Navbar } from "../../componentes/navbar/navbar";

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingComponent, Navbar],
  templateUrl: './home.html',
  styleUrls: ['./home.scss']
})
export class Home {}
