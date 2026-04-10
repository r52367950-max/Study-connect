'use client'

import Link from 'next/link'
import { LogIn } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface LoginPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  message?: string
}

export function LoginPromptDialog({
  open,
  onOpenChange,
  message = '登录后即可使用此功能',
}: LoginPromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <LogIn className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle className="text-center">请先登录</DialogTitle>
          <DialogDescription className="text-center">{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" asChild>
            <Link href="/login">登录账号</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/register">免费注册</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
