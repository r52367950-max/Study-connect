import { describe, it, expect, vi } from 'vitest'
import { submitRating } from '@/lib/api/materials'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

describe('submitRating()', () => {
  it('sends content in payload and returns response with content', async () => {
    const mockedRating = {
      id: 'rating-1',
      user_id: 'user-1',
      material_id: 'material-1',
      score: 5,
      content: '非常有帮助',
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    }

    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: mockedRating })

    const response = await submitRating('material-1', {
      score: 5,
      content: '非常有帮助',
    })

    expect(apiClient.post).toHaveBeenCalledWith('/materials/material-1/ratings', {
      score: 5,
      content: '非常有帮助',
    })
    expect(response.content).toBe('非常有帮助')
  })
})
