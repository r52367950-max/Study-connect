'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { submitRating } from '@/lib/api/materials'
import { getErrorMessage } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const schema = z.object({
  score: z.number().min(1, '请选择评分').max(5),
  content: z.string().max(500, '评论最多 500 字').optional(),
})
type FormValues = z.infer<typeof schema>

interface RatingFormProps {
  materialId: string
  existingScore?: number | null
}

export function RatingForm({ materialId, existingScore }: RatingFormProps) {
  const [hoverScore, setHoverScore] = useState(0)
  const queryClient = useQueryClient()

  const { register, setValue, watch, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { score: existingScore ?? 0, content: '' },
  })

  const score = watch('score')

  const { mutate, isPending } = useMutation({
    mutationFn: (data: FormValues) =>
      submitRating(materialId, { score: data.score, content: data.content }),
    onSuccess: () => {
      toast({ title: '评分成功', description: '感谢您的评价！' })
      queryClient.invalidateQueries({ queryKey: ['ratings', materialId] })
      queryClient.invalidateQueries({ queryKey: ['material', materialId] })
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: '评分失败', description: getErrorMessage(err) })
    },
  })

  const onSubmit = (data: FormValues) => mutate(data)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>评分</Label>
        <div
          className="flex gap-1"
          onMouseLeave={() => setHoverScore(0)}
          role="group"
          aria-label="星级评分"
        >
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`${s} 星`}
              className="transition-transform hover:scale-110 focus-visible:outline-none"
              onMouseEnter={() => setHoverScore(s)}
              onClick={() => setValue('score', s, { shouldValidate: true })}
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-colors',
                  (hoverScore || score) >= s
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-none text-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>
        {errors.score && (
          <p className="text-xs text-destructive">{errors.score.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">评论（选填）</Label>
        <Textarea
          id="content"
          placeholder="写下您的使用感受…"
          rows={3}
          {...register('content')}
        />
        {errors.content && (
          <p className="text-xs text-destructive">{errors.content.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? '提交中…' : existingScore ? '更新评分' : '提交评分'}
      </Button>
    </form>
  )
}
