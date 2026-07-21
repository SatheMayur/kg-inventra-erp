import { describe, it, expect } from 'vitest'
import {
  lineStatusAfterIssue,
  rollupRequestStatus,
  assertIssuable,
  flattenRequest,
  getRequestNextAction,
} from './request-fulfillment'

describe('lineStatusAfterIssue', () => {
  it('stays Approved when nothing issued yet', () => {
    expect(lineStatusAfterIssue(5, 0)).toBe('Approved')
  })
  it('is PartiallyIssued when some but not all issued', () => {
    expect(lineStatusAfterIssue(5, 2)).toBe('PartiallyIssued')
  })
  it('is Issued when the full approved qty is issued', () => {
    expect(lineStatusAfterIssue(5, 5)).toBe('Issued')
  })
})

describe('rollupRequestStatus', () => {
  it('is Pending for an empty request', () => {
    expect(rollupRequestStatus([])).toBe('Pending')
  })
  it('is Approved when lines are approved but none issued', () => {
    expect(rollupRequestStatus([
      { requestedQty: 5, approvedQty: 5, issuedQty: 0, status: 'Approved' },
      { requestedQty: 2, approvedQty: 2, issuedQty: 0, status: 'Approved' },
    ])).toBe('Approved')
  })
  it('stays CONVERTED_TO_PO when approved lines still have pending purchase qty', () => {
    expect(rollupRequestStatus([
      { requestedQty: 10, approvedQty: 10, issuedQty: 0, status: 'Approved', pendingPurchaseQty: 4 },
    ])).toBe('CONVERTED_TO_PO')
  })
  it('is PartiallyIssued when one line is partly issued', () => {
    expect(rollupRequestStatus([
      { requestedQty: 5, approvedQty: 5, issuedQty: 5, status: 'Issued' },
      { requestedQty: 2, approvedQty: 2, issuedQty: 0, status: 'Approved' },
    ])).toBe('PartiallyIssued')
  })
  it('is Issued only when every approved line is fully issued', () => {
    expect(rollupRequestStatus([
      { requestedQty: 5, approvedQty: 5, issuedQty: 5, status: 'Issued' },
      { requestedQty: 2, approvedQty: 2, issuedQty: 2, status: 'Issued' },
    ])).toBe('Issued')
  })
  it('ignores rejected/cancelled lines when rolling up', () => {
    expect(rollupRequestStatus([
      { requestedQty: 5, approvedQty: 5, issuedQty: 5, status: 'Issued' },
      { requestedQty: 2, approvedQty: 0, issuedQty: 0, status: 'Rejected' },
    ])).toBe('Issued')
  })
  it('is Cancelled when every line is cancelled/rejected', () => {
    expect(rollupRequestStatus([
      { requestedQty: 5, approvedQty: 0, issuedQty: 0, status: 'Cancelled' },
    ])).toBe('Cancelled')
  })
})

describe('assertIssuable', () => {
  it('allows issuing up to the unissued approved balance', () => {
    expect(() => assertIssuable(5, 2, 3)).not.toThrow()
  })
  it('rejects issuing more than the approved balance', () => {
    expect(() => assertIssuable(5, 2, 4)).toThrow(/approved and unissued/i)
  })
  it('rejects non-positive or fractional quantities', () => {
    expect(() => assertIssuable(5, 0, 0)).toThrow(/positive integer/i)
    expect(() => assertIssuable(5, 0, 1.5)).toThrow(/positive integer/i)
  })
})

describe('flattenRequest', () => {
  it('exposes the single line item name, id and total qty', () => {
    const r = flattenRequest({ id: 'r1', lines: [{ itemId: 'i1', itemName: 'Bolt', requestedQty: 5 }] })
    expect(r.itemName).toBe('Bolt')
    expect(r.itemId).toBe('i1')
    expect(r.qty).toBe(5)
  })
  it('summarises multiple lines as "first +N more" with summed qty', () => {
    const r = flattenRequest({ id: 'r2', lines: [
      { itemId: 'i1', itemName: 'Bolt', requestedQty: 5 },
      { itemId: 'i2', itemName: 'Nut', requestedQty: 3 },
    ] })
    expect(r.itemName).toBe('Bolt +1 more')
    expect(r.qty).toBe(8)
  })
  it('is safe for a request with no lines', () => {
    const r = flattenRequest({ id: 'r3', lines: [] })
    expect(r.itemName).toBe('')
    expect(r.itemId).toBe('')
    expect(r.qty).toBe(0)
  })
})

describe('getRequestNextAction', () => {
  it('points approval-stage requests to the department head', () => {
    expect(getRequestNextAction({
      status: 'UNDER_REVIEW',
      department: 'R & D',
      lines: [{ requestedQty: 10, approvedQty: 0, issuedQty: 0 }],
    })).toMatchObject({
      label: 'Approve Request',
      owner: 'Dept. Head (R & D)',
      tone: 'warning',
    })
  })

  it('asks purchase to create a PO when approved lines still need buying', () => {
    expect(getRequestNextAction({
      status: 'Approved',
      lines: [{ requestedQty: 10, approvedQty: 10, issuedQty: 0, availableQty: 0, pendingPurchaseQty: 10 }],
    })).toMatchObject({
      label: 'Create PO',
      owner: 'Purchase Department',
      tone: 'warning',
    })
  })

  it('asks store and purchase to receive PO stock after conversion', () => {
    expect(getRequestNextAction({
      status: 'CONVERTED_TO_PO',
      lines: [{ requestedQty: 10, approvedQty: 10, issuedQty: 0, availableQty: 0, pendingPurchaseQty: 10 }],
    })).toMatchObject({
      label: 'Receive PO Stock',
      owner: 'Store / Purchase',
      tone: 'warning',
    })
  })

  it('asks store to issue when PO receipt has reserved stock', () => {
    expect(getRequestNextAction({
      status: 'Approved',
      lines: [{ requestedQty: 10, approvedQty: 10, issuedQty: 0, availableQty: 10, pendingPurchaseQty: 0 }],
    })).toMatchObject({
      label: 'Proceed to Issue',
      owner: 'Store Admin / Operator',
      tone: 'success',
    })
  })

  it('shows split action when some stock is ready and some is still pending purchase', () => {
    expect(getRequestNextAction({
      status: 'CONVERTED_TO_PO',
      lines: [{ requestedQty: 10, approvedQty: 10, issuedQty: 0, availableQty: 4, pendingPurchaseQty: 6 }],
    })).toMatchObject({
      label: 'Issue Ready Qty / Track PO Balance',
      owner: 'Store Admin / Operator',
      tone: 'warning',
    })
  })
})
