import { useCallback, useEffect, useState } from 'react';
import { FloatingStickZone } from './FloatingStickZone';
import { clampFloatingStickRadius } from '../sim/touchControls';
import type { StickVec } from '../sim/floatingStick';
import type { StickInput } from '../sim/types';

interface VirtualTouchSticksProps {
  touchStickRef: React.MutableRefObject<StickInput>;
  invisible?: boolean;
  onTouchStartAudio?: () => void;
}

/**
 * Dual-zone dynamic virtual joysticks layered directly over the 3D flight viewport
 * for direct mobile/touch gameplay (Mode 2: Left = Throttle/Yaw, Right = Pitch/Roll).
 */
export function VirtualTouchSticks({
  touchStickRef,
  invisible = false,
  onTouchStartAudio,
}: VirtualTouchSticksProps) {
  const [radiusPx, setRadiusPx] = useState(() =>
    typeof window !== 'undefined' ? clampFloatingStickRadius(window.innerHeight) : 68
  );

  useEffect(() => {
    const updateRadius = () => {
      setRadiusPx(clampFloatingStickRadius(window.innerHeight));
    };
    window.addEventListener('resize', updateRadius);
    return () => window.removeEventListener('resize', updateRadius);
  }, []);

  // Ensure sticks are strictly neutral whenever this overlay unmounts
  useEffect(() => {
    return () => {
      touchStickRef.current.throttle = 0;
      touchStickRef.current.yaw = 0;
      touchStickRef.current.pitch = 0;
      touchStickRef.current.roll = 0;
    };
  }, [touchStickRef]);

  const handleLeftStick = useCallback(
    (pos: StickVec) => {
      onTouchStartAudio?.();
      touchStickRef.current.throttle = pos.y;
      touchStickRef.current.yaw = pos.x;
    },
    [onTouchStartAudio, touchStickRef]
  );

  const handleRightStick = useCallback(
    (pos: StickVec) => {
      onTouchStartAudio?.();
      touchStickRef.current.pitch = pos.y;
      touchStickRef.current.roll = pos.x;
    },
    [onTouchStartAudio, touchStickRef]
  );

  return (
    <div
      data-testid="virtual-touch-sticks"
      data-touch-invisible={invisible ? 'true' : 'false'}
      className="fixed inset-0 z-10 grid grid-cols-2 select-none pointer-events-auto"
      style={{ touchAction: 'none' }}
    >
      <FloatingStickZone
        side="left"
        variant="overlay"
        invisible={invisible}
        radiusPx={radiusPx}
        label="Stick Esquerdo na Tela (Subir / Girar)"
        subLabel="Subir · Girar"
        onStickSample={handleLeftStick}
      />

      <FloatingStickZone
        side="right"
        variant="overlay"
        invisible={invisible}
        radiusPx={radiusPx}
        label="Stick Direito na Tela (Mover)"
        subLabel="Mover · Lados"
        onStickSample={handleRightStick}
      />
    </div>
  );
}
