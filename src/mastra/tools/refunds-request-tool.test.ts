import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@lib/request-identity', () => ({
  resolveRequestUser: vi.fn(),
}))
vi.mock('@lib/refunds-run', () => ({
  startRefundRequest: vi.fn(),
}))

import { requestRefundTool } from './refunds-request-tool'
import { resolveRequestUser } from '@lib/request-identity'
import { startRefundRequest } from '@lib/refunds-run'

const ctx = { mastra: {}, agent: { resourceId: 'ana@gmail.com' } }
function run(input: any, context: any = ctx) {
  return (requestRefundTool.execute as any)(input, context)
}

describe('requestRefundTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(startRefundRequest).mockResolvedValue({ alreadyInProgress: false, result: {} } as any)
  })

  it('rejects with requester_unidentified when the user has an empty name', async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue({ email: 'ana@gmail.com', name: '', role: 'member', addedAt: 1 } as any)
    const result = await run({ amount: 100, year: 2026, month: 7 })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startRefundRequest).not.toHaveBeenCalled()
  })

  it('rejects with requester_unidentified when the user cannot be resolved', async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue(null)
    const result = await run({ amount: 100, year: 2026, month: 7 })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startRefundRequest).not.toHaveBeenCalled()
  })

  it('starts the refund with the resolved name as requestedBy', async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue({ email: 'ana@gmail.com', name: 'Ana', role: 'member', addedAt: 1 } as any)
    await run({ amount: 100, reason: 'demora', year: 2026, month: 7 })
    expect(startRefundRequest).toHaveBeenCalledWith({}, { amount: 100, reason: 'demora', year: 2026, month: 7, requestedBy: 'Ana' })
  })
})
