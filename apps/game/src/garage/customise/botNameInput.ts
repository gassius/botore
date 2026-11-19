/**
 * Bot nameplate draft helpers for Customise TextInput.
 *
 * Android controlled TextInputs duplicate characters when the controlled `value`
 * is rewritten mid-composition (e.g. textTransform / toUpperCase in onChangeText).
 * Keep drafts case-preserving; Nameplate CSS uppercases for display.
 */

export const BOT_DISPLAY_NAME_MAX_LEN = 12;

/** IME props that avoid Android suggestion-strip fights with controlled value. */
export const BOT_NAME_INPUT_IME_PROPS = {
  autoCorrect: false,
  autoComplete: 'off' as const,
  spellCheck: false,
  autoCapitalize: 'none' as const,
};

/**
 * Clamp a bot-name draft for controlled TextInput.
 * Must not case-transform — Android IME repeats chars when value is rewritten.
 */
export function clampBotNameDraft(text: string): string {
  return text.slice(0, BOT_DISPLAY_NAME_MAX_LEN);
}
