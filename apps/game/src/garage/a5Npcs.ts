/**
 * A5 NPC roster (client-side). Seed DB still uses Rivet/Brace DEV names —
 * A5 roster rename is a follow-up. Opponents UI maps display names → A6 panels
 * via resolveOpponentNpcId; this module ships the authoritative a5fix list.
 */
import npcsJson from '../../assets/a5fix/npcs.json';

export type A5NpcDef = {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly paint: string;
  readonly weapon: string;
  readonly head?: string;
  readonly off_hand?: string | null;
};

type A5NpcsFile = {
  readonly schema: string;
  readonly npcs: readonly A5NpcDef[];
};

const DATA = npcsJson as A5NpcsFile;

export const A5_NPCS: readonly A5NpcDef[] = DATA.npcs;

export function a5NpcById(id: string): A5NpcDef | null {
  return A5_NPCS.find((n) => n.id === id) ?? null;
}

/** Cobalt Brute = visor + mace (A5). */
export const COBALT_BRUTE = a5NpcById('cobalt-brute');
