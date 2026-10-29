// Builds 2stripe-vmix-atem.companionconfig: a Companion 5.1 page laid out for the tricaster-2stripe surface (v0.1.5+).
//   Upper stripe + light grey transition area -> ATEM M/E 1
//   Lower stripe + dark grey transition area  -> vMix
//   M/E 1-4 buttons pick the ATEM M/E, M/E 5-8 the vMix mix; the rest runs vMix outputs, overlays and media transport
// Run: node templates/generate.mjs [connections.json] > out.companionconfig
// connections.json (optional) is the "instances" object from one of your own page exports, so the page
// points at your existing vMix and ATEM connections. Without it, connections labelled "vmix" and "atem" are assumed.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const VMIX = 'kMWL9qyZ7OlQDDwPIeGzb'
const ATEM = 'a_j7YLfLHvsk_VOA-AifG'
const ME = 0 // ATEM M/E driven by the upper stripe

const RED = 0xff0000
const GREEN = 0x00ff00
const YELLOW = 0xeeee00
const WHITE = 0xffffff

const id = () => randomBytes(16).toString('base64url').slice(0, 21)
const v = (value) => ({ value, isExpression: false })
const opts = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, v(x)]))
const geometry = { opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0) }
const imageLayer = (lid, name) => ({
	id: lid,
	name,
	usage: 'auto',
	type: 'image',
	pinnedProperties: ['base64Image', 'halign', 'valign'],
	enabled: v(true),
	...geometry,
	base64Image: v(null),
	halign: v('center'),
	valign: v('center'),
	fillMode: v('fit'),
})

function control(text, actions = [], feedbacks = []) {
	return {
		type: 'button-layered',
		style: {
			layers: [
				{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
				{
					id: 'box0',
					name: 'Background',
					usage: 'auto',
					type: 'box',
					pinnedProperties: ['color'],
					enabled: v(true),
					...geometry,
					color: v(0),
					cornerRadius: v(0),
					borderWidth: v(0),
					borderColor: v(0),
					borderPosition: v('inside'),
				},
				imageLayer('image0', 'Image'),
				{
					id: 'text0',
					name: 'Text',
					usage: 'auto',
					type: 'text',
					pinnedProperties: ['text', 'fontsize', 'fontsizeAllowShrink', 'color', 'halign', 'valign'],
					enabled: v(true),
					...geometry,
					text: v(text),
					color: v(WHITE),
					halign: v('center'),
					valign: v('center'),
					fontsize: v(24),
					fontsizeAllowShrink: v(true),
					font: v('companion-sans'),
					weight: v('normal'),
					styles: v([]),
					outlineColor: v(4278190080),
				},
				imageLayer('imageBuffers', 'Image Buffers'),
			],
		},
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: true, notes: '' },
		feedbacks,
		steps: { 0: { action_sets: { down: actions, up: [] }, options: { runWhileHeld: [] } } },
		localVariables: [],
	}
}

const upgradeIndex = { [VMIX]: 14, [ATEM]: 6 }
const action = (conn, definitionId, o) => ({
	id: id(),
	definitionId,
	connectionId: conn,
	options: opts(o),
	upgradeIndex: upgradeIndex[conn],
	type: 'action',
})
const feedbackBase = (conn, definitionId, o, styleOverrides) => ({
	id: id(),
	definitionId,
	connectionId: conn,
	options: opts(o),
	upgradeIndex: upgradeIndex[conn],
	type: 'feedback',
	isInverted: v(false),
	styleOverrides,
})
const override = (elementId, elementProperty, value) => ({ overrideId: id(), elementId, elementProperty, override: v(value) })
/** Boolean feedback: lights the button in a fixed colour */
const lit = (conn, definitionId, o, bg = RED) =>
	feedbackBase(conn, definitionId, o, [override('text0', 'color', WHITE), override('box0', 'color', bg)])
