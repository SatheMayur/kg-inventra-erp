export interface Approver {
  id: string
  role: string
  department: string
  isDeptHead: boolean
}

/**
 * True if `user` may approve (or mark ready) a request belonging to
 * `requestDepartment`. Admins approve anything; a department head approves only
 * requests from their own department. Ordinary employees cannot approve.
 */
export function canApproveRequest(user: Approver, requestDepartment: string): boolean {
  if (user.role === 'admin' || user.role === 'STORE_ADMIN' || user.role === 'MANAGEMENT') return true
  return (
    (user.role === 'DEPT_HEAD' || user.isDeptHead) &&
    user.department === requestDepartment
  )
}
