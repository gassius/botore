# Combat v1 — deterministic rules

Rules version: `combat-v1` (frozen). Any change to these formulas requires a
new `rulesVersion` string, new golden fixtures, and an ADR. All arithmetic is
integer-only; all randomness flows through the injected `Rng`
(`sha256-counter-v1`).

## Inputs

Two immutable fighter snapshots: `hp, strength, agility, speed,
weaponKind, weaponPower`. One 32-byte seed (server CSPRNG). The seed hashes
into PRNG key material (`seedToKeyMaterial`), and every draw order is fixed by
the engine code — the sequence below IS the specification.

## Turn loop

1. **Initiative phase** — each round both actors draw:
   `initiative = speed + rng.nextIntInRange(0, 3)`.
   Higher acts first this round. Exact tie → nominal attacker first.
2. Each actor takes one turn in initiative order until one is defeated or
   `MAX_ACTIONS = 100` total turns are consumed.

## Attack resolution (per turn)

3. **Attack selection**: `usesWeapon = rng.nextInt(100) < 40`.
4. **Hit/dodge**:
   `hitChance% = clamp(75 − (defenderAgility − attackerAgility) × 4, 25, 95)`.
   Roll `rng.nextInt(100)`; roll ≥ chance → dodged (turn ends).
5. **Damage**:
   - weapon value: `weaponPower` if using weapon, else `trunc(weaponPower / 2)`
     (basic attack);
   - variance: `v = rng.nextIntInRange(0, 4)`;
   - glancing flag: `g = rng.nextIntInRange(0, 4) == 0`;
   - raw damage `= strength + weaponValue + v`;
   - applied damage `= g ? trunc(raw / 2) : raw`.
6. HP updates to `max(0, hp − damage)` — never negative.
7. HP reaching 0 emits `character_defeated` and ends the battle.

## Action limit

At 100 turns without defeat: compare remaining HP percentage
`(hp × 100 / maxHp)`. Higher wins via tiebreak; exact equality is a draw
(`winner = null`, reason `action_limit_tiebreak`).

## Event stream

Ordered semantic events with monotonic `seq` starting at 0:
`battle_started → [turn_started → attack_selected → (dodged | damage_applied)]×
→ character_defeated? → battle_ended`.

No wall-clock timestamps anywhere in combat output.

## Draw-order contract

The engine consumes PRNG draws in exactly this order per event:
initiative A, initiative B, then per acting actor: attack selection, hit roll,
(variance, glancing) on hit. Changing draw order changes checksums — treat it
as part of the rules.