/** Advanced feedback (vMix tally): the module returns the style, mapped onto the layers */
const advanced = (conn, definitionId, o) =>
	feedbackBase(conn, definitionId, o, [
		override('text0', 'color', 'color'),
		override('box0', 'color', 'bgcolor'),
	])

// The ATEM M/E and vMix mix the stripes act on live in two custom variables, set by the M/E buttons.
// They are created on the first press, so press an M/E button for each switcher once after importing.
const ATEM_ME = 'atem_me' // 1-4
const VMIX_MIX = 'vmix_mix' // 1-4
const vmixMix = { mix: -2, mixVariable: `$(custom:${VMIX_MIX})` }
const setVar = (name, value) => ({
	id: id(),
	definitionId: 'custom_variable_set_value',
	connectionId: 'internal',
	options: opts({ name, create: true, value: String(value) }),
	type: 'action',
})
const varIs = (name, value) => ({
	id: id(),
	definitionId: 'variable_value',
	connectionId: 'internal',
	options: opts({ variable: `custom:${name}`, op: 'eq', value: String(value) }),
	type: 'feedback',
	isInverted: v(false),
})
const varLit = (name, value) => ({ ...varIs(name, value), styleOverrides: [override('text0', 'color', WHITE), override('box0', 'color', YELLOW)] })
/** ATEM actions whose M/E is a dropdown: one "if atem_me = n" block per M/E */
const onAtemMe = (definitionId, o) =>
	[1, 2, 3, 4].map((me) => ({
		id: id(),
		definitionId: 'logic_if',
		connectionId: 'internal',
		options: {},
		children: { condition: [varIs(ATEM_ME, me)], actions: [action(ATEM, definitionId, { mixeffect: me - 1, ...o })], else_actions: [] },
		type: 'action',
	}))

// Grid position -> control. Rows/columns follow the tricaster-2stripe v0.1.5 surface layout.
const controls = {}
const put = (row, column, c) => ((controls[row] ??= {})[column] = c)

const atemMeButton = (me) => control(`ATEM\nM/E ${me}`, [setVar(ATEM_ME, me)], [varLit(ATEM_ME, me)])
const vmixMixButton = (mix) => control(`vMix\nMIX ${mix}`, [setVar(VMIX_MIX, mix)], [varLit(VMIX_MIX, mix)])
for (let n = 1; n <= 4; n++) {
	// KEY rows: pick the M/E (upper) or mix (lower) the stripe below works on
	put(0, n - 1, atemMeButton(n))
	put(4, n - 1, vmixMixButton(n))
	// Right-hand M/E 1-4 -> ATEM M/E, M/E 5-8 -> vMix mix 1-4
	put(8, 8 + n, atemMeButton(n))
	put(9, 8 + n, vmixMixButton(n))
}

const atemMe = `$(custom:${ATEM_ME})`
for (let n = 1; n <= 16; n++) {
	const col = n - 1
	const input = String(n)
	// Upper stripe: ATEM on the selected M/E. A/C = program, B/D = preview. A/C text labels the LCD above.
	put(2, col, control(`$(atem:short_${n})`, [action(ATEM, 'programVariables', { mixeffect: atemMe, input })], [lit(ATEM, 'programVariables', { mixeffect: atemMe, input })]))
	put(3, col, control(`PVW\n${n}`, [action(ATEM, 'previewVariables', { mixeffect: atemMe, input })], [lit(ATEM, 'previewVariables', { mixeffect: atemMe, input }, GREEN)]))
	// Lower stripe: vMix on the selected mix. PGM = cut to program, PREV = preview.
	put(
		6,
		col,
		control(`$(vmix:input_${n}_name)`, [action(VMIX, 'programCut', { input, ...vmixMix })], [
			advanced(VMIX, 'inputLive', { input, ...vmixMix, fg: WHITE, bg: RED, tally: '' }),
		]),
	)
	put(
		7,
		col,
		control(`PVW\n${n}`, [action(VMIX, 'previewInput', { input, ...vmixMix })], [
			advanced(VMIX, 'inputPreview', { input, ...vmixMix, fg: WHITE, bg: GREEN, tally: '' }),
		]),
	)
}

