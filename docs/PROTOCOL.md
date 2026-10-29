# 2-Stripe panel protocol

This was worked out from a packet capture of a TriCaster TC2 driving a 2-Stripe panel (panel firmware reports `~030`).
Nothing here comes from Vizrt documentation. Parts marked *unknown* are replayed exactly as the TriCaster sends them.

## Network

The panel has a **USR-TCP232-E2** serial-to-Ethernet adapter inside it. The panel's controller talks over serial, and the
adapter passes that through to TCP.

- **Control:** TCP port **23**. Plain ASCII, one message per line, each line terminated by `\r`.
  The panel sometimes adds `\n` as well. Ignore it.
- **Discovery:** UDP port **1901**, broadcast. This is the adapter's own search protocol.
- **Addressing:** with no DHCP server, the panel uses a link-local `169.254.x.x` address, so a computer cabled straight
  to it finds it the same way.

### Discovery

Broadcast `FF 01 01 02` to `255.255.255.255:1901`. Each panel broadcasts a 36-byte reply back to port 1901:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | `FF` | Header |
| 1 | `24` | Length (36) |
| 2 | `01` | Reply to search |
| 5 | 4 | IPv4 address |
| 9 | 6 | MAC address |
| 19 | … | Model, null terminated (`USR-TCP232-E2`) |
| 35 | 1 | Checksum |

## Session

| Direction | Line | Meaning |
| --- | --- | --- |
| Panel → host | `CH01` `?<12 hex>` `\|011` | Heartbeat every 750 ms. `CH01` matches the `ID: 1` shown on the panel, and `?` is the current owner id (`000000000000` when unclaimed). |
| Host → panel | `V` | Ask for the version. The panel replies `~030`. |
| Host → panel | `Q<12 hex>` | Claim the panel with an owner id. Later heartbeats echo it. |
| Host → panel | `K` | Keepalive, sent about every 5 s. The panel sometimes answers `K`. |
| Host → panel | `T` | Ask for the current analog positions. |
| Host → panel | `1A01` `1931` `1D00` `1EC8` `1C40` | Configuration sent once after connecting. *Unknown.* |
| Host → panel | `R` then `k` | Reset and end the session. The panel answers `k`. |

## Buttons and lights

Buttons are grouped into banks of 8. Both directions use `BBMM`, where `BB` is the bank number and `MM` is a bitmask in
hex. The mask is **active-low**: a cleared bit means pressed (from the panel) or lit (to the panel). Bit 0 is the leftmost
button in the bank.

```
15FE   panel → host: bank 15, leftmost button held
15FF   panel → host: all bank 15 buttons released
12FE   host → panel: light the leftmost button of bank 12
```

The lights are on/off only. No per-button colour or brightness command has been seen yet.

| Banks | Where |
| --- | --- |
| `10` + `16` | Upper stripe, KEY row (left 8, right 8) |
| `11` + `17` | Upper stripe, A/C row |
| `12` + `20` | Upper stripe, B/D row |
| `13` + `21` | Lower stripe, KEY row |
| `14` + `22` | Lower stripe, PGM A/C row (confirmed on hardware) |
| `15` + `23` | Lower stripe, PREV B/D row (confirmed on hardware) |
| `30`–`37`, `40`–`47` | Right-hand section (transition, keyer and joystick area). Physical positions not mapped yet. |
| `48` | Reset by the TriCaster, but no presses seen |

## Analog controls (panel → host)

| Line | Meaning |
| --- | --- |
| `70XX` | T-bar 1, `00`–`FF` |
| `80XX` | T-bar 2, `00`–`FF` |
| `90XXYYZZ` | Joystick X, Y and twist, `80` = centre |

## Displays and T-bar lights (host → panel)

| Line | Meaning |
| --- | --- |
| `L<n>0050<80 chars>` | One line of text. `n` = 1–4 for the blue LCDs, and 7 for an extra display (the TriCaster shows a clock and a comment there). `00` looks like the start column, and `50` is the length in hex (80). |
| `O<n><2048 hex>` | 128×64 monochrome OLED `n` (1 or 2), 1 bit per pixel in SSD1306 page order (8 pages × 128 columns, LSB at the top). The TriCaster draws the stripe name here, for example `MAIN`. |
| `5 0 RRGGBB` / `6 0 RRGGBB` | Colour of the light on T-bar 1 / T-bar 2, written without spaces, for example `50DC00EE`. |

Each `L` display is one physical LCD of 2 lines × 40 characters, sent as one 80-character string (top line, then
bottom line). Each stripe has two: `L1` (upper stripe, columns 1–8), `L3` (upper, 9–16), `L2` (lower, 1–8), `L4` (lower,
9–16), confirmed on hardware. Each button column gets 5 characters per line, which is how the TriCaster puts `DDR` /
`M/E` on the top line and `1`–`4` underneath. `L7` is the LCD in the media player area.
