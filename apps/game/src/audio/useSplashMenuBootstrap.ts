/**
 * Splash sting → menuLoop once the in-app title is on screen.
 * Idempotent for the life of the shared session.
 */
import { useEffect, useRef } from 'react';
import { useSharedTrialAudio } from './trialAudioContext';

export function useSplashMenuBootstrap(active: boolean): void {
  const audio = useSharedTrialAudio();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || !audio || startedRef.current) return;
    startedRef.current = true;
    audio.playSplashSting();
    audio.startMenuLoop();
  }, [active, audio]);
}
