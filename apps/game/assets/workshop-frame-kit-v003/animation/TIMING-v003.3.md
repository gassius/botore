# Botore Workshop Frame kit v003.3: clip timing tables

All clips are 30 fps and every frame is baked (`animation/clips.json`). Labels: **key** = approved-style extreme, **breakdown** = authored in-between pose, `inbetween` = eased in-between, `hit_stop` = frozen duplicate after contact. Smear = strike motion-trail art drawn on that frame (`fx/smears`).

## Summary (frames / ms)

| clip | sword | axe | dagger |
|---|---|---|---|
| attack | 41 / 1367 | 56 / 1867 | 33 / 1100 |
| dodge | 17 / 567 | 23 / 767 | 15 / 500 |
| hit_react | 21 / 700 | 19 / 633 | 19 / 633 |
| walk | 24 / 800 | 32 / 1067 | 16 / 533 |
| knockout | 46 / 1533 | 49 / 1633 | 44 / 1467 |

## sword / walk: 24 frames (800 ms) - loop

in-place loop, 8 keys (contact/down/passing/up x 2). Last frame flows into frame 0. Move the bot by speed_px_per_frame (toward the opponent) while it plays so the planted foot does not skate.

Advance the bot 4.3333 px per frame while looping.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:contact_R** | linear | yes |  |
| 1 | 33 | inbetween | linear | yes |  |
| 2 | 67 | inbetween | linear | yes |  |
| 3 | 100 | **key:down_R** | linear | yes |  |
| 4 | 133 | inbetween | linear | yes |  |
| 5 | 167 | inbetween | linear | yes |  |
| 6 | 200 | **key:passing_R** | linear | yes |  |
| 7 | 233 | inbetween | linear | yes |  |
| 8 | 267 | inbetween | linear | yes |  |
| 9 | 300 | **key:up_R** | linear | yes |  |
| 10 | 333 | inbetween | linear | yes |  |
| 11 | 367 | inbetween | linear | yes |  |
| 12 | 400 | **key:contact_L** | linear | yes |  |
| 13 | 433 | inbetween | linear | yes |  |
| 14 | 467 | inbetween | linear | yes |  |
| 15 | 500 | **key:down_L** | linear | yes |  |
| 16 | 533 | inbetween | linear | yes |  |
| 17 | 567 | inbetween | linear | yes |  |
| 18 | 600 | **key:passing_L** | linear | yes |  |
| 19 | 633 | inbetween | linear | yes |  |
| 20 | 667 | inbetween | linear | yes |  |
| 21 | 700 | **key:up_L** | linear | yes |  |
| 22 | 733 | inbetween | linear | yes |  |
| 23 | 767 | inbetween | linear | yes |  |

## sword / attack: 41 frames (1367 ms)

idle -> anticipation -> windup -> strike (contact + hit-stop) -> follow-through -> overshoot -> settle -> idle. Starts and ends on the exact idle pose.

