# F7 / v001 → v002 exact integration delta

Provisional media adaptation, not final acceptance. Load this manifest/parts atomically; no mixing version coordinates. Existing BotAssembler props and F6/F7 exact code types are unchanged. No renderer or repository code was modified.

## Unchanged
Schema `botore.workshop-frame.provisional.v1`; canvas 640×640; torso root position [310,276]; asset/slot IDs, parents, default angles, z-order, motion windows, paint IDs `oxide`/`petrol`, weapon IDs `sword`/`axe`/`dagger`; whole-hierarchy mirroring; 180° weapon mount relative to hand. Family changes `workshop-frame-v001` → `workshop-frame-v002`; kit version `v001` → `v002`.

## Exact local coordinates / dimensions
Coordinates are local pixels; all omitted fields are unchanged. Floats below are exact serialized manifest values, not rounded guesses.

### torso
- `width`: `220` → `228`
- `height`: `180` → `196`
- `pivot`: `[110, 130]` → `[118, 146]`
- `sockets`: `{"neck": [110, 35], "shoulder_l": [40, 55], "shoulder_r": [172, 65], "waist": [110, 150]}` → `{"neck": [118.0, 51.39999999999999], "shoulder_l": [31.200000000000003, 65.0], "shoulder_r": [194.88, 75.8], "waist": [118.0, 167.6]}`

### head
- `pivot`: `[99, 143]` → `[99, 154]`

### pelvis
- `sockets`: `{"hip_l": [42, 48], "hip_r": [115, 48]}` → `{"hip_l": [37.44, 48], "hip_r": [119.2, 48]}`

### upper_arm_l
- `sockets`: `{"elbow": [80, 126]}` → `{"elbow": [80.0, 100.48]}`

### forearm_l
- `sockets`: `{"wrist": [80, 110]}` → `{"wrist": [80.0, 98.0]}`

### hand_l
- `sockets`: `{"grip": [60, 55]}` → `{"grip": [60.0, 61.6]}`

### thigh_l
- `sockets`: `{"knee": [60, 112]}` → `{"knee": [60.0, 92.32]}`

### shin_l
- `sockets`: `{"ankle": [60, 125]}` → `{"ankle": [60.0, 104.10000000000001]}`

### foot_l
- `width`: `130` → `150`

### upper_arm_r
- `sockets`: `{"elbow": [80, 126]}` → `{"elbow": [80.0, 100.48]}`

### forearm_r
- `sockets`: `{"wrist": [80, 110]}` → `{"wrist": [80.0, 98.0]}`

### hand_r
- `sockets`: `{"grip": [60, 55]}` → `{"grip": [60.0, 61.6]}`

### thigh_r
- `sockets`: `{"knee": [60, 112]}` → `{"knee": [60.0, 92.32]}`

### shin_r
- `sockets`: `{"ankle": [60, 125]}` → `{"ankle": [60.0, 104.10000000000001]}`

### foot_r
- `width`: `130` → `150`

### weapon_sword
- `height`: `200` → `208`
- `pivot`: `[60, 155]` → `[60, 163]`
- `sockets`: `{"grip": [60, 155]}` → `{"grip": [60.0, 163.0]}`

### weapon_axe
- `height`: `200` → `208`
- `pivot`: `[60, 155]` → `[60, 163]`
- `sockets`: `{"grip": [60, 155]}` → `{"grip": [60, 163]}`

### weapon_dagger
- `height`: `200` → `208`
- `pivot`: `[60, 155]` → `[60, 163]`
- `sockets`: `{"grip": [60, 155]}` → `{"grip": [60, 163]}`

## Pose delta
Only illustrative `heavy_windup.root_y`: 20 → 45 pixels, to keep the broader blade inside the source canvas. Other pose deltas unchanged; none are approved combat timing/ground-contact animations.

## Notes
- Torso gets left/top transparent padding 8/16 pixels. Pivot/socket offsets compensate, preserving reviewed global geometry.
- All three weapon tiles get 8 transparent pixels at top. Common local weapon grip/pivot [60,155] → [60,163]; mount to new hand grip [60,61.6], keeping the 180° grip rotation.
- Foot width 130 → 150 is transparent export padding; pivot unchanged.
- Other socket deltas reflect approved-for-provisional-propagation compact geometry. Recalculate hierarchy from manifest rather than hardcoding lengths.
- Bounds for every asset in both versions are included in the machine-readable delta.
- Likeness, animation quality, actual replay integration and native performance remain unaccepted/unmeasured.
