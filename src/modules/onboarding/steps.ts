export interface TourStep {
  targetId: string; // ID of the DOM element to highlight
  title: string;
  content: string;
  route?: string; // React Router path that must be active
  position?: 'top' | 'bottom' | 'left' | 'right';
  actionExpected?: 'click' | 'input' | 'none';
}

export type TourId = 'config' | 'inventory' | 'operation' | 'finance';

export const onboardingTours: Record<TourId, TourStep[]> = {
  config: [
    // 1. Logo y Postventa (en Taller Settings)
    {
      targetId: 'tour-sidebar-taller',
      title: 'Configura tu Taller',
      content: 'Primero, entraremos al módulo de Taller para configurar la identidad visual y los mensajes automáticos de postventa.',
      position: 'right',
      route: '/dashboard'
    },
    {
      targetId: 'tour-taller-tab-settings',
      title: 'Ajustes del Taller',
      content: 'Haz clic en la pestaña de Ajustes de Taller para ingresar al panel de configuraciones.',
      position: 'bottom',
      route: '/taller'
    },
    {
      targetId: 'tour-taller-settings-tab-seguimiento',
      title: 'Configurar Logotipo',
      content: 'Haz clic en la sección de **Seguimiento** para cargar la imagen corporativa de tu taller.',
      position: 'bottom',
      route: '/taller?tab=settings'
    },
    {
      targetId: 'tour-logo-upload',
      title: 'Cargar Logotipo del Taller',
      content: 'Arrastra el logotipo de tu negocio aquí. Este logo se usará automáticamente en las cabeceras de tus cotizaciones y en las notificaciones por correo de ingreso, listo y entrega.',
      position: 'top',
      route: '/taller?tab=settings'
    },
    // 2. Sucursales (en Inventario Bodegas)
    {
      targetId: 'tour-sidebar-inventario',
      title: 'Sucursales y Bodegas',
      content: 'Ahora configuraremos tus puntos de venta y bodegas físicas. Dirígete a la sección de Inventario.',
      position: 'right',
      route: '/taller?tab=settings'
    },
    {
      targetId: 'tour-inventario-tab-bodegas',
      title: 'Pestaña de Bodegas',
      content: 'Haz clic en **Bodegas / Sucursales** para registrar tus locales comerciales y bodegas de repuestos.',
      position: 'bottom',
      route: '/inventario'
    },
    // 3. SMTP (en Config SMTP)
    {
      targetId: 'tour-sidebar-config',
      title: 'Configuración del Sistema',
      content: 'A continuación, vincularemos tu correo corporativo y gestionaremos tu staff. Dirígete a Configuración general.',
      position: 'right',
      route: '/inventario?tab=bodegas'
    },
    {
      targetId: 'tour-config-tab-smtp',
      title: 'Configurar Correo SMTP',
      content: 'Haz clic en la pestaña **SMTP** para ingresar las credenciales de tu servidor de correo y enviar avisos automáticos usando tu propio dominio.',
      position: 'bottom',
      route: '/config'
    },
    // 4. Usuarios (en Config Accesos)
    {
      targetId: 'tour-config-tab-accesos',
      title: 'Usuarios y Permisos',
      content: 'Por último, haz clic en la pestaña **Accesos** para invitar a tu staff técnico y de ventas, configurando sus respectivos cargos y permisos de seguridad.',
      position: 'bottom',
      route: '/config'
    }
  ],
  inventory: [
    {
      targetId: 'tour-sidebar-inventario',
      title: 'Módulo de Inventario',
      content: 'Ingresemos a Inventario para gestionar el catálogo de productos y repuestos.',
      position: 'right',
      route: '/dashboard'
    },
    {
      targetId: 'tour-inventario-btn-importar-excel',
      title: 'Carga Masiva de Productos',
      content: 'Si ya tienes un listado de precios en Excel, puedes descargar nuestra plantilla modelo y cargar miles de productos en lote.',
      position: 'bottom',
      route: '/inventario'
    },
    {
      targetId: 'tour-inventario-btn-importar-excel',
      title: '¿Para qué sirve la columna "Enlace"?',
      content: '<strong>IMPORTANTE:</strong> Sirve para agrupar productos para el módulo de <strong>Kits / Equipos para Desarme</strong> (cuando compras un equipo usado/dañado para usarlo para repuestos). Al asociar las piezas bajo un mismo enlace, el sistema cargará automáticamente todas las partes y componentes de ese modelo para que no tengas que ingresarlos uno por uno.',
      position: 'bottom',
      route: '/inventario'
    },
    {
      targetId: 'tour-inventario-btn-nuevo-producto',
      title: 'Creación Manual',
      content: 'O haz clic en este botón si prefieres crear un producto o servicio de manera manual rellenando stocks y costos iniciales.',
      position: 'bottom',
      route: '/inventario'
    }
  ],
  operation: [
    {
      targetId: 'tour-sidebar-contactos',
      title: 'Directorio de Contactos',
      content: 'Antes de registrar transacciones, es útil registrar a tus clientes. Haz clic aquí para entrar a la agenda.',
      position: 'right',
      route: '/dashboard'
    },
    {
      targetId: 'tour-contactos-btn-nuevo-cliente',
      title: 'Registrar Clientes',
      content: 'Haz clic en el botón de creación para agregar un nuevo cliente con sus datos de contacto.',
      position: 'bottom',
      route: '/contactos'
    },
    {
      targetId: 'tour-sidebar-taller',
      title: 'Órdenes de Trabajo',
      content: 'Ahora ingresaremos al módulo de Taller, el corazón operativo del negocio.',
      position: 'right',
      route: '/contactos'
    },
    {
      targetId: 'tour-taller-btn-nueva-orden',
      title: 'Crear Primera Orden',
      content: 'Haz clic aquí para ingresar una nueva orden de servicio vinculando al cliente y los detalles del equipo.',
      position: 'bottom',
      route: '/taller'
    },
    {
      targetId: 'tour-sidebar-ventas',
      title: 'Punto de Venta (POS)',
      content: 'Para ventas directas de accesorios o repuestos por mesón, puedes utilizar el Punto de Venta en el menú de Ventas.',
      position: 'right',
      route: '/taller'
    }
  ],
  finance: [
    {
      targetId: 'tour-sidebar-contabilidad',
      title: 'Gestión Financiera',
      content: 'En la sección de Contabilidad y Compras gestionarás el egreso financiero del negocio. Entremos para revisar.',
      position: 'right',
      route: '/dashboard'
    },
    {
      targetId: 'tour-compras-tab-ocs',
      title: 'Órdenes de Compra (OC)',
      content: 'En la pestaña de Compras podrás registrar órdenes de compra a proveedores para reabastecer tu stock.',
      position: 'bottom',
      route: '/compras'
    },
    {
      targetId: 'tour-contabilidad-tab-gastos',
      title: 'Control de Gastos',
      content: 'Y en Gastos registrarás los desembolsos operativos (arriendos, servicios, etc.) para mantener cuadradas tus utilidades reales.',
      position: 'bottom',
      route: '/compras'
    }
  ]
};