Contact frame 18; hit-stop frames [19, 20, 21].

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-in-out | yes |  |
| 2 | 67 | breakdown:dip | ease-in-out | yes |  |
| 3 | 100 | inbetween | ease-in-out | yes |  |
| 4 | 133 | inbetween | linear | no |  |
| 5 | 167 | inbetween | ease-in-out | no |  |
| 6 | 200 | breakdown:lift | ease-in-out | yes |  |
| 7 | 233 | inbetween | ease-in-out | yes |  |
| 8 | 267 | inbetween | ease-in-out | yes |  |
| 9 | 300 | inbetween | ease-in-out | yes |  |
| 10 | 333 | inbetween | ease-in-out | yes |  |
| 11 | 367 | **key:windup** | ease-in-out | yes |  |
| 12 | 400 | inbetween | ease-in-out | yes |  |
| 13 | 433 | inbetween | ease-in-out | yes |  |
| 14 | 467 | breakdown:coil | ease-in-out | yes |  |
| 15 | 500 | inbetween | linear | no | yes |
| 16 | 533 | breakdown:arc_1 | ease-in | no | yes |
| 17 | 567 | breakdown:arc_2 | linear | no | yes |
| 18 | 600 | **key:strike** | linear | yes | yes |
| 19 | 633 | hit_stop | hit-stop | yes |  |
| 20 | 667 | hit_stop | hit-stop | yes |  |
| 21 | 700 | hit_stop | hit-stop | yes |  |
| 22 | 733 | inbetween | ease-out | yes |  |
| 23 | 767 | inbetween | ease-out | yes |  |
| 24 | 800 | inbetween | ease-out | yes |  |
| 25 | 833 | **key:follow_through** | ease-out | yes |  |
| 26 | 867 | inbetween | ease-in-out | no |  |
| 27 | 900 | inbetween | ease-in-out | no |  |
| 28 | 933 | inbetween | ease-in-out | no |  |
| 29 | 967 | breakdown:settle | ease-in-out | yes |  |
| 30 | 1000 | inbetween | ease-in-out | no |  |
| 31 | 1033 | inbetween | ease-in-out | no |  |
| 32 | 1067 | inbetween | ease-in-out | yes |  |
| 33 | 1100 | **key:recovery** | ease-in-out | yes |  |
| 34 | 1133 | inbetween | ease-in-out | yes |  |
| 35 | 1167 | inbetween | ease-in-out | yes |  |
| 36 | 1200 | breakdown:overshoot | ease-in-out | yes |  |
| 37 | 1233 | inbetween | ease-in-out | yes |  |
| 38 | 1267 | inbetween | linear | yes |  |
| 39 | 1300 | inbetween | ease-in-out | yes |  |
| 40 | 1333 | **key:idle** | ease-in-out | yes |  |

## sword / dodge: 17 frames (567 ms)

idle -> dip -> dodge -> hold -> rise -> idle. Starts and ends on the exact idle pose.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-in-out | yes |  |
| 2 | 67 | breakdown:dip | ease-in-out | yes |  |
| 3 | 100 | inbetween | ease-out | no |  |
| 4 | 133 | inbetween | ease-out | no |  |
| 5 | 167 | **key:dodge** | ease-out | yes |  |
| 6 | 200 | inbetween | ease-in-out | yes |  |
| 7 | 233 | inbetween | ease-in-out | yes |  |
| 8 | 267 | breakdown:dodge_hold | ease-in-out | yes |  |
| 9 | 300 | inbetween | ease-in-out | yes |  |
| 10 | 333 | inbetween | ease-in-out | yes |  |
| 11 | 367 | inbetween | ease-in-out | yes |  |
| 12 | 400 | breakdown:rise | ease-in-out | yes |  |
| 13 | 433 | inbetween | ease-in-out | no |  |
| 14 | 467 | inbetween | ease-in-out | no |  |
| 15 | 500 | inbetween | ease-in-out | no |  |
| 16 | 533 | **key:idle** | ease-in-out | yes |  |

## sword / hit_react: 21 frames (700 ms)

idle -> hit_react (contact) -> hold -> recover -> idle. Starts and ends on the exact idle pose.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | linear | no |  |
| 2 | 67 | inbetween | linear | no |  |
| 3 | 100 | inbetween | linear | no |  |
| 4 | 133 | inbetween | ease-out | no |  |
| 5 | 167 | inbetween | linear | no |  |
| 6 | 200 | **key:hit_react** | ease-out | yes |  |
| 7 | 233 | inbetween | ease-in-out | yes |  |
| 8 | 267 | breakdown:hit_hold | ease-in-out | yes |  |
| 9 | 300 | inbetween | ease-in-out | no |  |
| 10 | 333 | inbetween | linear | no |  |
| 11 | 367 | inbetween | ease-in-out | no |  |
| 12 | 400 | inbetween | linear | no |  |
| 13 | 433 | inbetween | ease-in-out | no |  |
| 14 | 467 | breakdown:recover | ease-in-out | yes |  |
| 15 | 500 | inbetween | ease-in-out | yes |  |
| 16 | 533 | inbetween | ease-in-out | yes |  |
| 17 | 567 | inbetween | linear | yes |  |
| 18 | 600 | inbetween | ease-in-out | yes |  |
| 19 | 633 | inbetween | ease-in-out | yes |  |
| 20 | 667 | **key:idle** | ease-in-out | yes |  |

## sword / knockout: 46 frames (1533 ms)

idle -> impact (contact + hit-stop) -> stagger back -> reel -> knees buckle -> hit the floor -> small bounce -> settle. LAST FRAME == poses.defeat exactly.

