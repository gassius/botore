import { useCallback, useState } from 'react';

export type MuteControls = {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
};

/** Shell-level mute setting for replay/audio integration (F10 consumes). */
export function useMute(initial = false): MuteControls {
  const [muted, setMuted] = useState(initial);
  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);
  return { muted, setMuted, toggleMute };
}
