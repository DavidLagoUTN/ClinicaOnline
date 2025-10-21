import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-loading',
  templateUrl: './loading.html',
  styleUrls: ['./loading.scss']
})
export class LoadingComponent implements OnInit {
  images = [
    'assets/loading/loading_img1.png',
    'assets/loading/loading_img2.png',
    'assets/loading/loading_img3.png',
    'assets/loading/loading_img4.png'
  ];
  currentIndex = 0;

  ngOnInit(): void {
    setInterval(() => {
      this.currentIndex = (this.currentIndex + 1) % this.images.length;
    }, 300); // cambia cada 500ms
  }
}