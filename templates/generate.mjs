// Builds 2stripe-vmix-atem.companionconfig: a Companion 5.1 page laid out for the tricaster-2stripe surface (v0.1.5+).
//   Upper stripe + light grey transition area -> ATEM M/E 1
//   Lower stripe + dark grey transition area  -> vMix
//   Right-hand section                         -> ATEM macros, vMix recording/streaming, overlays, media transport
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
					fontsize: v(14),
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

const vmixMix = { mix: 0, mixVariable: '' }

// Grid position -> control. Rows/columns follow the tricaster-2stripe v0.1.5 surface layout.
const controls = {}
const put = (row, column, c) => ((controls[row] ??= {})[column] = c)

for (let n = 1; n <= 16; n++) {
	const col = n - 1
	// Upper stripe: ATEM. KEY row = Aux 1, A/C = program, B/D = preview. A/C text labels the LCD above.
	put(0, col, control(`AUX\n${n}`, [action(ATEM, 'aux', { aux: 0, input: n })], [lit(ATEM, 'aux_bg', { aux: 0, input: n }, YELLOW)]))
	put(2, col, control(`$(atem:short_${n})`, [action(ATEM, 'program', { mixeffect: ME, input: n })], [lit(ATEM, 'program_bg', { mixeffect: ME, input: n })]))
	put(3, col, control(`PVW\n${n}`, [action(ATEM, 'preview', { mixeffect: ME, input: n })], [lit(ATEM, 'preview_bg', { mixeffect: ME, input: n }, GREEN)]))

	// Lower stripe: vMix. KEY row = overlay 1 with this input, PGM = cut to program, PREV = preview.
	const input = String(n)
	put(
		4,
		col,
		control(`OVL1\n${n}`, [action(VMIX, 'overlayFunctions', { type: 'OverlayInput', input, overlay: '1', mix: [0], mixVariable: '' })], [
			advanced(VMIX, 'overlayStatus', { input, overlay: '1', fg: WHITE, bgPreview: GREEN, bgProgram: RED }),
		]),
	)
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

// Light grey transition area (rows 8-11): ATEM M/E 1
const selection = (component, label, selId) =>
	control(label, [action(ATEM, 'transitionSelectionComponent', { mixeffect: ME, component, mode: 'toggle' })], [
		lit(ATEM, 'transitionSelection', { mixeffect: ME, matchmethod: 'contains', selection: [selId] }, YELLOW),
	])
put(8, 0, selection(0, 'BKGD', 'background'))
for (let k = 1; k <= 4; k++) put(8, k, selection(k, `KEY ${k}`, `key${k - 1}`))
const style = (s, label) =>
	control(label, [action(ATEM, 'transitionStyle', { mixeffect: ME, style: s })], [lit(ATEM, 'transitionStyle', { mixeffect: ME, style: s }, YELLOW)])
put(9, 0, style(0, 'MIX'))
put(9, 1, style(2, 'WIPE'))
put(10, 0, style(3, 'DVE'))
put(9, 2, control('FTB', [action(ATEM, 'fadeToBlackAuto', { mixeffect: ME })], [lit(ATEM, 'fadeToBlackIsBlack', { mixeffect: ME, state: 'on' })]))
put(11, 0, control('CUT', [action(ATEM, 'cut', { mixeffect: ME })]))
put(11, 1, control('AUTO', [action(ATEM, 'auto', { mixeffect: ME })], [lit(ATEM, 'inTransition', { mixeffect: ME })]))
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
// M/E 1-8 -> ATEM macros 1-8, FOLLOW -> stop macro
for (let m = 1; m <= 8; m++) {
	put(m <= 4 ? 8 : 9, 8 + ((m - 1) % 4) + 1, control(`MACRO\n${m}`, [action(ATEM, 'macrorun', { macro: m, action: 'run' })], [
		lit(ATEM, 'macro', { macroIndex: m, state: 'isRunning' }),
	]))
}
put(8, 13, control('MACRO\nSTOP', [action(ATEM, 'macrostop', {})]))
// MAIN and its neighbours -> vMix outputs
const vmixToggle = (fn, status, label) =>
	control(label, [action(VMIX, 'toggleFunctions', { functionID: fn, value: '' })], [lit(VMIX, 'status', { status, value: '' })])
put(10, 9, vmixToggle('StartStopRecording', 'recording', 'REC'))
put(10, 10, vmixToggle('StartStopStreaming', 'streaming', 'STREAM'))
put(10, 11, vmixToggle('StartStopExternal', 'external', 'EXT'))
put(11, 9, vmixToggle('StartStopMultiCorder', 'multiCorder', 'MULTI\nCORDER'))
put(11, 10, vmixToggle('Fullscreen', 'fullscreen', 'FULL\nSCREEN'))
put(12, 10, control('OVL\nALL OFF', [action(VMIX, 'overlayFunctions', { type: 'OverlayInputAllOff', input: '', overlay: '1', mix: [0], mixVariable: '' })]))
// LAYER A-D -> ATEM upstream keyers 1-4 on air
for (let k = 0; k < 4; k++) {
	put(8 + Math.floor(k / 2), 14 + (k % 2), control(`USK${k + 1}`, [action(ATEM, 'usk', { onair: 'toggle', mixeffect: ME, key: k })], [
		lit(ATEM, 'usk_bg', { mixeffect: ME, key: k }),
	]))
}
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
// Media LCD: vMix recording time and ATEM M/E 1 sources
put(14, 11, control('vMix REC $(vmix:recording_hms)\nATEM PGM $(atem:pgm1_input) PVW $(atem:pvw1_input)'))

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
