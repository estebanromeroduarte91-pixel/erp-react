import type { MsgTemplates } from '@/types'

// Mensajes por defecto para WhatsApp/Email de ingreso, listo y aprobación.
// Se aplican automáticamente (ver useMsgTemplates en queries.ts) para que el
// envío de correos funcione desde el primer día, sin que el usuario tenga que
// entrar a Configuración > Mensajes y guardar manualmente al menos una vez.
export const MSG_DEFAULTS: MsgTemplates = {
  ingreso_wa:    `📥 *Orden recibida*\n\nHola *{{nombre}}*, hemos recibido tu *{{modelo}}* en nuestro taller.\n\n🔢 *Orden N°:* #{{orden}}\n📍 *Sucursal:* {{sucursal}}\n\nTe avisaremos cuando esté listo. ¡Gracias por confiar en nosotros!`,
  ingreso_email: `Hola {{nombre}},\n\nhemos recibido tu {{modelo}} en nuestro taller.\n\nOrden N°: #{{orden}}\nSucursal: {{sucursal}}\n\nTe notificaremos cuando esté listo.\n\n¡Gracias por confiar en nosotros!`,
  listo_wa:      `✅ *Tu equipo está listo*\n\nHola *{{nombre}}*, te informamos que tu *{{modelo}}* ya se encuentra listo para ser retirado.\n\n📍 *Sucursal:* {{sucursal}}\n🕐 *Horario:* {{horario}}\n🔢 *Orden N°:* #{{orden}}\n\n¡Gracias por confiar en nosotros!`,
  listo_email:   `Hola {{nombre}},\n\nte informamos que tu {{modelo}} (Orden #{{orden}}) ya se encuentra listo para ser retirado.\n\nSucursal: {{sucursal}}\nHorario: {{horario}}\n\n¡Gracias por confiar en nosotros!`,
  aprobacion_wa: `🔧 *Presupuesto para aprobación*\n\nHola *{{nombre}}*, hemos revisado tu *{{modelo}}* y necesitamos tu autorización.\n\n💰 *Presupuesto:* {{presupuesto}}\n🔢 *Orden N°:* #{{orden}}\n\n{{link}}`,
  aprobacion_email: `Hola {{nombre}},\n\nhemos revisado tu {{modelo}} y necesitamos tu autorización.\n\nTrabajo: {{trabajo}}\nPresupuesto: {{presupuesto}}\nOrden N°: #{{orden}}\n\n¡Gracias!`,
}