// Light grey transition area (rows 8-11): ATEM, on the selected M/E
const selection = (component, label) => control(label, onAtemMe('transitionSelectionComponent', { component, mode: 'toggle' }))
put(8, 0, selection(0, 'BKGD'))
for (let k = 1; k <= 4; k++) put(8, k, selection(k, `KEY ${k}`))
put(9, 0, control('MIX', onAtemMe('transitionStyle', { style: 0 })))
put(9, 1, control('WIPE', onAtemMe('transitionStyle', { style: 2 })))
put(10, 0, control('DVE', onAtemMe('transitionStyle', { style: 3 })))
put(9, 2, control('FTB', onAtemMe('fadeToBlackAuto', {})))
put(11, 0, control('CUT', onAtemMe('cut', {})))
put(11, 1, control('AUTO', onAtemMe('auto', {})))
// KEY 1-4 TAKE/AUTO -> ATEM downstream keyers 1-4
for (let k = 0; k < 4; k++) {
	const onAir = () => lit(ATEM, 'dsk_bg', { key: k })
	put(8 + k, 6, control(`DSK${k + 1}\nCUT`, [action(ATEM, 'dsk', { onair: 'toggle', key: k })], [onAir()]))
	put(8 + k, 7, control(`DSK${k + 1}\nAUTO`, [action(ATEM, 'dskAuto', { downstreamKeyerId: k })], [onAir()]))
}

// Dark grey transition area (rows 12-15): vMix
const vmixTransition = (fn, label) => control(label, [action(VMIX, 'transition', { functionID: fn, ...vmixMix })])
put(12, 0, vmixTransition('Transition1', 'T1'))
for (let k = 1; k <= 4; k++) put(12, k, vmixTransition(`Stinger${k}`, `STING ${k}`))
put(13, 0, vmixTransition('Transition2', 'T2'))
put(13, 1, vmixTransition('Transition3', 'T3'))
put(14, 0, vmixTransition('Transition4', 'T4'))
put(
	13,
	2,
	control('FTB', [action(VMIX, 'toggleFunctions', { functionID: 'FadeToBlack', value: '' })], [lit(VMIX, 'status', { status: 'fadeToBlack', value: '' })]),
)
put(15, 0, control('CUT', [action(VMIX, 'transitionMix', { functionID: 'Cut', ...vmixMix, duration: '0' })]))
put(15, 1, control('FADE', [action(VMIX, 'transitionMix', { functionID: 'Fade', ...vmixMix, duration: '1000' })]))
// KEY 1-4 TAKE/AUTO -> vMix overlays 1-4: TAKE toggles the last input in/out, AUTO transitions it out
for (let k = 1; k <= 4; k++) {
	const overlay = String(k)
	const tally = () => advanced(VMIX, 'overlayStatus', { input: '', overlay, fg: WHITE, bgPreview: GREEN, bgProgram: RED })
	const ovl = (type) => action(VMIX, 'overlayFunctions', { type, input: '', overlay, mix: [0], mixVariable: '' })
	put(11 + k, 6, control(`OVL${k}\nTAKE`, [ovl('Last')], [tally()]))
	put(11 + k, 7, control(`OVL${k}\nOUT`, [ovl('Out')], [tally()]))
}

// Right-hand section
// MAIN and its neighbours -> vMix outputs
const vmixToggle = (fn, status, label) =>
	control(label, [action(VMIX, 'toggleFunctions', { functionID: fn, value: '' })], [lit(VMIX, 'status', { status, value: '' })])
