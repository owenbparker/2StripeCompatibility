# TriCaster 2-Stripe for Bitfocus Companion

A [Bitfocus Companion](https://bitfocus.io/companion) surface module that lets the Vizrt/NewTek TriCaster
2-Stripe control panel (the one bundled with a TriCaster TC2) work as a Companion surface, without a TriCaster.

## Status

**Ready for a first hardware test.** The panel's protocol has been decoded from a packet capture (see
[docs/PROTOCOL.md](docs/PROTOCOL.md)), and the module has only been tested against a simulated panel so far.

| Feature | State |
| --- | --- |
| Finding panels on the network | Done (UDP discovery), or enter the IP by hand |
| Button presses | Done for every button pressed in the capture |
| Button lights | Done (on/off: any Companion colour lights the button) |
| Blue LCD text | Done, labelled from the button row under each LCD |
| T-bars and joystick | Done, as surface variables |
| Small OLED screens, T-bar lights, brightness | Not yet (cleared on connect) |
| Physical layout of the right-hand section | Provisional |

## Using it

1. Connect the panel to the network or straight to the Companion computer. **Close TriCaster's connection to the panel
   first.** The panel expects one controller at a time.
2. Install the module into Companion 5.1 or newer (see Development below).
3. In Companion's Surfaces page, add a remote surface of type TriCaster 2-Stripe. The panel should be listed
   automatically. If it isn't, enter its IP address, or leave the address empty to use the first panel found.

The panel picks its own `169.254.x.x` address when there is no DHCP server, and it can change after a restart. Once
connected, the module remembers the panel by its MAC address and follows it to its new address, and Companion keeps
the same surface.

### Grid layout

| Grid rows | Panel |
| --- | --- |
| 0 | Upper stripe, KEY row (16 buttons) |
| 1 | Upper stripe LCD |
| 2–3 | Upper stripe, A/C and B/D rows |
| 4 | Lower stripe, KEY row |
| 5 | Lower stripe LCD |
| 6–7 | Lower stripe, PGM A/C and PREV B/D rows |
| 8–11, columns 0–7 | Light grey transition area (upper T-bar): BKGD, KEY 1–4, FADE, TRANS, FTB, EFFCT, TAKE, AUTO, and KEY 1–4 TAKE/AUTO in columns 6–7 |
| 12–15, columns 0–7 | Dark grey transition area (lower T-bar), same layout |
| 8–15, columns 9–15 | M/E 1–8, FOLLOW, MAIN, POS/POT/CROP/FOCUS, SHTL, RESET, LAYER A–D and 1–4, LVSET, MEDIA 1–4, SND, presets, MARK IN/OUT, media LCD, LOOP, PLYLST, SHOW, AUTO PLAY, transport |
| 16–18 | Bits not seen in any press yet (`bank<nn>-<bit>`) |

The exact control ids are in `src/panel/controls.ts`. `templates/2stripe-vmix-atem.companionconfig` is a ready-made
page: the upper stripe and light grey area run ATEM M/E 1–4, the lower stripe, dark grey area and T-bar run vMix mix 1–4. The M/E buttons (and the first four KEY buttons of each stripe) pick which M/E or mix.

Each stripe has two LCDs (over columns 1–8 and 9–16), each 2 lines of 40 characters. Every column gets 5 characters
on each line, showing the text of the button directly under it (the A/C or PGM row). To show something else, give the
control in the LCD row its own text. A line break in the text starts the second line.

The LCD in the media player area is the `media-lcd` control (row 14, column 11): 2 lines of 40 characters.

Every button press is logged as `2-Stripe press: <control>` in Companion's log, which helps when mapping the panel.

Variables: `tbar1`, `tbar2` (0 to 1), the same scaled for vMix as `tbar1_255`/`tbar2_255` and for ATEM as
`tbar1_100`/`tbar2_100`, and `joystick_x`, `joystick_y`, `joystick_z` (-1 to 1).

`templates/2stripe-tbar-triggers.companionconfig` holds two triggers: custom variable `tbar_atem` drives the ATEM
M/E 1 T-bar and `tbar_vmix` the vMix T-bar. Create both custom variables, then in the surface's settings send one
T-bar's `_100` variable to `tbar_atem` and the other's `_255` variable to `tbar_vmix`.

## Development

```sh
npm install
npm test            # type-check and unit tests
npm run package     # build an installable module .tgz for Companion
```
