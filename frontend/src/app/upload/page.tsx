'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Upload, FileText, X } from 'lucide-react'
import { uploadMaterial } from '@/lib/api/materials'
import { getErrorMessage } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const STAGE_OPTIONS = ['小学', '初中', '高中', '大学', '职教']
const SUBJECT_OPTIONS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '信息技术']
const ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.zip', '.txt']
const MAX_SIZE_MB = 50

const schema = z.object({
  title: z.string().min(2, '标题至少 2 个字符').max(120, '标题最多 120 个字符'),
  description: z.string().max(1000, '简介最多 1000 个字符').optional(),
  stage: z.string().optional(),
  grade: z.string().max(50).optional(),
  subject: z.string().optional(),
  year: z.string().optional(),
  region: z.string().max(50).optional(),
})
type FormValues = z.infer<typeof schema>

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    setError,
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const { mutate, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      if (!file) throw new Error('请选择文件')
      return uploadMaterial({
        ...values,
        year: values.year ? Number(values.year) : undefined,
        file,
      })
    },
    onSuccess: (data) => {
      toast({
        title: '上传成功',
        description: '资料已提交，等待管理员审核后公开',
      })
      router.push(`/materials`)
    },
    onError: (err) => {
      setError('root', { message: getErrorMessage(err) })
    },
  })

  const validateFile = (f: File): string => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) return `不支持的文件格式，请上传 ${ALLOWED_EXTS.join(' ')}`
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return `文件不能超过 ${MAX_SIZE_MB}MB`
    return ''
  }

  const handleFileChange = (f: File | null) => {
    if (!f) { setFile(null); return }
    const err = validateFile(f)
    if (err) { setFileError(err); return }
    setFileError('')
    setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFileChange(dropped)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">上传资料</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          提交后由管理员审核，审核通过后对所有用户公开
        </p>
      </div>

      <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-6">
        {/* File drop zone */}
        <div className="space-y-1.5">
          <Label>文件 *</Label>
          <div
            role="button"
            tabIndex={0}
            className={cn(
              'relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors',
              dragOver
                ? 'border-foreground bg-accent'
                : 'border-border hover:border-foreground/40 hover:bg-accent/30',
              file && 'border-foreground/30 bg-muted/30',
            )}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ALLOWED_EXTS.join(',')}
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <>
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  type="button"
                  className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted"
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  aria-label="移除文件"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">点击或拖拽文件到此处</p>
                  <p className="text-xs text-muted-foreground">
                    支持 {ALLOWED_EXTS.join(' ')}，最大 {MAX_SIZE_MB}MB
                  </p>
                </div>
              </>
            )}
          </div>
          {fileError && <p className="text-xs text-destructive">{fileError}</p>}
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="title">标题 *</Label>
          <Input id="title" placeholder="例：2024年高考数学模拟题（全国卷）" {...register('title')} />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">简介</Label>
          <Textarea
            id="description"
            placeholder="描述资料的主要内容、适用范围等…"
            rows={3}
            {...register('description')}
          />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description.message}</p>
          )}
        </div>

        {/* Meta fields grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>学段</Label>
            <Select onValueChange={(v) => setValue('stage', v)}>
              <SelectTrigger>
                <SelectValue placeholder="选择学段" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grade">年级</Label>
            <Input id="grade" placeholder="例：高一、Grade 10" {...register('grade')} />
          </div>

          <div className="space-y-1.5">
            <Label>学科</Label>
            <Select onValueChange={(v) => setValue('subject', v)}>
              <SelectTrigger>
                <SelectValue placeholder="选择学科" />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="year">年份</Label>
            <Input
              id="year"
              type="number"
              placeholder="例：2024"
              min={1900}
              max={2100}
              {...register('year')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="region">地区</Label>
            <Input id="region" placeholder="例：CN-GD、广东省" {...register('region')} />
          </div>
        </div>

        {errors.root && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errors.root.message}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={isPending || !file}>
          <Upload className="mr-2 h-4 w-4" />
          {isPending ? '上传中…' : '提交审核'}
        </Button>
      </form>
    </div>
  )
}
