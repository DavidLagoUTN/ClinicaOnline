import { trigger, transition, style, query, animate, group, keyframes } from '@angular/animations';

export const slideInAnimation =
  trigger('routeAnimations', [
    
    // 1. SLIDE UP (Desde Abajo hacia Arriba - PEDIDO)
    transition('* => slideUp', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%'
        })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('500ms ease-out', style({ transform: 'translateY(-100%)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('500ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
        ], { optional: true })
      ])
    ]),

    // 2. SLIDE DOWN (Desde Arriba hacia Abajo)
    transition('* => slideDown', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%' })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateY(-100%)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('500ms ease-out', style({ transform: 'translateY(100%)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('500ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
        ], { optional: true })
      ])
    ]),

    // 3. SLIDE LEFT (Desde Derecha a Izquierda)
    transition('* => slideLeft', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%' })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('500ms ease-out', style({ transform: 'translateX(-100%)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('500ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
        ], { optional: true })
      ])
    ]),

    // 4. SLIDE RIGHT (Desde Izquierda a Derecha)
    transition('* => slideRight', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%' })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateX(-100%)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('500ms ease-out', style({ transform: 'translateX(100%)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('500ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
        ], { optional: true })
      ])
    ]),

    // 5. FADE (Disolvencia Simple)
    transition('* => fade', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%' })
      ], { optional: true }),
      query(':enter', [
        style({ opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('600ms ease', style({ opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('600ms ease', style({ opacity: 1 }))
        ], { optional: true })
      ])
    ]),

    // 6. ZOOM (Acercamiento)
    transition('* => zoom', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%' })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'scale(0.5)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('500ms ease-in', style({ transform: 'scale(0)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'scale(1)', opacity: 1 }))
        ], { optional: true })
      ])
    ]),

    // 7. ROTATE (Rotación de entrada)
    transition('* => rotate', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%', transformOrigin: 'center center' })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'rotate(-180deg) scale(0.1)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('600ms ease-in', style({ transform: 'rotate(180deg) scale(0)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('600ms ease-out', style({ transform: 'rotate(0) scale(1)', opacity: 1 }))
        ], { optional: true })
      ])
    ]),

    // 8. ELASTIC (Rebote)
    transition('* => elastic', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%' })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateY(-100%)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('400ms ease-out', style({ transform: 'scale(0.8)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('800ms cubic-bezier(0.68, -0.55, 0.265, 1.55)', style({ transform: 'translateY(0)', opacity: 1 }))
        ], { optional: true })
      ])
    ]),
  ]);