import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSwitcherConfig, TbarFollower } from './switchers.ts'

test('the T-bar runs the next transition the other way after one completes', () => {
	const t = new TbarFollower()
	assert.equal(t.position(0), 0)
	assert.equal(t.position(0.5), 0.5)
	assert.equal(t.position(1), 1)
	// Lever stays at the top, the switcher has finished: moving it back down runs a new transition up from 0
	assert.equal(t.position(0.75), 0.25)
	assert.equal(t.position(0), 1)
	assert.equal(t.position(0.25), 0.25)
})

test('switcher settings default to vMix on this computer and the ATEM off', () => {
	assert.deepEqual(parseSwitcherConfig({}), { vmixHost: '127.0.0.1', atemHost: '', vmixTbar: 'tbar1', atemAlwaysMix: true })
	assert.deepEqual(parseSwitcherConfig({ atemHost: ' 10.0.0.5 ', vmixTbar: 'tbar2' }).atemHost, '10.0.0.5')
})

test('a follower started with the lever at the top counts the top as 0%', () => {
	const f = new TbarFollower(true)
	assert.equal(f.position(1), 0)
	assert.equal(f.position(0.5), 0.5)
	assert.equal(f.position(0), 1)
	assert.equal(f.position(0.25), 0.25)
})

test('the ATEM T-bar can follow the selected style instead of always mixing', () => {
	assert.equal(parseSwitcherConfig({ atemTbarStyle: 'selected' }).atemAlwaysMix, false)
	assert.equal(parseSwitcherConfig({ atemTbarStyle: 'mix' }).atemAlwaysMix, true)
})

test('a lever already at the top when the module starts counts the top as 0%', () => {
	const f = new TbarFollower()
	assert.equal(f.position(1), 0)
	assert.equal(f.position(0.4), 0.6)
	assert.equal(f.position(0), 1)
	assert.equal(f.position(0.3), 0.3)
})
