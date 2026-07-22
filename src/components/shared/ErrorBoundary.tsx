import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Sin esto, cualquier excepción no controlada al renderizar (un bug puntual
// en cualquier pantalla) desmonta TODO el árbol de React y deja la página en
// blanco — solo se recupera con un F5 completo. Con el boundary, el error
// queda contenido en la pantalla que falló y se puede reintentar sin perder
// la sesión ni tener que recargar a ciegas.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturó un error de render:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-gray-900">Algo salió mal</h1>
              <p className="mt-1 text-sm text-gray-500">Ocurrió un error inesperado en esta pantalla. Puedes intentar de nuevo o recargar la página.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => this.setState({ error: null })}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
                Reintentar
              </button>
              <button onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition">
                Recargar página
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
