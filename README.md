# TriCaster 2-Stripe for Bitfocus Companion

A [Bitfocus Companion](https://bitfocus.io/companion) surface module that lets the Vizrt/NewTek TriCaster
2-Stripe control panel (the one bundled with a TriCaster TC2) work as a Companion surface, without a TriCaster.

## Status

**Work in progress.** The 2-Stripe connects over Ethernet using an undocumented Vizrt protocol. The Companion
side of the module is in place, but the panel protocol still has to be decoded from a packet capture, so the
module cannot talk to a panel yet.

| Part | State |
| --- | --- |
| Companion surface module (network connection, buttons, LEDs, T-bar/joystick variables) | Scaffolded |
| Button layout | Provisional, to be replaced from the capture |
| Panel protocol (`src/panel/connection.ts`) | Not decoded yet |

## How it works

The module uses Companion's surface module API (`@companion-surface/base`, Companion 5.1+). You add the panel in
Companion as a remote surface by entering its IP address. Buttons map to Companion buttons, Companion button colours
light the panel's buttons, and the T-bar and joystick are reported as surface variables.

## Helping decode the protocol

Record the traffic between the panel and the TriCaster with [Wireshark](https://www.wireshark.org/):

1. Connect the panel and TriCaster as normal and start a Wireshark capture on the adapter the panel uses.
2. Power the panel on so the capture includes discovery and the handshake.
3. Press each button once, slowly, in a known order. Move the T-bar end to end and the joystick in each direction.
4. Change things in the TriCaster software so the panel's lights change.
5. Save as `.pcapng`.

## Development

```sh
npm install
npm test            # type-check and unit tests
npm run package     # build an installable module .tgz for Companion
```
