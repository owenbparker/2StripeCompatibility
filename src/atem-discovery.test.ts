import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAtemQuery, isAtemAnswer } from './atem-discovery.ts'

test('our own query is not mistaken for an ATEM answer', () => {
	assert.equal(isAtemAnswer(buildAtemQuery()), false)
})

test('an answer naming the ATEM control service is recognised', () => {
	const answer = Buffer.from(buildAtemQuery())
	answer.writeUInt16BE(0x8400, 2)
	assert.equal(isAtemAnswer(answer), true)
})

test('an answer for some other Blackmagic device is ignored', () => {
	const header = Buffer.alloc(12)
	header.writeUInt16BE(0x8400, 2)
	const other = Buffer.concat([header, Buffer.from('\x0b_blackmagic\x04_tcp\x05local\x00 class=HyperDeck', 'latin1')])
	assert.equal(isAtemAnswer(other), false)
})
