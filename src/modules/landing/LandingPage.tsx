import { Link } from 'react-router-dom'

function HeroMockup() {
  return (
    <div className="mt-20 w-full max-w-5xl mx-auto relative group px-4 sm:px-6">
      {/* Glow detrás de la imagen (Desactivado/reducido en móviles para rendimiento) */}
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/30 to-purple-600/30 rounded-[2rem] blur-md md:blur-xl md:group-hover:blur-2xl transition duration-1000 transform-gpu"></div>
      
      <div className="relative bg-white/80 md:bg-white/70 backdrop-blur-sm md:backdrop-blur-xl border border-white/50 shadow-2xl rounded-[2rem] p-2 md:p-4">
        <div className="bg-slate-100 rounded-[1.5rem] overflow-hidden border border-slate-200/50">
          {/* Cabecera falsa del navegador */}
          <div className="bg-slate-200/50 px-4 py-3 flex items-center gap-2 border-b border-slate-200/50">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <div className="w-3 h-3 rounded-full bg-amber-400"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
          </div>
          {/* Aquí se carga la captura de pantalla de la app (app-screenshot.png en public) */}
          <div className="relative w-full bg-slate-50 flex items-center justify-center overflow-hidden aspect-[16/8]">
             <img 
               src="/app-screenshot.png" 
               alt="Pixit Dashboard" 
               className="w-full h-full object-cover object-top"
               onError={(e) => {
                 // Fallback si la imagen no existe todavía
                 e.currentTarget.style.display = 'none';
                 e.currentTarget.parentElement!.innerHTML = `
                   <div class="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg m-4 p-8 text-center">
                     <svg class="w-16 h-16 text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                     <p class="text-slate-500 font-medium text-lg">Sube la captura real de la Orden a la carpeta public/<br/>con el nombre <b>app-screenshot.png</b></p>
                   </div>
                 `;
               }}
             />
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* Fondos dinámicos (Reducidos en móvil para no ahogar la GPU) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[20%] left-[10%] w-[50vw] h-[50vw] bg-blue-400/20 rounded-full blur-2xl md:blur-3xl opacity-30 md:opacity-50 transform-gpu"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[40vw] h-[40vw] bg-purple-400/20 rounded-full blur-2xl md:blur-3xl opacity-30 md:opacity-50 transform-gpu"></div>
      </div>

      {/* Navegación */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/logo-pixit.png" alt="Pixit Logo" className="h-8 md:h-10 object-contain" />
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-semibold text-slate-600">
          <a href="#features" className="hover:text-blue-600 transition">Características</a>
          <a href="#pricing" className="hover:text-blue-600 transition">Precios</a>
        </nav>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition">
            Iniciar Sesión
          </Link>
          <Link to="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm font-bold transition shadow-lg shadow-blue-600/30">
            Prueba Gratis
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 pt-16 md:pt-24 pb-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
            Simplifica tu Taller,<br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Multiplica tus Ventas.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Pixit es el ERP y Punto de Venta todo-en-uno diseñado específicamente para talleres de servicio técnico. Controla reparaciones, inventario y facturación en un solo lugar.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/login" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 rounded-full text-base font-bold transition shadow-xl shadow-blue-600/20 transform hover:-translate-y-0.5 w-full sm:w-auto">
              Comenzar Prueba Gratis
            </Link>
            <a href="#demo" className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-full text-base font-bold transition shadow-sm w-full sm:w-auto">
              Ver Demo
            </a>
          </div>
        </div>

        <HeroMockup />

        {/* Features Section */}
        <section id="features" className="mt-40 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Todo lo que tu taller necesita</h2>
            <p className="text-lg text-slate-600">Herramientas diseñadas para ahorrarte tiempo y dar el mejor servicio a tus clientes.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            
            {/* 1. POS */}
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl hover:shadow-blue-500/10 transition duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 text-blue-600 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">POS Ágil y Moderno</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Vende accesorios, registra pagos mixtos e imprime boletas electrónicas en segundos con una interfaz pensada para la velocidad.
              </p>
            </div>
            
            {/* 2. Órdenes de Trabajo */}
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl hover:shadow-purple-500/10 transition duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 text-purple-600 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Órdenes de Trabajo</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Crea órdenes de reparación súper detalladas, sigue el estado de cada equipo y notifica a tus clientes por WhatsApp 100% en piloto automático.
              </p>
            </div>
            
            {/* 3. Multi-Sucursal */}
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl hover:shadow-emerald-500/10 transition duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 text-emerald-600 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Multi-Sucursal</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Controla múltiples bodegas, traslada stock entre tiendas y da acceso a todo tu equipo con roles y permisos específicos.
              </p>
            </div>

            {/* 4. Gastos */}
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl hover:shadow-red-500/10 transition duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-6 text-red-600 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Control de Gastos</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Registra facturas, sueldos y servicios básicos para saber exactamente cuál es tu margen de ganancia real a fin de mes.
              </p>
            </div>

            {/* 5. Órdenes de Compra */}
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl hover:shadow-amber-500/10 transition duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-6 text-amber-600 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Órdenes de Compra</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Automatiza la reposición de repuestos con tus proveedores y actualiza tu inventario en todas las bodegas con un solo clic.
              </p>
            </div>

            {/* 6. Estadísticas */}
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl hover:shadow-indigo-500/10 transition duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Contabilidad y Reportes</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Gráficos en tiempo real sobre tus ventas, comisiones de técnicos y flujos de caja. Reportes listos para enviar a tu contador.
              </p>
            </div>

          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="mt-40 max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Planes Simples y Transparentes</h2>
            <p className="text-lg text-slate-600">Comienza tu prueba gratuita de 30 días hoy mismo. Cancela cuando quieras.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            
            {/* Starter */}
            <div className="bg-white/70 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl transition duration-300 flex flex-col justify-between relative group">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="text-xl font-bold text-slate-900">Starter</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                    Básico
                  </span>
                </div>
                
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">0,5 UF</span>
                  <span className="text-xs text-slate-500 font-medium ml-1.5">+ IVA / mes</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 min-h-[32px]">Ideal para talleres que inician y quieren digitalizar sus órdenes de trabajo.</p>

                <div className="border-t border-slate-100 my-6"></div>

                <ul className="space-y-3.5">
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span><strong>1 Sucursal / Bodega</strong></span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Usuarios ilimitados</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Módulo Taller (Órdenes)</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Gestión de Inventario</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Correos automáticos a clientes</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Estadísticas de taller</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Seguimiento Post-Venta</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Gestión de permisos y roles</span>
                  </li>
                </ul>
              </div>
              
              <div className="mt-8">
                <Link to="/login" className="w-full block text-center py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm rounded-2xl transition">
                  Contratar Starter
                </Link>
              </div>
            </div>

            {/* Pro */}
            <div className="bg-white border-2 border-blue-600 shadow-xl rounded-3xl p-8 hover:shadow-2xl transition duration-300 flex flex-col justify-between relative transform md:-translate-y-4 md:scale-105">
              <span className="absolute -top-3.5 left-8 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-extrabold tracking-widest uppercase rounded-full shadow-md">
                Recomendado
              </span>
              
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="text-xl font-bold text-slate-900">PRO</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-blue-50 text-blue-800">
                    Popular
                  </span>
                </div>
                
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">1,2 UF</span>
                  <span className="text-xs text-slate-500 font-medium ml-1.5">+ IVA / mes</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 min-h-[32px]">El motor completo para expandir tu negocio, vender en sucursal y compras.</p>

                <div className="border-t border-slate-100 my-6"></div>

                <ul className="space-y-3.5">
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span><strong>2 Sucursales / Bodegas</strong></span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Usuarios ilimitados</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Módulo Taller (Órdenes)</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span><strong>Punto de Venta (POS) / Caja</strong></span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Gestión de Inventario</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span><strong>Módulo Gastos</strong></span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span><strong>Módulo Compras (OC)</strong></span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Correos automáticos a clientes</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Estadísticas de taller y ventas</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Seguimiento Post-Venta</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Gestión de permisos y roles</span>
                  </li>
                </ul>
              </div>
              
              <div className="mt-8">
                <Link to="/login" className="w-full block text-center py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl transition shadow-lg shadow-blue-600/20 transform hover:-translate-y-0.5">
                  Contratar PRO
                </Link>
              </div>
            </div>

            {/* Scale */}
            <div className="bg-white/70 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl transition duration-300 flex flex-col justify-between relative group">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="text-xl font-bold text-slate-900">Scale</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-purple-50 text-purple-800">
                    Corporativo
                  </span>
                </div>
                
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">2,5 UF</span>
                  <span className="text-xs text-slate-500 font-medium ml-1.5">+ IVA / mes</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 min-h-[32px]">El plan ilimitado diseñado para franquicias, cadenas y negocios en gran escala.</p>

                <div className="border-t border-slate-100 my-6"></div>

                <ul className="space-y-3.5">
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span><strong>Sucursales / Bodegas ilimitadas</strong></span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Usuarios ilimitados</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Módulo Taller (Órdenes)</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Punto de Venta (POS) / Caja</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Gestión de Inventario completo</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Módulo Gastos y Compras</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Correos automáticos a clientes</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Estadísticas de taller y ventas</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Seguimiento Post-Venta</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-slate-600">
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    <span>Gestión de permisos y roles</span>
                  </li>
                </ul>
              </div>
              
              <div className="mt-8">
                <a href="https://wa.me/56900000000?text=Hola,%20me%20gustaria%20saber%20mas%20sobre%20el%20plan%20SCALE%20de%20Pixit" target="_blank" className="w-full block text-center py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm rounded-2xl transition">
                  Contactar Ventas
                </a>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* Footer sencillo */}
      <footer className="border-t border-slate-200 bg-slate-50 py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <img src="/logo-pixit.png" alt="Pixit Logo" className="h-6 object-contain grayscale opacity-50" />
            <span className="font-semibold text-slate-400">© 2026 Pixit.</span>
          </div>
          <div className="text-sm font-medium text-slate-500">
            Hecho para Servicios Técnicos.
          </div>
        </div>
      </footer>
    </div>
  )
}
