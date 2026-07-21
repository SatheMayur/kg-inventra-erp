'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, UserPlus, Pen, Key, Ban, Check, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { api, UserResponse } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

const DEPARTMENTS = [
  'Admin', 'Account', 'Auto_Polish', 'BMS', 'CLV', 'DNA', 'Fancy', 'Galaxy',
  'Hardware', 'HR', 'HRD', 'Lab', 'Laser', 'Manual Round', 'Marketing',
  'Program', 'R & D', 'Recut', 'Rough analysis', 'Security', 'Software',
  'SPC_IT', 'Stock control', 'Store Manager', 'Xray',
]

const FLOORS = [
  'Entry_Exit_Gate', 'FF-B1', 'FF-B2', 'FF-B3', 'FF-B4', 'FF-B5',
  'GF-B2', 'GF-B3', 'SF-B2', 'SF-B6', 'SF02',
]

const ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
  { value: 'STORE_ADMIN', label: 'Store Admin' },
  { value: 'STORE_OPERATOR', label: 'Store Operator' },
  { value: 'DEPT_USER', label: 'Dept User' },
  { value: 'DEPT_HEAD', label: 'Dept Head' },
  { value: 'PURCHASE_USER', label: 'Purchase User' },
  { value: 'ACCOUNTS_USER', label: 'Accounts User' },
  { value: 'MANAGEMENT', label: 'Management' },
]

