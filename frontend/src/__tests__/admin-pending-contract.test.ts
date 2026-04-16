import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPendingMaterials } from '@/lib/api/admin'
import { apiClient } from '@/lib/api/client'

describe('admin pending list contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns uploader + label fields and excludes non-contract fields', async () => {
    const response = {
      items: [
        {
          id: 'material-1',
          title: '函数专题练习',
          subject: '数学',
          stage: '高中',
          grade: '高二',
          createdAt: '2026-04-16T08:00:00.000Z',
          uploader: {
            username: 'alice',
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    }

    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: response } as never)

    const data = await getPendingMaterials({ page: 1, pageSize: 10 })

    expect(data.items[0]).toMatchObject({
      subject: '数学',
      stage: '高中',
      grade: '高二',
      uploader: {
        username: 'alice',
      },
    })
    expect(data.items[0]).not.toHaveProperty('uploaderId')
    expect(data.items[0]).not.toHaveProperty('description')
  })
})
