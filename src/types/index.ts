// ─────────────────────────────────────────────────────────────
// Tipos del ERP — campos 1:1 con los datos en erp_data (Supabase).
// NO renombrar: estos nombres viven guardados en la base de datos.
// ─────────────────────────────────────────────────────────────

export type Rol = 'admin' | 'encargado' | 'tecnico' | 'vendedor' | string

// ── Taller ────────────────────────────────────────────────────
// Valores reales guardados en o.status (igual que el ERP actual)
export type EstadoOrden = 'Chequeo' | 'Reparación' | 'Listo' | 'Entregado' | 'No reparable' | string

export interface CheckItem {
  label: string
  checked: boolean
}

export interface Repuesto {
  productId?: string   // id del producto en inventario (si viene de ahí)
  name: string         // nombre del repuesto (campo real en erp_data)
  qty: number          // cantidad (campo real: qty, no cantidad)
  precio: number
}

export interface Inspeccion {
  fotos: string[]
  notas: string
  fecha: string
}

export interface Orden {
  id: string
  num: string           // string con ceros: '0001', '0002'...
  fecha: string         // ISO string
  status: EstadoOrden   // 'Chequeo' | 'Reparación' | 'Listo' | 'Entregado'
  nombre: string        // nombre del cliente
  apellido?: string
  tel?: string          // teléfono (campo "tel", no "telefono")
  email?: string
  rut?: string
  modelo?: string       // equipo seleccionado (Ej: "iPhone 14 Pro Max")
  serie?: string
  color?: string
  pin?: string
  pinType?: 'text' | 'pattern'
  estadoFisico?: string
  trabajo?: string      // descripción del trabajo a realizar
  tecnico?: string
  presup?: string | number
  costo?: string | number
  fechaEstimada?: string
  repuestos?: Repuesto[]
  checkIngreso?: CheckItem[]
  photosIngreso?: string[]
  branchId?: string
  _draft?: boolean
  // Inspección / salida / cierre (mismos campos que el ERP vanilla)
  inspeccion?: Inspeccion
  photosSalida?: string[]
  checkSalida?: CheckItem[]
  observSalida?: string
  obs?: string
  photosTraslado?: string[]
  aprobacion_estado?: 'pendiente' | 'aprobado' | 'rechazado'
  aprobacion_token?: string
  aprobacion_enviado?: string
  aprobacion_fecha?: string
  deliveredAt?: string
  updatedAt?: string
  createdAt?: string
  venta_id?: string
  numero_boleta?: string
}

// ── Catálogo de equipos del taller (tp_equipos) ──────────────
export interface Equipo {
  id: string
  marca?: string
  modelo?: string
  categoria?: string    // 'Teléfono' | 'Tablet' | 'Notebook' | ...
  descripcion?: string
}

// ── Inventario ────────────────────────────────────────────────
export interface Producto {
  id: string
  nombre: string
  sku?: string
  unidad?: string
  precio_compra?: number   // costo neto
  precio_venta?: number
  stock?: number
  stock_min?: number
  stock_sucursales?: Record<string, number>
  categoria?: string
  subcategoria?: string
  descripcion?: string
  enlace?: string
}

export interface Bodega {
  id: string
  nombre?: string   // la mayoría usa "nombre", algunos "name"
  name?: string
  direccion?: string
  tel?: string
  email?: string
  horario?: string
  activo?: boolean
}

export interface MovProducto {
  producto_id: string
  producto_nombre: string
  cantidad: number
  direccion?: '+' | '-'
}

export interface Movimiento {
  id: string
  fecha: string
  hora?: string
  tipo: 'entrada' | 'salida' | 'ajuste' | 'traslado' | string
  productos: MovProducto[]
  bodega_origen?: string
  bodega_destino?: string
  referencia?: string
  referencia_id?: string
  notas?: string
  usuario?: string
}

export interface Categoria {
  id: string
  nombre: string
  subcategorias?: string[]
}

// ── Clientes / Contactos ─────────────────────────────────────
export interface Cliente {
  id: string
  nombre: string
  apellido?: string
  rut?: string
  email?: string
  tel?: string
  direccion?: string
  fecha_creacion?: string
}

