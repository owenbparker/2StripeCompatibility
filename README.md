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
| Blue LCD text | Done, using the LCD row of the Companion grid |
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
| 0 | Stripe 1, top button row (16 buttons) |
| 1 | Stripe 1 LCD: text you give these controls in Companion appears in the LCD above that column (2 lines × 5 characters; a line break starts the second line) |
| 2–3 | Stripe 1, second and third button rows |
| 4–7 | Stripe 2, same as rows 0–3 |
| 8–15 | Right-hand section, two banks of 8 per row |

Variables: `tbar1`, `tbar2` (0 to 1), `joystick_x`, `joystick_y`, `joystick_z` (-1 to 1).

## Development

```sh
npm install
npm test            # type-check and unit tests
npm run package     # build an installable module .tgz for Companion
```
