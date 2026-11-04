import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	encodeHandshake,
	encodeLcd,
	encodeLeds,
	encodeOled,
	encodeTbarLight,
	parseDiscoveryReply,
	parsePanelLine,
} from './protocol.ts'

// All sample messages below are taken from a capture of a TC2 driving a real 2-Stripe panel

test('parses heartbeat lines', () => {
	assert.deepEqual(parsePanelLine('CH01'), { type: 'heartbeat' })
	assert.deepEqual(parsePanelLine('|011'), { type: 'heartbeat' })
	assert.deepEqual(parsePanelLine('?000078f4a51b'), { type: 'owner', id: '000078f4a51b' })
	assert.deepEqual(parsePanelLine('~030'), { type: 'version', version: '030' })
	assert.deepEqual(parsePanelLine('K'), { type: 'keepalive' })
})

test('parses button banks as pressed masks', () => {
	assert.deepEqual(parsePanelLine('15FE'), { type: 'buttons', bank: 0x15, pressed: 0b0000_0001 })
	assert.deepEqual(parsePanelLine('237F'), { type: 'buttons', bank: 0x23, pressed: 0b1000_0000 })
	assert.deepEqual(parsePanelLine('35E7'), { type: 'buttons', bank: 0x35, pressed: 0b0001_1000 })
	assert.deepEqual(parsePanelLine('46FF'), { type: 'buttons', bank: 0x46, pressed: 0 })
})

test('parses T-bars', () => {
	assert.deepEqual(parsePanelLine('7000'), { type: 'tbar', index: 1, value: 0 })
	assert.deepEqual(parsePanelLine('80FF'), { type: 'tbar', index: 2, value: 1 })
})

test('parses the joystick around a centre of 0x80', () => {
	const msg = parsePanelLine('90807F00')
	assert.equal(msg.type, 'joystick')
	if (msg.type !== 'joystick') return
	assert.equal(msg.x, 0)
	assert.ok(Math.abs(msg.y - -1 / 127) < 1e-9)
	assert.equal(msg.z, -1)
})

test('does not mistake the T-bar for a button bank', () => {
	assert.equal(parsePanelLine('8000').type, 'tbar')
	assert.equal(parsePanelLine('XYZ').type, 'unknown')
})

test('encodes LEDs active-low', () => {
	assert.equal(encodeLeds(0x15, 0b0000_0001), '15FE')
	assert.equal(encodeLeds(0x40, 0), '40FF')
	assert.equal(encodeLeds(0x35, 0b0101_0000), '35AF')
})

test('encodes LCD lines as 80 characters', () => {
	const line = encodeLcd(2, '1    2    3')
	assert.equal(line.slice(0, 6), 'L20050')
	assert.equal(line.length, 6 + 80)
	assert.equal(encodeLcd(1, 'x'.repeat(100)).length, 86)
	assert.equal(encodeLcd(1, 'café').slice(6, 10), 'caf ')
})

test('encodes OLED bitmaps and T-bar lights', () => {
	const line = encodeOled(1, new Uint8Array(1024).fill(0xab))
	assert.equal(line.length, 2 + 2048)
	assert.ok(line.startsWith('O1ABAB'))
	assert.equal(encodeTbarLight(1, 0xdc, 0x00, 0xee), '50DC00EE')
	assert.equal(encodeTbarLight(2, 0x22, 0x22, 0x22), '60222222')
})

test('handshake claims the panel with our id', () => {
	assert.deepEqual(encodeHandshake('000078f4a51b').slice(0, 4), ['V', 'Q000078f4a51b', 'K', 'T'])
})

test('parses the discovery reply from the panel', () => {
	const reply = Buffer.from(
		'ff2401000 0a9fee5449ca525d744e4c80b0100 5553522d5443503233322d453200 00008a'.replace(/ /g, ''),
		'hex',
	)
	assert.deepEqual(parseDiscoveryReply(reply), {
		ip: '169.254.229.68',
		mac: '9c:a5:25:d7:44:e4',
		model: 'USR-TCP232-E2',
	})
	assert.equal(parseDiscoveryReply(Buffer.from([0xff, 0x01, 0x01, 0x02])), null)
})
