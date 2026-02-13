// Test with ABIs and enums
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { 
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  erc20Abi,
  type Address,
  type Hex,
} from 'npm:viem@2.21.0'

// Test enum
enum ExecutionMode {
  SingleDefault = 0,
  Batch = 1,
}

// Test ABI
const delegationManagerAbi = [
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

// Test function
function createExecution(target: Address, value: bigint, callData: Hex): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address, uint256, bytes'),
    [target, value, callData]
  )
}

function encodeRedeemDelegations(
  delegations: Hex[][],
  modes: number[],
  executions: Hex[][]
): Hex {
  return encodeFunctionData({
    abi: delegationManagerAbi,
    functionName: 'redeemDelegations',
    args: [delegations, modes, executions],
  })
}

serve(async (req) => {
  try {
    const testExecution = createExecution(
      '0x4200000000000000000000000000000000000006' as Address,
      0n,
      '0x1234' as Hex
    )
    
    const testCalldata = encodeRedeemDelegations(
      [['0x5678' as Hex]],
      [ExecutionMode.SingleDefault],
      [[testExecution]]
    )

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'ABIs and enums work!',
        testExecution: testExecution.slice(0, 20) + '...',
        testCalldata: testCalldata.slice(0, 20) + '...',
        executionMode: ExecutionMode.SingleDefault,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
