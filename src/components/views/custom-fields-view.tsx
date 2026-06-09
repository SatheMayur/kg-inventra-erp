'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sliders, Plus, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface FieldDef {
  id: string
  name: string
  type: 'text' | 'number' | 'date' | 'boolean'
  required: boolean
}

const TYPE_BADGE: Record<FieldDef['type'], string> = {
  text: 'border-blue-500/20 text-blue-700 bg-blue-500/10',
  number: 'border-green-500/20 text-green-700 bg-green-500/10',
  date: 'border-purple-500/20 text-purple-700 bg-purple-500/10',
  boolean: 'border-amber-500/20 text-amber-700 bg-amber-500/10',
}

const FIELD_TYPES: { value: FieldDef['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
]

function SimulatedFieldInput({ type }: { type: FieldDef['type'] }) {
  if (type === 'boolean') {
    return (
      <Select>
        <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
          <SelectValue placeholder="Yes / No" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  return (
    <Input
      type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
      placeholder={type === 'date' ? '' : `Enter ${type}…`}
      className="h-8 text-xs bg-background/50 border-border/50"
      disabled
    />
  )
}

export default function CustomFieldsView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [fields, setFields] = useState<FieldDef[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Add form state
  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState<FieldDef['type']>('text')
  const [addRequired, setAddRequired] = useState(false)
  const [adding, setAdding] = useState(false)

  const fetchFields = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/custom-fields')
      if (!res.ok) throw new Error('Failed to load field definitions')
      const data = await res.json()
      setFields(data.fields ?? [])
    } catch {
      toast.error('Could not load custom field definitions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFields()
  }, [fetchFields])

  async function handleAdd() {
    if (!addName.trim()) {
      toast.error('Field name is required')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), type: addType, required: addRequired }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to add field')
      }
      toast.success(`Field "${addName.trim()}" added`)
      setAddName('')
      setAddType('text')
      setAddRequired(false)
      fetchFields()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add field')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id)
    try {
      const res = await fetch('/api/custom-fields', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to delete field')
      }
      toast.success(`Field "${name}" removed`)
      fetchFields()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete field')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Sliders className="size-5" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Custom Fields</span>
        </div>
        <h2 className="text-4xl font-extrabold tracking-tighter">Custom Field Definitions</h2>
        <p className="text-muted-foreground">
          Define extra fields that appear on every item. Values are stored per item.
        </p>
      </div>

      {/* Section 1 — Field Definitions */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader className="px-6 py-4 border-b border-border/30">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Defined Fields
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">Name</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">Type</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">Required</TableHead>
                  {isAdmin && (
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={isAdmin ? 4 : 3} className="h-12 animate-pulse bg-muted/10" />
                    </TableRow>
                  ))
                ) : fields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 4 : 3} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                        <Sliders className="size-8 opacity-20" />
                        <p className="text-sm">No custom fields defined yet.</p>
                        {isAdmin && (
                          <p className="text-xs text-muted-foreground/60">Use the form below to add your first field.</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  fields.map((field) => (
                    <TableRow key={field.id} className="group border-border/20 hover:bg-primary/5 transition-colors">
                      <TableCell className="font-medium text-sm">{field.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${TYPE_BADGE[field.type]}`}>
                          {field.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {field.required ? (
                          <Badge variant="outline" className="text-[10px] border-rose-500/20 text-rose-700 bg-rose-500/10">
                            Required
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Optional</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(field.id, field.name)}
                            disabled={deletingId === field.id}
                          >
                            {deletingId === field.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Add Field Form — admin only */}
          {isAdmin && (
            <div className="px-6 py-5 border-t border-border/30 bg-muted/10">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Add Field
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5 flex-1 min-w-[180px]">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                    Field Name *
                  </Label>
                  <Input
                    placeholder="e.g. Supplier Code"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    className="bg-background border-border h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5 w-36">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                    Type
                  </Label>
                  <Select value={addType} onValueChange={(v) => setAddType(v as FieldDef['type'])}>
                    <SelectTrigger className="bg-background border-border h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                    Required
                  </Label>
                  <Button
                    variant={addRequired ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 px-4 text-xs"
                    onClick={() => setAddRequired((r) => !r)}
                    type="button"
                  >
                    {addRequired ? 'Yes' : 'No'}
                  </Button>
                </div>

                <Button
                  className="h-9 rounded-xl gap-2 shadow-sm shadow-primary/20 shrink-0"
                  onClick={handleAdd}
                  disabled={adding || !addName.trim()}
                >
                  {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add Field
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Preview */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardHeader className="px-6 py-4 border-b border-border/30">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Preview / Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            This is how custom fields will appear when editing an item.
          </p>

          {fields.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-muted-foreground">
              <Sliders className="size-8 opacity-20 mx-auto mb-2" />
              <p className="text-sm">No fields to preview. Add fields above.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-muted/5 p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Sample Item — Custom Fields
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                      {field.name}
                      {field.required && (
                        <span className="text-rose-500">*</span>
                      )}
                    </Label>
                    <SimulatedFieldInput type={field.type} />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 pt-1">
                Custom field values are editable on each item.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
