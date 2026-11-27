import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface CanvasErrorBoundaryProps {
  children: ReactNode;
}

interface CanvasErrorBoundaryState {
  hasError: boolean;
}

export class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
  public state: CanvasErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): CanvasErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro no renderizador 3D:', error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-950 text-slate-100 p-6"
          role="alert"
        >
          <div className="max-w-md w-full rounded-xl border border-slate-800 bg-slate-900/95 p-6 text-center flex flex-col items-center gap-3 shadow-2xl">
            <AlertTriangle className="w-8 h-8 text-amber-400" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-white">
              Não foi possível iniciar o cenário 3D
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              O contexto WebGL foi interrompido ou está indisponível neste navegador no momento.
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Tentar Novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