Contact frame 5; hit-stop frames [6, 7, 8, 9, 10, 11].

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | linear | yes |  |
| 2 | 67 | inbetween | linear | yes |  |
| 3 | 100 | inbetween | linear | yes |  |
| 4 | 133 | inbetween | ease-out | yes |  |
| 5 | 167 | **key:impact** | ease-out | yes |  |
| 6 | 200 | hit_stop | hit-stop | yes |  |
| 7 | 233 | hit_stop | hit-stop | yes |  |
| 8 | 267 | hit_stop | hit-stop | yes |  |
| 9 | 300 | hit_stop | hit-stop | yes |  |
| 10 | 333 | hit_stop | hit-stop | yes |  |
| 11 | 367 | hit_stop | hit-stop | yes |  |
| 12 | 400 | inbetween | ease-out | no |  |
| 13 | 433 | inbetween | ease-out | no |  |
| 14 | 467 | inbetween | ease-out | no |  |
| 15 | 500 | inbetween | ease-out | no |  |
| 16 | 533 | **key:stagger** | ease-out | yes |  |
| 17 | 567 | inbetween | ease-in-out | yes |  |
| 18 | 600 | inbetween | ease-in-out | yes |  |
| 19 | 633 | inbetween | ease-in-out | yes |  |
| 20 | 667 | breakdown:reel | ease-in-out | yes |  |
| 21 | 700 | inbetween | ease-in-out | yes |  |
| 22 | 733 | inbetween | ease-in-out | yes |  |
| 23 | 767 | inbetween | ease-in-out | yes |  |
| 24 | 800 | **key:buckle** | ease-in-out | yes |  |
| 25 | 833 | inbetween | ease-in-out | yes |  |
| 26 | 867 | inbetween | linear | yes |  |
| 27 | 900 | inbetween | ease-in-out | yes |  |
| 28 | 933 | breakdown:fall_wp | ease-in-out | yes |  |
| 29 | 967 | inbetween | ease-in-out | yes |  |
| 30 | 1000 | inbetween | linear | yes |  |
| 31 | 1033 | inbetween | ease-in-out | yes |  |
| 32 | 1067 | breakdown:floor | ease-in-out | yes |  |
| 33 | 1100 | inbetween | ease-out | yes |  |
| 34 | 1133 | inbetween | ease-out | yes |  |
| 35 | 1167 | inbetween | ease-out | yes |  |
| 36 | 1200 | inbetween | ease-in-out | yes |  |
| 37 | 1233 | inbetween | ease-in-out | yes |  |
| 38 | 1267 | inbetween | ease-in-out | yes |  |
| 39 | 1300 | inbetween | ease-in-out | yes |  |
| 40 | 1333 | inbetween | ease-in-out | yes |  |
| 41 | 1367 | inbetween | ease-in-out | yes |  |
| 42 | 1400 | inbetween | ease-in-out | yes |  |
| 43 | 1433 | inbetween | ease-in-out | yes |  |
| 44 | 1467 | inbetween | ease-in-out | yes |  |
| 45 | 1500 | **key:defeat** | ease-in-out | yes |  |

## axe / walk: 32 frames (1067 ms) - loop

in-place loop, 8 keys (contact/down/passing/up x 2). Last frame flows into frame 0. Move the bot by speed_px_per_frame (toward the opponent) while it plays so the planted foot does not skate.

