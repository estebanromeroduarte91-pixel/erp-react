import { Link } from 'react-router-dom'

function HeroMockup() {
  return (
    <div className="mt-20 w-full max-w-5xl mx-auto relative group px-4 sm:px-6">
      {/* Glow detrás de la imagen */}
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-[2rem] blur-2xl opacity-20 group-hover:opacity-30 transition duration-1000"></div>
      
      <div className="relative bg-white/70 backdrop-blur-xl border border-white/50 shadow-2xl rounded-[2rem] p-2 md:p-4">
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
      
      {/* Fondos dinámicos (Manchas difuminadas estilo Startup) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[20%] left-[10%] w-[50vw] h-[50vw] bg-blue-400/10 rounded-full blur-[100px] mix-blend-multiply"></div>
        <div className="absolute bottom-[10%] right-[10%] w-[40vw] h-[40vw] bg-purple-400/10 rounded-full blur-[100px] mix-blend-multiply"></div>
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
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition hidden sm:block">
            Iniciar Sesión
          </Link>
          <Link to="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-sm font-bold transition shadow-lg shadow-blue-600/30">
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
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl transition hover:-translate-y-1">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 text-blue-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">POS Ágil y Moderno</h3>
              <p className="text-slate-600 leading-relaxed">
                Vende accesorios, registra pagos mixtos e imprime boletas electrónicas en segundos con una interfaz pensada para la velocidad.
              </p>
            </div>
            
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl transition hover:-translate-y-1">
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 text-purple-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Taller y Reparaciones</h3>
              <p className="text-slate-600 leading-relaxed">
                Sigue el estado de cada orden, notifica a tus clientes por WhatsApp o Email automáticamente y gestiona repuestos fácilmente.
              </p>
            </div>
            
            <div className="bg-white/50 backdrop-blur-sm border border-slate-200 rounded-3xl p-8 hover:shadow-xl transition hover:-translate-y-1">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 text-emerald-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Multi-Sucursal</h3>
              <p className="text-slate-600 leading-relaxed">
                Controla múltiples bodegas, traslada stock entre tiendas y da acceso a todo tu equipo con roles y permisos específicos.
              </p>
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
