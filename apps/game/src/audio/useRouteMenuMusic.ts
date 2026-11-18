/**
 * Keeps menuLoop on non-fight routes; crossfades into fight music on Replay
 * and back to menu when the Result overlay appears.
 */
import { useEffect, useRef } from 'react';
import type { FirstRunRoute } from '../first-run/routes';
import { useSharedTrialAudio } from './trialAudioContext';

const MENU_CROSSFADE_MS = 600;

export function useRouteMenuMusic(opts: {
  route: FirstRunRoute;
  showResultOverlay: boolean;
}): void {
  const audio = useSharedTrialAudio();
  const faceOffPlayedRef = useRef(false);
  const lastFightCrossfadeRef = useRef(false);

  useEffect(() => {
    if (!audio) return;

    if (opts.route === 'ConfirmFight') {
      audio.startMenuLoop();
      if (!faceOffPlayedRef.current) {
        faceOffPlayedRef.current = true;
        audio.playFaceOffSting();
      }
      lastFightCrossfadeRef.current = false;
      return;
    }

    faceOffPlayedRef.current = false;

    if (opts.route === 'Replay') {
      if (opts.showResultOverlay) {
        audio.crossfadeToMenu({ durationMs: MENU_CROSSFADE_MS });
        lastFightCrossfadeRef.current = false;
      } else if (!lastFightCrossfadeRef.current) {
        audio.crossfadeToFight({ durationMs: MENU_CROSSFADE_MS });
        lastFightCrossfadeRef.current = true;
      }
      return;
    }

    lastFightCrossfadeRef.current = false;
    audio.startMenuLoop();
  }, [audio, opts.route, opts.showResultOverlay]);
}