Advance the bot 2.75 px per frame while looping.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:contact_R** | linear | yes |  |
| 1 | 33 | inbetween | linear | yes |  |
| 2 | 67 | inbetween | linear | yes |  |
| 3 | 100 | inbetween | linear | yes |  |
| 4 | 133 | **key:down_R** | linear | yes |  |
| 5 | 167 | inbetween | linear | yes |  |
| 6 | 200 | inbetween | linear | yes |  |
| 7 | 233 | inbetween | linear | yes |  |
| 8 | 267 | **key:passing_R** | linear | yes |  |
| 9 | 300 | inbetween | linear | yes |  |
| 10 | 333 | inbetween | linear | yes |  |
| 11 | 367 | inbetween | linear | yes |  |
| 12 | 400 | **key:up_R** | linear | yes |  |
| 13 | 433 | inbetween | linear | yes |  |
| 14 | 467 | inbetween | linear | yes |  |
| 15 | 500 | inbetween | linear | yes |  |
| 16 | 533 | **key:contact_L** | linear | yes |  |
| 17 | 567 | inbetween | linear | yes |  |
| 18 | 600 | inbetween | linear | yes |  |
| 19 | 633 | inbetween | linear | yes |  |
| 20 | 667 | **key:down_L** | linear | yes |  |
| 21 | 700 | inbetween | linear | yes |  |
| 22 | 733 | inbetween | linear | yes |  |
| 23 | 767 | inbetween | linear | yes |  |
| 24 | 800 | **key:passing_L** | linear | yes |  |
| 25 | 833 | inbetween | linear | yes |  |
| 26 | 867 | inbetween | linear | yes |  |
| 27 | 900 | inbetween | linear | yes |  |
| 28 | 933 | **key:up_L** | linear | yes |  |
| 29 | 967 | inbetween | linear | yes |  |
| 30 | 1000 | inbetween | linear | yes |  |
| 31 | 1033 | inbetween | linear | yes |  |

## axe / attack: 56 frames (1867 ms)

idle -> anticipation -> windup -> strike (contact + hit-stop) -> follow-through -> overshoot -> settle -> idle. Starts and ends on the exact idle pose.

Contact frame 28; hit-stop frames [29, 30, 31, 32, 33].

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-in-out | yes |  |
| 2 | 67 | inbetween | ease-in-out | yes |  |
| 3 | 100 | breakdown:dip | ease-in-out | yes |  |
| 4 | 133 | inbetween | ease-in-out | yes |  |
| 5 | 167 | inbetween | linear | yes |  |
| 6 | 200 | inbetween | ease-in-out | yes |  |
| 7 | 233 | breakdown:drop | ease-in-out | yes |  |
| 8 | 267 | inbetween | linear | yes |  |
| 9 | 300 | inbetween | ease-in-out | yes |  |
| 10 | 333 | inbetween | linear | yes |  |
| 11 | 367 | breakdown:pendulum | ease-in-out | yes |  |
| 12 | 400 | inbetween | ease-in-out | yes |  |
| 13 | 433 | breakdown:low | ease-in-out | yes |  |
| 14 | 467 | inbetween | ease-in-out | yes |  |
| 15 | 500 | breakdown:sweep_back | ease-in-out | yes |  |
| 16 | 533 | inbetween | ease-in-out | yes |  |
| 17 | 567 | breakdown:back | ease-in-out | yes |  |
| 18 | 600 | inbetween | ease-in-out | yes | yes |
| 19 | 633 | breakdown:rise | ease-in-out | yes | yes |
| 20 | 667 | inbetween | ease-out | yes |  |
| 21 | 700 | **key:windup** | ease-out | yes |  |
| 22 | 733 | inbetween | ease-in-out | yes |  |
| 23 | 767 | inbetween | ease-in-out | yes |  |
| 24 | 800 | inbetween | ease-in-out | yes |  |
| 25 | 833 | breakdown:coil | ease-in-out | yes |  |
| 26 | 867 | breakdown:whip | linear | no | yes |
| 27 | 900 | inbetween | linear | no | yes |
| 28 | 933 | **key:strike** | linear | yes | yes |
| 29 | 967 | hit_stop | hit-stop | yes |  |
| 30 | 1000 | hit_stop | hit-stop | yes |  |
| 31 | 1033 | hit_stop | hit-stop | yes |  |
| 32 | 1067 | hit_stop | hit-stop | yes |  |
| 33 | 1100 | hit_stop | hit-stop | yes |  |
| 34 | 1133 | inbetween | ease-out | yes |  |
| 35 | 1167 | inbetween | ease-out | yes |  |
| 36 | 1200 | inbetween | ease-out | yes |  |
| 37 | 1233 | inbetween | ease-out | yes |  |
| 38 | 1267 | **key:follow_through** | ease-out | yes |  |
| 39 | 1300 | inbetween | ease-in-out | no |  |
| 40 | 1333 | inbetween | ease-in-out | no |  |
| 41 | 1367 | inbetween | ease-in-out | no |  |
| 42 | 1400 | breakdown:settle | ease-in-out | yes |  |
| 43 | 1433 | inbetween | ease-in-out | no |  |
| 44 | 1467 | inbetween | ease-in-out | no |  |
| 45 | 1500 | inbetween | ease-in-out | yes |  |
| 46 | 1533 | **key:recovery** | ease-in-out | yes |  |
| 47 | 1567 | inbetween | ease-in-out | yes |  |
| 48 | 1600 | inbetween | ease-in-out | yes |  |
| 49 | 1633 | inbetween | ease-in-out | yes |  |
| 50 | 1667 | breakdown:overshoot | ease-in-out | yes |  |
| 51 | 1700 | inbetween | ease-in-out | yes |  |
| 52 | 1733 | inbetween | linear | yes |  |
| 53 | 1767 | inbetween | ease-in-out | yes |  |
| 54 | 1800 | inbetween | ease-in-out | yes |  |
| 55 | 1833 | **key:idle** | ease-in-out | yes |  |