put(10, 9, vmixToggle('StartStopRecording', 'recording', 'REC'))
put(10, 10, vmixToggle('StartStopStreaming', 'streaming', 'STREAM'))
put(10, 11, vmixToggle('StartStopExternal', 'external', 'EXT'))
put(11, 9, vmixToggle('StartStopMultiCorder', 'multiCorder', 'MULTI\nCORDER'))
put(11, 10, vmixToggle('Fullscreen', 'fullscreen', 'FULL\nSCREEN'))
put(12, 10, control('OVL\nALL OFF', [action(VMIX, 'overlayFunctions', { type: 'OverlayInputAllOff', input: '', overlay: '1', mix: [0], mixVariable: '' })]))
// LAYER A-D -> ATEM upstream keyers 1-4 on the selected M/E
for (let k = 0; k < 4; k++) put(8 + Math.floor(k / 2), 14 + (k % 2), control(`USK${k + 1}`, onAtemMe('usk', { onair: 'toggle', key: k })))
// Media player area -> vMix playback of the input in preview, and the playlist
const media = (definitionId, o, label) => control(label, [action(VMIX, definitionId, { input: '', inputType: true, ...o })])
put(14, 9, media('videoMark', { functionID: 'MarkIn' }, 'MARK\nIN'))
put(14, 10, media('videoMark', { functionID: 'MarkOut' }, 'MARK\nOUT'))
put(14, 12, media('videoActions', { functionID: 'Loop' }, 'LOOP'))
put(15, 9, media('videoActions', { functionID: 'Restart' }, '|<'))
put(15, 10, media('videoActions', { functionID: 'Pause' }, 'PAUSE'))
put(15, 11, media('videoActions', { functionID: 'Play' }, 'PLAY'))
put(15, 12, media('videoPlayhead', { adjustment: 'Increase', value: 10000 }, '+10s'))
const playlist = (fn, label, fb) =>
	control(label, [action(VMIX, 'playListFunctions', { functionID: fn })], fb ? [lit(VMIX, 'status', { status: 'playList', value: '' })] : [])
put(14, 13, playlist('StartPlayList', 'PLAYLIST\nSTART', true))
put(14, 14, playlist('StopPlayList', 'PLAYLIST\nSTOP', true))
put(13, 14, playlist('PreviousPlayListEntry', 'PLAYLIST\nPREV'))
put(13, 15, playlist('NextPlayListEntry', 'PLAYLIST\nNEXT'))
// Media LCD: which M/E and mix the stripes are on, and the vMix recording time
put(14, 11, control(`ATEM M/E $(custom:${ATEM_ME})  vMix MIX $(custom:${VMIX_MIX})\nvMix REC $(vmix:recording_hms)`))

const instances = process.argv[2]
	? JSON.parse(readFileSync(process.argv[2], 'utf8'))
	: {
			[VMIX]: { moduleInstanceType: 'connection', moduleId: 'studiocoast-vmix', moduleVersionId: '4.2.0', label: 'vmix', config: {}, secrets: {}, enabled: true, lastUpgradeIndex: 14, sortOrder: 0, updatePolicy: 'stable', isFirstInit: false },
			[ATEM]: { moduleInstanceType: 'connection', moduleId: 'bmd-atem', moduleVersionId: '3.21.1', label: 'atem', config: {}, secrets: {}, enabled: true, lastUpgradeIndex: 6, sortOrder: 1, updatePolicy: 'stable', isFirstInit: false },
		}

const page = {
	version: 12,
	type: 'page',
	companionBuild: '5.1.1',
	page: {
		id: id(),
		name: '2-Stripe vMix + ATEM',
		controls,
		gridSize: { minColumn: 0, maxColumn: 15, minRow: 0, maxRow: 18 },
		pageVariables: [],
	},
	instances,
	connectionCollections: [],
	oldPageNumber: 1,
	imageLibrary: [],
	imageLibraryCollections: [],
}

process.stdout.write(gzipSync(JSON.stringify(page)))
