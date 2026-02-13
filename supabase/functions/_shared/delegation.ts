// MetaMask Delegation Framework helpers for Deno
// Port of the delegation redemption logic

import { encodeFunctionData, type Address, type Hex } from 'https://esm.sh/viem@2.21.45'

export const DELEGATION_MANAGER_ADDRESS = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address

// ExecutionMode enum from MetaMask SDK
export enum ExecutionMode {
  CALL = 0,
  DELEGATECALL = 1,
}

/**
 * Create execution calldata for a single contract call
 */
export function createExecution(
  target: Address,
  value: bigint,
  callData: Hex
): Hex {
  // Execution format: abi.encode(target, value, callData)
  // This is a simplified version - full implementation would use proper ABI encoding
  return `0x${target.slice(2)}${value.toString(16).padStart(64, '0')}${callData.slice(2)}` as Hex
}

/**
 * Encode redeemDelegations calldata
 */
export function encodeRedeemDelegations(
  delegations: Hex[][],
  modes: number[],
  executions: Hex[][]
): Hex {
  const abi = [
    {
      name: 'redeemDelegations',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'delegations', type: 'bytes[][]' },
        { name: 'modes', type: 'uint8[]' },
        { name: 'executions', type: 'bytes[][]' },
      ],
      outputs: [],
    },
  ] as const

  return encodeFunctionData({
    abi,
    functionName: 'redeemDelegations',
    args: [delegations, modes, executions],
  })
}

/**
 * Parse a signed delegation into the format needed for redemption
 */
export function parseDelegation(delegationData: any): {
  delegationHash: Hex
  delegation: Hex[]
} {
  // Extract the delegation components
  const { delegate, delegator, authority, caveats, salt, signature } = delegationData

  // Format as bytes array for redeemDelegations
  // This is a simplified version - full implementation would properly encode all fields
  const delegation: Hex[] = [
    delegate as Hex,
    delegator as Hex,
    authority as Hex,
    // ... add caveat encoding
    salt as Hex,
    signature as Hex,
  ]

  return {
    delegationHash: delegationData.hash as Hex,
    delegation,
  }
}

/**
 * Validate delegation caveats
 */
export function validateDelegationCaveats(delegationData: any): {
  valid: boolean
  reason?: string
} {
  const caveats = delegationData.caveats || []
  
  // Check expiration
  const timestampCaveat = caveats.find((c: any) => 
    c.enforcer?.toLowerCase() === '0x1046bb45c8d673d4ea75321280db34899413c069'
  )
  
  if (timestampCaveat) {
    const expiresAt = parseInt(timestampCaveat.terms.slice(0, 66), 16) * 1000
    if (Date.now() > expiresAt) {
      return { valid: false, reason: 'Delegation expired' }
    }
  }

  // Check limited calls
  const limitedCallsCaveat = caveats.find((c: any) =>
    c.enforcer?.toLowerCase() === '0x04658b29f6b82ed55274221a06fc97d318e25416'
  )

  if (limitedCallsCaveat) {
    const usesRemaining = parseInt(limitedCallsCaveat.terms.slice(0, 66), 16)
    if (usesRemaining === 0) {
      return { valid: false, reason: 'No uses remaining' }
    }
  }

  return { valid: true }
}