export interface Proveedor {
  id: string
  nombre: string
  rut?: string
  contacto?: string    // persona de contacto
  telefono?: string    // campo real: "telefono", no "tel"
  email?: string
  direccion?: string
  notas?: string
  fecha_creacion?: string
}

// ── Ventas ───────────────────────────────────────────────────
export interface VentaItem {
  id: string
  producto_id: string | null
  producto_nombre: string
  cantidad: number
  precio_neto: number    // precio unitario sin IVA
  precio_iva: number     // precio unitario con IVA
  descuento: number      // %
  subtotal: number       // neto
}

export interface Venta {
  id: string
  numero: string          // 'VTA-00001'
  fecha: string           // 'YYYY-MM-DD'
  estado: 'pagada' | 'anulada'
  cliente: string
  metodo_pago: string     // id del método ('efectivo', 'tarjeta', 'transfer')
  branchId: string
  branchNombre: string
  bodega_id: string
  cajaId: string
  otId: string | null
  otNum: string | null
  items: VentaItem[]
  total: number           // neto
  total_iva: number       // con IVA
  fecha_creacion: string
}

export interface MetodoPago {
  id: string
  icon: string
  label: string
  desc: string
}

export interface Caja {
  id: string
  nombre: string
  sucursalId?: string
  bodegaId?: string
  activa?: boolean
}

export interface CajaSesion {
  id: string
  branchId: string
  cajaId: string
  fecha: string
  estado: 'abierta' | 'cerrada'
  apertura: {
    hora: string
    responsable: string
    montoInicial: number
  }
  cierre: {
    hora: string
    conteoEfectivo: number
    diferencia: number
    observaciones: string
    totalVentas: number
    conteo: number
  } | null
}

// ── Contabilidad + Gastos ────────────────────────────────────
export interface Gasto {
  id: string
  fecha: string         // 'YYYY-MM-DD'
  descripcion: string
  monto: number
  categoria: string     // nombre de la categoría
  subcategoria?: string // desglose dentro de la categoría (ej. empleado, sucursal, plataforma)
  metodo?: string       // 'Efectivo' | 'Transferencia' | etc.
}

export interface GastoCat {
  id: string
  nombre: string
  color: string
  icono: string
}

export interface CuentaContable {
  id: string
  codigo: string
  nombre: string
  tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto' | string
  grupo: string
}

export interface AsientoLinea {
  cuenta_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  debe: number
  haber: number
}

export interface Asiento {
  id: string
  numero?: number
  fecha: string
  descripcion: string
  ref_tipo?: string    // 'venta' | 'gasto' | 'oc' | 'manual'
  ref_id?: string
  ref_numero?: string
  lineas: AsientoLinea[]
}

// ── Config Seguimiento (correos + logo) ──────────────────────
export interface SeguimientoConfig {
  nombreTaller?: string
  emailContacto?: string
  telefono?: string
  horario?: string
  ubicacion?: string
  especialidad?: string
  dias?: number
  asunto?: string
  msgApertura?: string
  msgCierre?: string
  logoUrl?: string
}

export interface SmtpConfig {
  host?: string
  port?: number
  user?: string
  password?: string
  from_name?: string
  from_email?: string
  secure?: boolean
}

export interface MsgTemplates {
  ingreso_wa?: string
  ingreso_email?: string
  aprobacion_wa?: string
  aprobacion_email?: string
  inspeccion_wa?: string
  inspeccion_email?: string
  listo_wa?: string
  listo_email?: string
  [key: string]: string | undefined
}

// ── Ficha de empleado ─────────────────────────────────────────
export interface RegistroVacaciones {
  id: string
  fecha_inicio: string   // YYYY-MM-DD
  fecha_fin: string      // YYYY-MM-DD
  dias_habiles: number   // calculado automáticamente
  estado: 'aprobado' | 'pendiente'
  nota?: string
}

export interface RegistroInasistencia {
  id: string
  fecha: string          // YYYY-MM-DD
  tipo: 'sin_aviso' | 'justificada'
  nota?: string
}