## axe / dodge: 23 frames (767 ms)

idle -> dip -> dodge -> hold -> rise -> idle. Starts and ends on the exact idle pose.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-in-out | yes |  |
| 2 | 67 | inbetween | ease-in-out | yes |  |
| 3 | 100 | breakdown:dip | ease-in-out | yes |  |
| 4 | 133 | inbetween | ease-in-out | no |  |
| 5 | 167 | inbetween | ease-in-out | no |  |
| 6 | 200 | inbetween | ease-in-out | no |  |
| 7 | 233 | inbetween | ease-out | no |  |
| 8 | 267 | inbetween | linear | no |  |
| 9 | 300 | **key:dodge** | ease-out | yes |  |
| 10 | 333 | inbetween | ease-in-out | yes |  |
| 11 | 367 | inbetween | ease-in-out | yes |  |
| 12 | 400 | breakdown:dodge_hold | ease-in-out | yes |  |
| 13 | 433 | inbetween | ease-in-out | yes |  |
| 14 | 467 | inbetween | ease-in-out | yes |  |
| 15 | 500 | inbetween | ease-in-out | yes |  |
| 16 | 533 | inbetween | ease-in-out | yes |  |
| 17 | 567 | breakdown:rise | ease-in-out | yes |  |
| 18 | 600 | inbetween | ease-in-out | no |  |
| 19 | 633 | inbetween | ease-in-out | no |  |
| 20 | 667 | inbetween | ease-in-out | no |  |
| 21 | 700 | inbetween | ease-in-out | no |  |
| 22 | 733 | **key:idle** | ease-in-out | yes |  |

## axe / hit_react: 19 frames (633 ms)

idle -> hit_react (contact) -> hold -> recover -> idle. Starts and ends on the exact idle pose.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-out | no |  |
| 2 | 67 | inbetween | ease-out | no |  |
| 3 | 100 | **key:hit_react** | ease-out | yes |  |
| 4 | 133 | inbetween | ease-in-out | yes |  |
| 5 | 167 | breakdown:hit_hold | ease-in-out | yes |  |
| 6 | 200 | inbetween | ease-in-out | no |  |
| 7 | 233 | inbetween | ease-in-out | no |  |
| 8 | 267 | inbetween | ease-in-out | no |  |
| 9 | 300 | inbetween | ease-in-out | no |  |
| 10 | 333 | breakdown:recover | ease-in-out | yes |  |
| 11 | 367 | inbetween | ease-in-out | yes |  |
| 12 | 400 | inbetween | ease-in-out | yes |  |
| 13 | 433 | inbetween | ease-in-out | yes |  |
| 14 | 467 | inbetween | ease-in-out | yes |  |
| 15 | 500 | inbetween | ease-in-out | yes |  |
| 16 | 533 | inbetween | ease-in-out | yes |  |
| 17 | 567 | inbetween | ease-in-out | yes |  |
| 18 | 600 | **key:idle** | ease-in-out | yes |  |

## axe / knockout: 49 frames (1633 ms)

idle -> impact (contact + hit-stop) -> stagger back -> reel -> knees buckle -> hit the floor -> small bounce -> settle. LAST FRAME == poses.defeat exactly.

