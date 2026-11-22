import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, Smartphone, Wifi, X } from 'lucide-react';
import type { StickInput } from '../sim/types';

interface PairingModalProps {
  roomCode: string;
  controllerCount: number;
  p2pConnected?: boolean;
  serverAvailable?: boolean;
  remoteSticks: StickInput;
  onClose: () => void;
}

export function PairingModal({
  roomCode,
  controllerCount,
  p2pConnected = false,
  serverAvailable = true,
  remoteSticks,
  onClose,
}: PairingModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const controllerUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?controller=${encodeURIComponent(roomCode)}`
      : `/?controller=${roomCode}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(controllerUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#f8fafc' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [controllerUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(controllerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 18, 0.84)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pairing-title"
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-700 p-6 text-slate-100 flex flex-col gap-5"
        style={{ backgroundColor: 'rgba(12, 18, 32, 0.98)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 id="pairing-title" className="font-display text-xl font-bold text-white">
                Controle Virtual no Celular
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Transforme seu smartphone em um rádio controle dual-stick em tempo real
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de pareamento"
            className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!serverAvailable && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200 leading-relaxed">
            Servidor WebSocket não detectado neste host estático (ex.: GitHub Pages). Para parear o celular com o PC, rode o projeto com{' '}
            <span className="font-mono text-amber-100">npm run dev</span> ou acesse pelo link hospedado com servidor Node.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 items-center">
          {/* QR Code Box */}
          <div className="flex flex-col items-center justify-center bg-slate-50 rounded-xl p-3 mx-auto w-[196px] h-[196px]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code para parear celular na sala ${roomCode}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-xs text-slate-600 font-mono">Gerando QR...</div>
            )}
          </div>

          {/* Instructions & Room Code */}
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs text-slate-400">1. Aponte a câmera do celular para o QR Code</div>
              <div className="text-xs text-slate-400 mt-1">
                2. Ou acesse o link e digite o código da sala:
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5">
              <div>
                <div className="text-[10px] text-slate-400">CÓDIGO DA SALA</div>
                <div className="font-mono text-2xl font-bold tracking-widest text-amber-400 tabular-nums">
                  {roomCode}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5 text-xs font-medium">
                  <Wifi className={`w-3.5 h-3.5 ${controllerCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className={controllerCount > 0 ? 'text-emerald-300' : 'text-slate-400'}>
                    {controllerCount > 0 ? `${controllerCount} conectado` : 'Aguardando...'}
                  </span>
                </div>
                {controllerCount > 0 && (
                  <div className="text-[10px] font-mono mt-0.5 text-slate-400">
                    {p2pConnected ? (
                      <span className="text-emerald-400">Direto P2P (Ultra Rápido)</span>
                    ) : (
                      <span className="text-sky-400">Modo Binário WS</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                aria-label="Link do controle virtual"
                value={controllerUrl}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 truncate"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <a
              href={controllerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 w-fit"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Testar tela do controle neste navegador
            </a>
          </div>
        </div>

        {/* Live Signal Verification Strip */}
        <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-4 py-3 flex items-center justify-between gap-4 text-xs font-mono tabular-nums">
          <span className="text-slate-400 font-sans">Sinal ao vivo do controle:</span>
          <div className="flex items-center gap-4 text-slate-200">
            <span>THR {Math.round(remoteSticks.throttle * 100)}%</span>
            <span>YAW {Math.round(remoteSticks.yaw * 100)}%</span>
            <span>PIT {Math.round(remoteSticks.pitch * 100)}%</span>
            <span>ROL {Math.round(remoteSticks.roll * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
