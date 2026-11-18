/**
 * Android P1: nameplate TextInput must not rewrite controlled value mid-type
 * (textTransform / case transforms → IME character repeats after a few chars).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOT_DISPLAY_NAME_MAX_LEN,
  BOT_NAME_INPUT_IME_PROPS,
  clampBotNameDraft,
} from '../src/garage/customise/botNameInput';

describe('bot name TextInput Android controlled-input contract', () => {
  it('clampBotNameDraft preserves case and exact sequential appends', () => {
    let draft = '';
    for (const ch of ['a', 'B', 'c', 'D', 'e']) {
      draft = clampBotNameDraft(draft + ch);
    }
    expect(draft).toBe('aBcDe');
    expect(clampBotNameDraft('MiXeD_Case!!')).toBe('MiXeD_Case!!'.slice(0, BOT_DISPLAY_NAME_MAX_LEN));
    expect(clampBotNameDraft('x'.repeat(20))).toHaveLength(BOT_DISPLAY_NAME_MAX_LEN);
  });

  it('IME props disable Android suggestion-strip conflict with controlled value', () => {
    expect(BOT_NAME_INPUT_IME_PROPS.autoCorrect).toBe(false);
    expect(BOT_NAME_INPUT_IME_PROPS.spellCheck).toBe(false);
    expect(BOT_NAME_INPUT_IME_PROPS.autoComplete).toBe('off');
    expect(BOT_NAME_INPUT_IME_PROPS.autoCapitalize).toBe('none');
  });

  it('CustomiseScreen name TextInput does not apply textTransform or case rewrite', () => {
    const source = readFileSync(
      join(__dirname, '../src/garage/screens/CustomiseScreen.tsx'),
      'utf8',
    );

    // Controlled value must use clamp helper (length only), not toUpperCase/slice+transform.
    expect(source).toContain('clampBotNameDraft');
    expect(source).toContain('BOT_NAME_INPUT_IME_PROPS');
    expect(source).toContain('customise-nameplate-input');

    // textTransform on TextInput fights Android IME composing spans → char repeats.
    const nameInputBlock = source.match(/nameInput:\s*\{[\s\S]*?\n  \},/);
    expect(nameInputBlock?.[0]).toBeTruthy();
    expect(nameInputBlock?.[0]).not.toMatch(/textTransform/);

    // onChangeText must not uppercase/lowercase the draft.
    expect(source).not.toMatch(/onChangeText=\{[^}]*toUpperCase/);
    expect(source).not.toMatch(/onChangeText=\{[^}]*toLowerCase/);
    expect(source).not.toMatch(/setPendingName\([^)]*toUpperCase/);
  });
});
