=== Pixit Delivery ===
Formulario de retiro y entrega a domicilio conectado a Pixit.

== Instalación ==
1. Plugins → Añadir nuevo → Subir plugin → pixit-delivery.zip → Activar.
2. Ajustes → Pixit Delivery: revisar la URL del endpoint y el formulario (steve-docs).
3. Crear la página "Delivery" (slug: delivery) con el shortcode [pixit_delivery].
   Usar la plantilla de página de ancho completo del tema.

== Opciones del shortcode ==
[pixit_delivery]                  Portada, pasos, formulario y preguntas frecuentes.
[pixit_delivery completo="no"]    Solo el formulario.

Comunas, bloques horarios, WhatsApp y la verificación antispam se configuran en
Pixit (tabla delivery_formularios), no en WordPress. WordPress no guarda claves.
