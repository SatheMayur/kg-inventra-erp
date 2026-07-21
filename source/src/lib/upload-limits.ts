import { ApiError } from './api-utils'

export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024

export function assertSpreadsheetSize(file: Pick<Blob, 'size'>) {
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new ApiError(413, 'Spreadsheet exceeds the 10 MB upload limit', 'PAYLOAD_TOO_LARGE')
  }
}
