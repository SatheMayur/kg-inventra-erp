import { describe, it, expect } from 'vitest'
import { canApproveRequest } from './approval'

const admin = { id: 'a', role: 'admin', department: 'IT', isDeptHead: false }
const itHead = { id: 'h', role: 'employee', department: 'IT', isDeptHead: true }
const itStaff = { id: 's', role: 'employee', department: 'IT', isDeptHead: false }
const hrHead = { id: 'x', role: 'employee', department: 'HR', isDeptHead: true }

describe('canApproveRequest', () => {
  it('admin can approve any department', () => {
    expect(canApproveRequest(admin, 'HR')).toBe(true)
  })
  it('dept head can approve own department', () => {
    expect(canApproveRequest(itHead, 'IT')).toBe(true)
  })
  it('dept head cannot approve another department', () => {
    expect(canApproveRequest(hrHead, 'IT')).toBe(false)
  })
  it('ordinary employee cannot approve', () => {
    expect(canApproveRequest(itStaff, 'IT')).toBe(false)
  })
})
