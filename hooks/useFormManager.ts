import { useState, useCallback } from 'react'
import { FormState, TransportFormData, ValidationResult, FormValidationResult } from '@/types/document'

// Initial empty form data
const createEmptyFormData = (): TransportFormData => ({
  date: null,
  customerName: '',
  booking: '',
  agent: '',
  shipName: '',
  invoice: '',
  containerSize: '',
  containerNumber: '',
  sealNumber: '',
  shipping: '',
  pickupLocation: '',
  returnLocation: '',
  closingTime: null,
  factoryTime: '',
  loadingSlot: '',
  driverName: '',
  vehicleRegistration: '',
  phoneNumber: '',
  remarks: '',
})

// Create empty form structure
const createEmptyForm = (id: number): FormState => ({
  id,
  title: `เอกสารขนส่ง #${id}`,
  hasErrors: false,
  hasUnsavedChanges: false,
  data: createEmptyFormData(),
})

export const useFormManager = () => {
  const [forms, setForms] = useState<FormState[]>([createEmptyForm(1)])
  const [activeFormId, setActiveFormId] = useState<number>(1)
  const [nextId, setNextId] = useState<number>(2)

  // Add new empty form
  const addForm = useCallback(() => {
    const newForm = createEmptyForm(nextId)
    setForms((prev) => [...prev, newForm])
    setActiveFormId(nextId)
    const currentId = nextId
    setNextId((prev) => prev + 1)
    return currentId
  }, [nextId])

  // Add new form with initial data
  const addFormWithData = useCallback(
    (initialData: Partial<TransportFormData> = {}, title?: string, documentId?: string) => {
      const currentId = nextId
      const newForm: FormState = {
        ...createEmptyForm(currentId),
        title: title || `เอกสารขนส่ง #${currentId}`,
        data: {
          ...createEmptyFormData(),
          ...initialData,
        },
        documentId,
        hasUnsavedChanges: false, // Just loaded from DB
      }
      setForms((prev) => [...prev, newForm])
      setActiveFormId(currentId)
      setNextId((prev) => prev + 1)
      return currentId
    },
    [nextId]
  )

  // Delete form (minimum 1 form required)
  const deleteForm = useCallback(
    (formId: number) => {
      setForms((prev) => {
        const filteredForms = prev.filter((form) => form.id !== formId)

        // If we deleted the active form, switch to first available
        if (formId === activeFormId && filteredForms.length > 0) {
          setActiveFormId(filteredForms[0].id)
        }

        return filteredForms
      })
    },
    [activeFormId]
  )

  // Add multiple forms with data (for bulk import)
  const addMultipleFormsWithData = useCallback(
    (formsData: Array<{ data: Partial<TransportFormData>; title?: string }>) => {
      const newForms: FormState[] = []
      let currentId = nextId

      formsData.forEach((formInfo) => {
        const newForm: FormState = {
          ...createEmptyForm(currentId),
          title: formInfo.title || `เอกสารขนส่ง #${currentId}`,
          data: {
            ...createEmptyFormData(),
            ...formInfo.data,
          },
          hasUnsavedChanges: false,
        }
        newForms.push(newForm)
        currentId++
      })

      setForms(newForms)
      if (newForms.length > 0) {
        setActiveFormId(newForms[0].id)
      }
      setNextId(currentId)

      return newForms.map(f => f.id)
    },
    [nextId]
  )

  // Update form data (marks as unsaved)
  const updateFormData = useCallback(
    (formId: number, fieldName: keyof TransportFormData, value: any) => {
      setForms((prev) =>
        prev.map((form) =>
          form.id === formId
            ? {
                ...form,
                data: {
                  ...form.data,
                  [fieldName]: value,
                },
                hasUnsavedChanges: true, // Mark as unsaved
              }
            : form
        )
      )
    },
    []
  )

  // Update form title
  const updateFormTitle = useCallback((formId: number, title: string) => {
    setForms((prev) =>
      prev.map((form) =>
        form.id === formId
          ? {
              ...form,
              title,
              hasUnsavedChanges: true,
            }
          : form
      )
    )
  }, [])

  // Clear form data
  const clearForm = useCallback((formId: number) => {
    setForms((prev) =>
      prev.map((form) =>
        form.id === formId
          ? {
              ...form,
              data: createEmptyFormData(),
              hasErrors: false,
              hasUnsavedChanges: true,
            }
          : form
      )
    )
  }, [])

  // Duplicate form with specific fields
  const duplicateForm = useCallback(
    (fieldsToCopy: Partial<TransportFormData>) => {
      const newForm = createEmptyForm(nextId)
      newForm.data = {
        ...newForm.data,
        ...fieldsToCopy,
      }
      newForm.hasUnsavedChanges = true
      setForms((prev) => [...prev, newForm])
      setActiveFormId(nextId)
      setNextId((prev) => prev + 1)
    },
    [nextId]
  )

  // Mark form as saved (after successful save to DB)
  const markFormAsSaved = useCallback((formId: number, documentId: string) => {
    setForms((prev) =>
      prev.map((form) =>
        form.id === formId
          ? {
              ...form,
              hasUnsavedChanges: false,
              documentId,
            }
          : form
      )
    )
  }, [])

  // Set form error status
  const setFormError = useCallback((formId: number, hasErrors: boolean) => {
    setForms((prev) =>
      prev.map((form) => (form.id === formId ? { ...form, hasErrors } : form))
    )
  }, [])

  // Get active form
  const getActiveForm = useCallback((): FormState | undefined => {
    return forms.find((form) => form.id === activeFormId)
  }, [forms, activeFormId])

  // Get all forms
  const getAllForms = useCallback((): FormState[] => {
    return forms
  }, [forms])

  // Check if any form has unsaved changes
  const hasAnyUnsavedChanges = useCallback((): boolean => {
    return forms.some((form) => form.hasUnsavedChanges)
  }, [forms])

  // Validate single form
  const validateForm = useCallback((formData: TransportFormData): ValidationResult => {
    // Define required fields (currently none required, but can be added)
    const requiredFields: (keyof TransportFormData)[] = []

    const errors: string[] = []
    requiredFields.forEach((field) => {
      const value = formData[field]
      if (!value || value === '') {
        errors.push(field)
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
    }
  }, [])

  // Validate all forms
  const validateAllForms = useCallback((): FormValidationResult[] => {
    const results = forms.map((form) => ({
      formId: form.id,
      title: form.title,
      validation: validateForm(form.data),
    }))

    // Update error status for each form
    results.forEach((result) => {
      setFormError(result.formId, !result.validation.isValid)
    })

    return results
  }, [forms, validateForm, setFormError])

  return {
    // State
    forms,
    activeFormId,
    setActiveFormId,

    // Actions
    addForm,
    addFormWithData,
    addMultipleFormsWithData,
    deleteForm,
    duplicateForm,
    updateFormData,
    updateFormTitle,
    clearForm,
    markFormAsSaved,

    // Getters
    getActiveForm,
    getAllForms,
    hasAnyUnsavedChanges,

    // Validation
    validateForm,
    validateAllForms,
    setFormError,

    // Metadata
    formsCount: forms.length,
  }
}
