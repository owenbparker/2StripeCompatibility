import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NetworkInterfaceInfo } from 'node:os'
import { broadcastAddresses } from './discovery.ts'

const iface = (address: string, netmask: string, internal = false): NetworkInterfaceInfo => ({
	address,
	netmask,
	family: 'IPv4',
	mac: '00:00:00:00:00:00',
	internal,
	cidr: null,
})

test('targets every interface broadcast address, not just the default route', () => {
	const result = broadcastAddresses({
		NDI: [iface('10.230.5.122', '255.255.255.0')],
		'Ethernet 5': [iface('169.254.16.70', '255.255.0.0')],
		lo: [iface('127.0.0.1', '255.0.0.0', true)],
	})
	assert.deepEqual(result, ['255.255.255.255', '10.230.5.255', '169.254.255.255'])
})