export interface FichaUsuario {
  fecha_ingreso?: string // YYYY-MM-DD
  dias_anuales?: number  // 15 por defecto (legal Chile)
  vacaciones?: RegistroVacaciones[]
  inasistencias?: RegistroInasistencia[]
}

// ── Cargos y permisos ─────────────────────────────────────────
export type ModuloKey = 'dashboard' | 'ventas' | 'taller' | 'clientes' | 'inventario' | 'compras' | 'estadisticas' | 'configuracion'

export interface CargoPermisos {
  dashboard: boolean
  ventas: boolean
  taller: boolean
  clientes: boolean
  inventario: boolean
  compras: boolean
  estadisticas: boolean
  configuracion: boolean
}

export interface Cargo {
  id: string
  nombre: string
  sistema: boolean
  rol?: 'tecnico' | 'vendedor' | 'encargado'  // rol base en user_profiles; system cargos lo heredan del id
  permisos: CargoPermisos
}

// ── Usuarios del sistema ──────────────────────────────────────
export interface UserProfile {
  id: string
  nombre: string
  role: string
  activo: boolean
}

export interface UserConfig {
  cargoId?: string
  branchId?: string
}

export interface PendingInvite {
  id: string
  email: string
  nombre: string
  role: string
  token: string
  created_at: string
}

// ── Traslados (derivaciones a técnicos externos) ─────────────
export type EstadoTraslado = 'enviado' | 'en-revision' | 'listo' | 'con-problema' | 'retornado'

export interface TecnicoExterno {
  id: string
  nombre: string
  telefono?: string
  email?: string
  notas?: string
}

export interface Traslado {
  id: string
  numero: number
  equipo: string
  cliente?: string
  order_id?: string
  tecnico: string
  tecnico_tel?: string
  condicion?: 'enciende' | 'apagado' | string
  precio_acordado?: number
  estado: EstadoTraslado
  fecha_envio?: string
  fecha_retorno_est?: string
  fecha_retorno_real?: string
  motivo?: string
  notas?: string
  fotos?: string[]
  tecnico_ext_id?: string
}

// ── Kits de Equipos ──────────────────────────────────────────
export interface KitComponente {
  id: string
  nombre: string
  cantidad: number
  producto_id?: string
  es_variable?: boolean
  color_defecto?: string
}

export interface Kit {
  id: string
  nombre: string
  categoria?: string
  componentes: KitComponente[]
  fecha_creacion?: string
}

// ── Compras / Órdenes de Compra ───────────────────────────────

export type EstadoOC = 'borrador' | 'parcial' | 'recibida' | 'confirmada' | 'cancelada'

export interface OCItem {
  id: string
  producto_id: string
  producto_nombre: string
  cantidad: number
  precio_neto: number
  precio_iva: number
  precio_unitario: number
  subtotal: number
  bodega_id: string
  bodega_nombre: string
}

export interface OCRecepcionItem {
  prod_item_id: string
  producto_id: string
  producto_nombre: string
  cantidad: number
}

export interface OCRecepcion {
  id: string
  fecha: string
  bodega_id: string
  bodega_nombre: string
  notas?: string
  items: OCRecepcionItem[]
}

export interface OC {
  id: string
  numero: string
  estado: EstadoOC
  proveedor_id: string
  proveedor_nombre: string
  fecha: string
  fecha_entrega?: string
  bodega_id?: string
  bodega_nombre?: string
  notas?: string
  items: OCItem[]
  total: number
  fecha_creacion: string
  recepciones?: OCRecepcion[]
  folio_factura?: string
  metodo_pago?: string
  fecha_recepcion?: string
  fecha_primera_recepcion?: string
  fecha_confirmacion?: string
}

export interface OCLogEntry extends OC {
  _eliminada_en: string
  _eliminada_ts: number
}

// ── Dominio de email (Resend) ─────────────────────────────────
export type DominioStatus = 'verified' | 'pending' | 'not_started' | 'failed' | 'temporary_failure'

export interface DominioRecord {
  type: string
  name: string
  value: string
  priority?: number
  status: DominioStatus
}

export interface EmailDomain {
  domain?: string
  domainId?: string
  status?: DominioStatus
  records?: DominioRecord[]
  from_email?: string
  from_name?: string
}