Contact frame 4; hit-stop frames [5, 6, 7, 8, 9, 10, 11, 12].

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-in-out | yes |  |
| 2 | 67 | inbetween | ease-in-out | yes |  |
| 3 | 100 | inbetween | ease-in-out | yes |  |
| 4 | 133 | **key:impact** | ease-out | yes |  |
| 5 | 167 | hit_stop | hit-stop | yes |  |
| 6 | 200 | hit_stop | hit-stop | yes |  |
| 7 | 233 | hit_stop | hit-stop | yes |  |
| 8 | 267 | hit_stop | hit-stop | yes |  |
| 9 | 300 | hit_stop | hit-stop | yes |  |
| 10 | 333 | hit_stop | hit-stop | yes |  |
| 11 | 367 | hit_stop | hit-stop | yes |  |
| 12 | 400 | hit_stop | hit-stop | yes |  |
| 13 | 433 | inbetween | ease-out | no |  |
| 14 | 467 | inbetween | ease-out | no |  |
| 15 | 500 | inbetween | ease-out | no |  |
| 16 | 533 | inbetween | ease-out | no |  |
| 17 | 567 | inbetween | ease-out | no |  |
| 18 | 600 | **key:stagger** | ease-out | yes |  |
| 19 | 633 | inbetween | ease-in-out | yes |  |
| 20 | 667 | inbetween | ease-in-out | yes |  |
| 21 | 700 | inbetween | ease-in-out | yes |  |
| 22 | 733 | inbetween | ease-in-out | yes |  |
| 23 | 767 | breakdown:reel | ease-in-out | yes |  |
| 24 | 800 | inbetween | ease-in-out | yes |  |
| 25 | 833 | inbetween | ease-in-out | yes |  |
| 26 | 867 | inbetween | ease-in-out | yes |  |
| 27 | 900 | **key:buckle** | ease-in-out | yes |  |
| 28 | 933 | inbetween | ease-in-out | yes |  |
| 29 | 967 | inbetween | linear | yes |  |
| 30 | 1000 | inbetween | ease-in-out | yes |  |
| 31 | 1033 | breakdown:fall_wp | ease-in-out | yes |  |
| 32 | 1067 | inbetween | ease-in-out | yes |  |
| 33 | 1100 | inbetween | linear | yes |  |
| 34 | 1133 | inbetween | ease-in-out | yes |  |
| 35 | 1167 | breakdown:floor | ease-in-out | yes |  |
| 36 | 1200 | inbetween | ease-out | yes |  |
| 37 | 1233 | inbetween | ease-out | yes |  |
| 38 | 1267 | inbetween | ease-out | yes |  |
| 39 | 1300 | inbetween | ease-in-out | yes |  |
| 40 | 1333 | inbetween | ease-in-out | yes |  |
| 41 | 1367 | inbetween | ease-in-out | yes |  |
| 42 | 1400 | inbetween | ease-in-out | yes |  |
| 43 | 1433 | inbetween | ease-in-out | yes |  |
| 44 | 1467 | inbetween | ease-in-out | yes |  |
| 45 | 1500 | inbetween | ease-in-out | yes |  |
| 46 | 1533 | inbetween | ease-in-out | yes |  |
| 47 | 1567 | inbetween | ease-in-out | yes |  |
| 48 | 1600 | **key:defeat** | ease-in-out | yes |  |

## dagger / walk: 16 frames (533 ms) - loop

in-place loop, 8 keys (contact/down/passing/up x 2). Last frame flows into frame 0. Move the bot by speed_px_per_frame (toward the opponent) while it plays so the planted foot does not skate.

Advance the bot 6.5 px per frame while looping.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:contact_R** | linear | yes |  |
| 1 | 33 | inbetween | linear | yes |  |
| 2 | 67 | **key:down_R** | linear | yes |  |
| 3 | 100 | inbetween | linear | yes |  |
| 4 | 133 | **key:passing_R** | linear | yes |  |
| 5 | 167 | inbetween | linear | yes |  |
| 6 | 200 | **key:up_R** | linear | yes |  |
| 7 | 233 | inbetween | linear | yes |  |
| 8 | 267 | **key:contact_L** | linear | yes |  |
| 9 | 300 | inbetween | linear | yes |  |
| 10 | 333 | **key:down_L** | linear | yes |  |
| 11 | 367 | inbetween | linear | yes |  |
| 12 | 400 | **key:passing_L** | linear | yes |  |
| 13 | 433 | inbetween | linear | yes |  |
| 14 | 467 | **key:up_L** | linear | yes |  |
| 15 | 500 | inbetween | linear | yes |  |

