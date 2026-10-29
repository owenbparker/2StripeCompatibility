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
| 8–15 | Right-hand section, two banks of 8 per row |

Each LCD column (2 lines × 5 characters) shows the text of the button directly under it (the A/C or PGM row). To show
something else, give the control in the LCD row its own text. A line break in the text starts the second line.

Variables: `tbar1`, `tbar2` (0 to 1), `joystick_x`, `joystick_y`, `joystick_z` (-1 to 1).

## Development

```sh
npm install
npm test            # type-check and unit tests
npm run package     # build an installable module .tgz for Companion
```
