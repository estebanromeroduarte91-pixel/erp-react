// Etiqueta de 60 × 40 mm para la impresora térmica del taller.
//
// Vive acá y no dentro de la pantalla de la orden para poder probarla: la
// etiqueta tiene que caber SIEMPRE en una sola hoja. Si el contenido se pasa
// aunque sea un pixel, Chrome agrega una segunda hoja en blanco y la
// impresora saca una etiqueta vacía por cada orden.

export interface DatosEtiqueta {
  num: string
  modelo?: string
  cliente?: string
  trabajo?: string
  pin?: string
  /** Taller y sucursal, ya unidos: "Mi Taller — Centro". */
  pie?: string
  /** URL que abre la orden al escanear el QR. */
  url: string
}

/** Escapa el texto del cliente: va dentro de HTML que se escribe con document.write. */
function esc(v: string | undefined): string {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

export function etiquetaHtml(d: DatosEtiqueta): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta OT #${esc(d.num)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
  /* Una sola hoja de 60 × 40 mm, sin márgenes: así Chrome no imprime
     encabezado ni pie, y el papel calza con el rollo de la etiquetera. */
  @page{size:60mm 40mm;margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:60mm;height:40mm;overflow:hidden}
  body{font-family:'Manrope',system-ui,sans-serif;background:#fff;padding:3mm 3mm 3mm 4mm;display:flex;gap:3mm;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .left{display:flex;flex-direction:column;justify-content:space-between;flex:1;min-width:0;overflow:hidden}
  /* Cada texto se recorta a un máximo de líneas: un modelo largo o un trabajo
     de tres renglones ya no empujan el contenido fuera de la etiqueta. */
  .modelo{font-size:8pt;font-weight:800;color:#000;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .cliente{font-size:7.5pt;font-weight:600;color:#000;margin-top:.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .orden-label{font-size:4.5pt;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-top:1.5mm}
  .orden{font-size:13pt;font-weight:800;color:#000;line-height:1.1;margin-bottom:1mm}
  .row{font-size:6.5pt;color:#000;margin-top:1mm;font-weight:500;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .row b{font-weight:700}
  .footer{font-size:4.5pt;color:#999;font-weight:500;margin-top:auto;padding-top:1mm;white-space:nowrap;overflow:hidden}
  .right{display:flex;flex-direction:column;align-items:center;justify-content:center;width:17mm;border-left:.3px solid #ddd;padding-left:2.5mm;flex-shrink:0;overflow:hidden}
  /* qrcodejs dibuja el QR dos veces (canvas + img). Se muestra uno solo: los
     dos juntos hacen crecer la columna y empujan la etiqueta a otra hoja. */
  #qr{width:13mm;height:13mm;display:flex;align-items:center;justify-content:center;overflow:hidden}
  #qr img{display:none}
  #qr canvas{width:13mm!important;height:13mm!important}
  .qr-lbl{font-size:4pt;color:#aaa;margin-top:1mm;text-align:center;font-weight:500}
</style></head><body>
<div class="left">
  <div>
    <div class="modelo">${esc(d.modelo) || '—'}</div>
    <div class="cliente">${esc(d.cliente) || '—'}</div>
    <div class="orden-label">Orden</div>
    <div class="orden">#${esc(d.num)}</div>
    <div class="row"><b>Trabajo:</b> ${esc(d.trabajo) || '—'}</div>
    ${d.pin ? `<div class="row"><b>Clave:</b> ${esc(d.pin)}</div>` : ''}
  </div>
  <div class="footer">${esc(d.pie)}</div>
</div>
<div class="right">
  <div id="qr"></div>
  <div class="qr-lbl">Abrir OT</div>
</div>
<script>
  new QRCode(document.getElementById('qr'),{text:${JSON.stringify(d.url)},width:120,height:120,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});
  // Se imprime apenas están la tipografía y el QR, sin esperas fijas.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
    requestAnimationFrame(function () { setTimeout(function () { window.print() }, 120) })
  });
</script>
</body></html>`
}
