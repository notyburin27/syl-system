import { TransportDocument, AuthUser } from '@prisma/client'

// Form data type (without database metadata)
export type TransportFormData = {
  date: Date | null
  customerName: string
  booking: string
  agent: string
  shipName: string
  invoice: string
  containerSize: string
  containerNumber: string
  sealNumber: string
  shipping: string
  pickupLocation: string
  returnLocation: string
  closingTime: Date | null
  factoryTime: string
  loadingSlot: string
  driverName: string
  vehicleRegistration: string
  phoneNumber: string
  remarks: string
}

// Form state (in-memory, before saving to database)
export interface FormState {
  id: number
  title: string
  hasErrors: boolean
  hasUnsavedChanges: boolean
  data: TransportFormData
  documentId?: string // Database ID (if saved)
}

// Document with creator info
export type DocumentWithCreator = TransportDocument & {
  createdBy: Pick<AuthUser, 'id' | 'name' | 'username'>
}

// Validation result
export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

// Form validation result
export interface FormValidationResult {
  formId: number
  title: string
  validation: ValidationResult
}