## dagger / attack: 33 frames (1100 ms)

idle -> anticipation -> windup -> strike (contact + hit-stop) -> follow-through -> overshoot -> settle -> idle. Starts and ends on the exact idle pose.

Contact frame 15; hit-stop frames [16, 17].

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-in-out | yes |  |
| 2 | 67 | breakdown:dip | ease-in-out | yes |  |
| 3 | 100 | inbetween | ease-in-out | no |  |
| 4 | 133 | inbetween | linear | no |  |
| 5 | 167 | inbetween | ease-in-out | no |  |
| 6 | 200 | **key:windup** | ease-in-out | yes |  |
| 7 | 233 | breakdown:coil | ease-in-out | yes |  |
| 8 | 267 | inbetween | linear | no | yes |
| 9 | 300 | breakdown:extend | ease-in | no | yes |
| 10 | 333 | inbetween | linear | no | yes |
| 11 | 367 | breakdown:thrust | linear | no | yes |
| 12 | 400 | inbetween | linear | no | yes |
| 13 | 433 | inbetween | linear | no | yes |
| 14 | 467 | inbetween | linear | no | yes |
| 15 | 500 | **key:strike** | linear | yes | yes |
| 16 | 533 | hit_stop | hit-stop | yes |  |
| 17 | 567 | hit_stop | hit-stop | yes |  |
| 18 | 600 | inbetween | ease-out | yes |  |
| 19 | 633 | inbetween | ease-out | yes |  |
| 20 | 667 | **key:follow_through** | ease-out | yes |  |
| 21 | 700 | inbetween | ease-in-out | no |  |
| 22 | 733 | inbetween | linear | no |  |
| 23 | 767 | breakdown:settle | ease-in-out | yes |  |
| 24 | 800 | inbetween | linear | no |  |
| 25 | 833 | inbetween | ease-in-out | no |  |
| 26 | 867 | **key:recovery** | ease-in-out | yes |  |
| 27 | 900 | inbetween | ease-in-out | yes |  |
| 28 | 933 | breakdown:overshoot | ease-in-out | yes |  |
| 29 | 967 | inbetween | linear | yes |  |
| 30 | 1000 | inbetween | ease-in-out | yes |  |
| 31 | 1033 | inbetween | linear | yes |  |
| 32 | 1067 | **key:idle** | ease-in-out | yes |  |

## dagger / dodge: 15 frames (500 ms)

idle -> dip -> dodge -> hold -> rise -> idle. Starts and ends on the exact idle pose.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | ease-in-out | yes |  |
| 2 | 67 | breakdown:dip | ease-in-out | yes |  |
| 3 | 100 | inbetween | linear | no |  |
| 4 | 133 | inbetween | ease-out | no |  |
| 5 | 167 | **key:dodge** | ease-out | yes |  |
| 6 | 200 | inbetween | ease-in-out | yes |  |
| 7 | 233 | breakdown:dodge_hold | ease-in-out | yes |  |
| 8 | 267 | inbetween | ease-in-out | yes |  |
| 9 | 300 | inbetween | ease-in-out | yes |  |
| 10 | 333 | breakdown:rise | ease-in-out | yes |  |
| 11 | 367 | inbetween | ease-in-out | no |  |
| 12 | 400 | inbetween | ease-in-out | no |  |
| 13 | 433 | inbetween | ease-in-out | no |  |
| 14 | 467 | **key:idle** | ease-in-out | yes |  |

## dagger / hit_react: 19 frames (633 ms)

idle -> hit_react (contact) -> hold -> recover -> idle. Starts and ends on the exact idle pose.

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | linear | no |  |
| 2 | 67 | inbetween | linear | no |  |
| 3 | 100 | inbetween | linear | no |  |
| 4 | 133 | inbetween | ease-out | no |  |
| 5 | 167 | inbetween | linear | no |  |
| 6 | 200 | **key:hit_react** | ease-out | yes |  |
| 7 | 233 | breakdown:hit_hold | ease-in-out | yes |  |
| 8 | 267 | inbetween | ease-in-out | no |  |
| 9 | 300 | inbetween | linear | no |  |
| 10 | 333 | inbetween | ease-in-out | no |  |
| 11 | 367 | inbetween | linear | no |  |
| 12 | 400 | inbetween | ease-in-out | no |  |
| 13 | 433 | breakdown:recover | ease-in-out | yes |  |
| 14 | 467 | inbetween | ease-in-out | yes |  |
| 15 | 500 | inbetween | linear | yes |  |
| 16 | 533 | inbetween | ease-in-out | yes |  |
| 17 | 567 | inbetween | ease-in-out | yes |  |
| 18 | 600 | **key:idle** | ease-in-out | yes |  |

