'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Tag,
  Plus,
  Trash2,
  Loader2,
  Hash,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface TagWithCount {
  id: string
  name: string
  color: string
  createdAt: string
  itemCount: number
}

async function fetchTags(): Promise<TagWithCount[]> {
  const res = await fetch('/api/tags')
  if (!res.ok) throw new Error('Failed to load tags')
  const data = await res.json()
  return data.tags
}

async function createTag(name: string, color: string): Promise<TagWithCount> {
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to create tag')
  return data.tag
}

async function deleteTag(id: string): Promise<void> {
  const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? 'Failed to delete tag')
  }
}

export default function TagsView() {
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<TagWithCount | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadTags = useCallback(async () => {
    setLoading(true)
    try {
      setTags(await fetchTags())
    } catch {
      toast.error('Failed to load tags')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Tag name is required')
      return
    }
    setSaving(true)
    try {
      await createTag(newName.trim(), newColor)
      toast.success(`Tag "${newName.trim()}" created`)
      setNewName('')
      setNewColor('#6366f1')
      await loadTags()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tag')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTag(deleteTarget.id)
      toast.success(`Tag "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      await loadTags()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete tag')
    } finally {
      setDeleting(false)
    }
  }

  const totalTags = tags.length
  const mostUsed = tags.length > 0
    ? tags.reduce((a, b) => (a.itemCount >= b.itemCount ? a : b))
    : null

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Tag className="size-5" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Tags & Folders</span>
        </div>
        <h2 className="text-4xl font-extrabold tracking-tighter">Tags & Folders</h2>
        <p className="text-muted-foreground">
          Organise items with colour-coded tags for quick filtering and grouping.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Hash className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Total Tags</p>
              <p className="text-2xl font-bold">{loading ? '—' : totalTags}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div
              className="size-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: mostUsed ? `${mostUsed.color}22` : undefined }}
            >
              <Tag className="size-5" style={{ color: mostUsed?.color ?? 'currentColor' }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Most Used Tag</p>
              {loading ? (
                <p className="text-2xl font-bold">—</p>
              ) : mostUsed ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    className="text-[11px] font-semibold px-2 py-0.5"
                    style={{ backgroundColor: `${mostUsed.color}22`, color: mostUsed.color, border: `1px solid ${mostUsed.color}40` }}
                  >
                    {mostUsed.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{mostUsed.itemCount} items</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tags yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create tag inline form */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-4">New Tag</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2 flex-1 min-w-[180px]">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Tag Name *
              </Label>
              <Input
                placeholder="e.g. Perishable, High Value…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                className="bg-background border-border h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Colour
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-10 w-10 rounded-lg border border-border cursor-pointer bg-background p-0.5"
                  title="Pick tag colour"
                />
                <span className="text-xs font-mono text-muted-foreground">{newColor}</span>
              </div>
            </div>
            <Button
              className="rounded-xl shadow-lg shadow-primary/20 gap-2 h-10"
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create Tag
            </Button>
          </div>
          {/* Live preview */}
          {newName.trim() && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Preview:</span>
              <Badge
                className="text-[11px] font-semibold px-2 py-0.5"
                style={{ backgroundColor: `${newColor}22`, color: newColor, border: `1px solid ${newColor}40` }}
              >
                {newName.trim()}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tag list table */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-[10px] uppercase font-bold tracking-wider w-12">Colour</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Tag Name</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Item Count</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4} className="h-14 animate-pulse bg-muted/10" />
                  </TableRow>
                ))
              ) : tags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <Tag className="size-10 opacity-20" />
                      <p className="text-sm">No tags yet.</p>
                      <p className="text-xs text-muted-foreground/60">Create your first tag above.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                tags.map((tag) => (
                  <TableRow
                    key={tag.id}
                    className="group border-border/20 hover:bg-primary/5 transition-colors"
                  >
                    <TableCell>
                      <span
                        className="block size-6 rounded-md border border-border/40"
                        style={{ backgroundColor: tag.color }}
                        title={tag.color}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="text-[11px] font-semibold px-2 py-0.5"
                        style={{
                          backgroundColor: `${tag.color}22`,
                          color: tag.color,
                          border: `1px solid ${tag.color}40`,
                        }}
                      >
                        {tag.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold">{tag.itemCount}</span>
                        <span className="text-[10px] text-muted-foreground">items</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-destructive/20 text-destructive hover:bg-destructive/10 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setDeleteTarget(tag)}
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" /> Delete Tag
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>&ldquo;{deleteTarget?.name}&rdquo;</strong>?
              {deleteTarget && deleteTarget.itemCount > 0 && (
                <span className="block mt-2 text-amber-600 font-medium">
                  This tag is assigned to {deleteTarget.itemCount} item
                  {deleteTarget.itemCount !== 1 ? 's' : ''}. Removing it will
                  unlink it from all those items.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl gap-2"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
