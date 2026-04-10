import Link from 'next/link'
import { Download, Star } from 'lucide-react'
import type { MaterialListItem } from '@/types'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime, formatScore } from '@/lib/utils'

interface MaterialCardProps {
  material: MaterialListItem
}

export function MaterialCard({ material }: MaterialCardProps) {
  return (
    <Link href={`/materials/${material.id}`} className="group block">
      <article className="h-full rounded-xl border bg-card p-5 transition-all duration-150 hover:border-foreground/20 hover:shadow-md">
        {/* Tags row */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {material.subject && (
            <Badge variant="secondary" className="text-[11px]">
              {material.subject}
            </Badge>
          )}
          {material.stage && (
            <Badge variant="outline" className="text-[11px]">
              {material.stage}
            </Badge>
          )}
          {material.grade && (
            <Badge variant="outline" className="text-[11px]">
              {material.grade}
            </Badge>
          )}
          {material.year && (
            <Badge variant="outline" className="text-[11px]">
              {material.year}年
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-snug tracking-tight group-hover:underline group-hover:underline-offset-2">
          {material.title}
        </h3>

        {/* Description */}
        {material.description && (
          <p className="mb-3 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
            {material.description}
          </p>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {formatScore(material.avg_score)}
            </span>
            <span className="flex items-center gap-0.5">
              <Download className="h-3 w-3" />
              {material.download_count ?? 0}
            </span>
          </div>
          <span title={material.createdAt}>
            {material.uploader?.username && (
              <span className="mr-1 font-medium text-foreground/60">
                {material.uploader.username}
              </span>
            )}
            {formatRelativeTime(material.createdAt)}
          </span>
        </div>
      </article>
    </Link>
  )
}