function getRoleBadge(role: string, isDeptHead?: boolean) {
  const map: Record<string, { label: string, classes: string }> = {
    admin: { label: 'Admin', classes: 'bg-amber-500/10 text-amber-700 border-amber-500/20 hover:bg-amber-500/15' },
    employee: { label: 'Employee', classes: 'bg-sky-500/10 text-sky-700 border-sky-500/20 hover:bg-sky-500/15' },
    STORE_ADMIN: { label: 'Store Admin', classes: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 hover:bg-indigo-500/15' },
    STORE_OPERATOR: { label: 'Store Operator', classes: 'bg-violet-500/10 text-violet-700 border-violet-500/20 hover:bg-violet-500/15' },
    DEPT_USER: { label: 'Dept User', classes: 'bg-teal-500/10 text-teal-700 border-teal-500/20 hover:bg-teal-500/15' },
    DEPT_HEAD: { label: 'Dept Head', classes: 'bg-purple-500/10 text-purple-700 border-purple-500/20 hover:bg-purple-500/15' },
    PURCHASE_USER: { label: 'Purchase User', classes: 'bg-pink-500/10 text-pink-700 border-pink-500/20 hover:bg-pink-500/15' },
    ACCOUNTS_USER: { label: 'Accounts User', classes: 'bg-rose-500/10 text-rose-700 border-rose-500/20 hover:bg-rose-500/15' },
    MANAGEMENT: { label: 'Management', classes: 'bg-blue-500/10 text-blue-700 border-blue-500/20 hover:bg-blue-500/15' },
  }
  const config = map[role] || { label: role, classes: 'bg-slate-500/10 text-slate-700 border-slate-500/20' }
  return (
    <div className="flex flex-wrap gap-1 items-center">
      <Badge className={config.classes}>
        {config.label}
      </Badge>
      {isDeptHead && (
        <Badge className="bg-purple-500/10 text-purple-700 border-purple-500/20 hover:bg-purple-500/15">
          Dept Head
        </Badge>
      )}
    </div>
  )
}

interface UserWithRequests extends UserResponse {
  requestCount?: number
}

export default function UsersView() {
  const user = useAppStore((s) => s.user)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const [users, setUsers] = useState<UserWithRequests[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptsList, setDeptsList] = useState<string[]>([])

  // Dialogs
  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserWithRequests | null>(null)
  const [resetUser, setResetUser] = useState<UserWithRequests | null>(null)
  const [deactivateUser, setDeactivateUser] = useState<UserWithRequests | null>(null)

  // Add form — password intentionally empty to force admin to set one
  const [addName, setAddName] = useState('')
  const [addEmpId, setAddEmpId] = useState('')
  const [addDept, setAddDept] = useState('Admin')
  const [addFloor, setAddFloor] = useState('SF-B2')
  const [addRole, setAddRole] = useState('employee')
  const [addIsDeptHead, setAddIsDeptHead] = useState(false)
  const [addPassword, setAddPassword] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Edit form
  const [editName, setEditName] = useState('')
  const [editDept, setEditDept] = useState('')
  const [editFloor, setEditFloor] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editIsDeptHead, setEditIsDeptHead] = useState(false)
  const [editLoading, setEditLoading] = useState(false)

  // Reset password form
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.users.list()
      setUsers(data)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    async function loadDepts() {
      try {
        const list = await api.departments.list()
        setDeptsList(list)
        if (list.length > 0 && !list.includes(addDept)) {
          setAddDept(list[0])
        }
      } catch {
        setDeptsList(DEPARTMENTS)
      }
    }
    loadDepts()
  }, [])

  // Client-side filter across name, empId, department
  const filtered = search
    ? users.filter((u) => {
        const q = search.toLowerCase()
        return (
          u.name.toLowerCase().includes(q) ||
          u.empId.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q)
        )
      })
    : users

  function openEdit(u: UserWithRequests) {
    setEditUser(u)
    setEditName(u.name)
    setEditDept(u.department)
    setEditFloor(u.floor)
    setEditRole(u.role)
    setEditIsDeptHead(!!u.isDeptHead)
  }

  function resetAddForm() {
    setAddName('')
    setAddEmpId('')
    setAddDept('Admin')
    setAddFloor('SF-B2')
    setAddRole('employee')
    setAddPassword('')
    setAddIsDeptHead(false)
  }

  async function handleAdd() {
    if (!addName.trim() || !addEmpId.trim()) {
      toast.error('Name and Employee ID are required')
      return
    }
    if (addPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    try {
      setAddLoading(true)
      await api.users.create({
        empId: addEmpId.toLowerCase().trim(),
        name: addName.trim(),
        department: addDept,
        floor: addFloor,
        role: addRole,
        isDeptHead: addIsDeptHead,
        password: addPassword,
      })
      toast.success('Employee added successfully')
      setAddOpen(false)
      resetAddForm()
      fetchUsers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add employee')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleEdit() {
    if (!editUser || !editName.trim()) {
      toast.error('Name is required')
      return
    }
    try {
      setEditLoading(true)
      const updated = await api.users.update(editUser.id, {
        name: editName.trim(),
        department: editDept,
        floor: editFloor,
        role: editRole,
        isDeptHead: editIsDeptHead,
      })
      if (editUser.id === user?.id && editUser.role === 'admin' && editRole === 'employee') {
        useAppStore.getState().setUser({ ...user!, role: 'employee' as const })
        toast.success('Role updated — redirecting to dashboard')
        setEditUser(null)
        setCurrentView('dashboard')
        return
      }
      toast.success('User updated successfully')
      setEditUser(null)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!resetUser || newPassword.trim().length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    try {
      setResetLoading(true)
      await api.users.resetPassword(resetUser.id, newPassword.trim())
      toast.success('Password reset successfully')
      setResetUser(null)
      setNewPassword('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetLoading(false)
    }
  }

  async function handleToggleActive(u: UserWithRequests) {
    try {
      const updated = await api.users.toggleActive(u.id)
      setUsers((prev) => prev.map((usr) => (usr.id === updated.id ? { ...usr, ...updated } : usr)))
      toast.success(`${u.name} is now ${updated.active ? 'active' : 'inactive'}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle status')
    }
  }

  const isSelf = (u: UserWithRequests | null) => u?.id === user?.id

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">User Management</h3>
          {!loading && (
            <Badge variant="secondary" className="ml-1">
              {filtered.length}{search ? ` / ${users.length}` : ''} users
            </Badge>
          )}
        </div>
        <Button
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setAddOpen(true)}
        >
          <UserPlus className="size-4" />
          Add Employee
        </Button>
      </div>

      {/* Search bar */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search by name, employee ID, or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-background border-border"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0 divide-y divide-border/30">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="mb-3 size-10 opacity-30" />
              <p className="text-sm">{search ? 'No users match your search' : 'No users found'}</p>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Emp ID</TableHead>
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">Department</TableHead>
                    <TableHead className="text-muted-foreground">Floor</TableHead>
                    <TableHead className="text-muted-foreground">Role</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{u.empId}</TableCell>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.department}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{u.floor}</TableCell>
                      <TableCell>
                        {getRoleBadge(u.role, u.isDeptHead)}
                      </TableCell>
                      <TableCell>
                        <Badge className={u.active
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/100/15'
                          : 'bg-stone-500/10 text-stone-500 border-stone-500/20 hover:bg-stone-500/15'
                        }>
                          {u.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(u)}>
                                  <Pen className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit user</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" onClick={() => { setResetUser(u); setNewPassword('') }}>
                                  <Key className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reset password</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          {!isSelf(u) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`size-8 ${u.active
                                      ? 'text-rose-700 hover:text-rose-800 hover:bg-rose-500/10'
                                      : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/10'
                                    }`}
                                    onClick={() => u.active ? setDeactivateUser(u) : handleToggleActive(u)}
                                  >
                                    {u.active ? <Ban className="size-3.5" /> : <Check className="size-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{u.active ? 'Deactivate' : 'Activate'}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add Employee Dialog ─────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>Create a new employee account in the system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" placeholder="Full name" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-empid">Employee ID</Label>
              <Input id="add-empid" placeholder="e.g. pappu" value={addEmpId} onChange={(e) => setAddEmpId(e.target.value.toLowerCase())} className="lowercase" />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={addDept} onValueChange={setAddDept}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {deptsList.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Select value={addFloor} onValueChange={setAddFloor}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FLOORS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 py-1">
              <input
                type="checkbox"
                id="add-is-dept-head"
                checked={addIsDeptHead}
                onChange={(e) => setAddIsDeptHead(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="add-is-dept-head" className="cursor-pointer text-sm font-medium">
                Is Department Head
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-password">Password</Label>
              <Input id="add-password" type="password" placeholder="Set initial password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addLoading || !addName.trim() || !addEmpId.trim() || addPassword.length < 6}>
              {addLoading ? 'Adding…' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information for {editUser?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={editDept} onValueChange={setEditDept}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {deptsList.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Select value={editFloor} onValueChange={setEditFloor}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FLOORS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 py-1">
              <input
                type="checkbox"
                id="edit-is-dept-head"
                checked={editIsDeptHead}
                onChange={(e) => setEditIsDeptHead(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="edit-is-dept-head" className="cursor-pointer text-sm font-medium">
                Is Department Head
              </Label>
            </div>
            {isSelf(editUser) && editRole === 'employee' && editUser?.role === 'admin' && (
              <p className="text-xs text-amber-500">⚠ Changing your own role to Employee will redirect you away from admin views.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editLoading}>{editLoading ? 'Saving…' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate Confirmation ─────────────────────── */}
      <AlertDialog open={!!deactivateUser} onOpenChange={(o) => { if (!o) setDeactivateUser(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="size-5 text-rose-500" />
              Deactivate User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate <strong>{deactivateUser?.name}</strong>? They will not be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (deactivateUser) { await handleToggleActive(deactivateUser); setDeactivateUser(null) } }}
              className="bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset Password Dialog ───────────────────────── */}
      <Dialog open={!!resetUser} onOpenChange={(o) => { if (!o) { setResetUser(null); setNewPassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for {resetUser?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetLoading || newPassword.length < 6}>
              {resetLoading ? 'Resetting…' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