## dagger / knockout: 44 frames (1467 ms)

idle -> impact (contact + hit-stop) -> stagger back -> reel -> knees buckle -> hit the floor -> small bounce -> settle. LAST FRAME == poses.defeat exactly.

Contact frame 4; hit-stop frames [5, 6, 7, 8, 9, 10].

| frame | ms | label | ease in | grounded | smear |
|---|---|---|---|---|---|
| 0 | 0 | **key:idle** | None | yes |  |
| 1 | 33 | inbetween | linear | no |  |
| 2 | 67 | inbetween | ease-out | no |  |
| 3 | 100 | inbetween | linear | no |  |
| 4 | 133 | **key:impact** | ease-out | yes |  |
| 5 | 167 | hit_stop | hit-stop | yes |  |
| 6 | 200 | hit_stop | hit-stop | yes |  |
| 7 | 233 | hit_stop | hit-stop | yes |  |
| 8 | 267 | hit_stop | hit-stop | yes |  |
| 9 | 300 | hit_stop | hit-stop | yes |  |
| 10 | 333 | hit_stop | hit-stop | yes |  |
| 11 | 367 | inbetween | ease-out | no |  |
| 12 | 400 | inbetween | ease-out | no |  |
| 13 | 433 | inbetween | ease-out | no |  |
| 14 | 467 | **key:stagger** | ease-out | yes |  |
| 15 | 500 | inbetween | ease-in-out | yes |  |
| 16 | 533 | inbetween | ease-in-out | yes |  |
| 17 | 567 | inbetween | ease-in-out | yes |  |
| 18 | 600 | breakdown:reel | ease-in-out | yes |  |
| 19 | 633 | inbetween | ease-in-out | yes |  |
| 20 | 667 | inbetween | ease-in-out | yes |  |
| 21 | 700 | inbetween | ease-in-out | yes |  |
| 22 | 733 | **key:buckle** | ease-in-out | yes |  |
| 23 | 767 | inbetween | ease-in-out | yes |  |
| 24 | 800 | inbetween | linear | yes |  |
| 25 | 833 | inbetween | ease-in-out | yes |  |
| 26 | 867 | breakdown:fall_wp | ease-in-out | yes |  |
| 27 | 900 | inbetween | ease-in-out | yes |  |
| 28 | 933 | inbetween | linear | yes |  |
| 29 | 967 | inbetween | ease-in-out | yes |  |
| 30 | 1000 | breakdown:floor | ease-in-out | yes |  |
| 31 | 1033 | inbetween | ease-out | yes |  |
| 32 | 1067 | inbetween | ease-out | yes |  |
| 33 | 1100 | inbetween | ease-out | yes |  |
| 34 | 1133 | inbetween | ease-in-out | yes |  |
| 35 | 1167 | inbetween | ease-in-out | yes |  |
| 36 | 1200 | inbetween | ease-in-out | yes |  |
| 37 | 1233 | inbetween | ease-in-out | yes |  |
| 38 | 1267 | inbetween | ease-in-out | yes |  |
| 39 | 1300 | inbetween | ease-in-out | yes |  |
| 40 | 1333 | inbetween | ease-in-out | yes |  |
| 41 | 1367 | inbetween | ease-in-out | yes |  |
| 42 | 1400 | inbetween | ease-in-out | yes |  |
| 43 | 1433 | **key:defeat** | ease-in-out | yes |  |


## Angular-velocity exceptions

Per-part rotation is ≤ 45°/frame (angle-unwrapped) except the named frames in `validation/av-exceptions.json` and any frame whose smear raster overlaps an arm part. The axe attack coil→whip flip is a one-frame flip hidden under the whip smear.
