'use client'

import { Tabs } from 'antd'
import TransportForm from './TransportForm'
import type { FormState, TransportFormData } from '@/types/document'

interface FormTabsProps {
  forms: FormState[]
  activeFormId: number
  onTabChange: (formId: number) => void
  onDeleteForm: (formId: number) => void
  onFieldChange: (formId: number, fieldName: keyof TransportFormData, value: any) => void
  onClearForm: (formId: number) => void
  onFormValidation: (formId: number, hasErrors: boolean) => void
  onDuplicateForm: (fieldsToOopy: any) => void
  onSaveForm: (formId: number) => Promise<void>
}

export default function FormTabs({
  forms,
  activeFormId,
  onTabChange,
  onDeleteForm,
  onFieldChange,
  onClearForm,
  onFormValidation,
  onDuplicateForm,
  onSaveForm,
}: FormTabsProps) {
  // Return null if no forms
  if (forms.length === 0) {
    return null
  }

  // Create tab items
  const tabItems = forms.map((form) => ({
    key: form.id.toString(),
    label: (
      <span>
        {form.title}
        {form.hasUnsavedChanges && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>}
      </span>
    ),
    closable: forms.length > 1,
    children: (
      <TransportForm
        form={form}
        onFieldChange={onFieldChange}
        onClearForm={onClearForm}
        onFormValidation={onFormValidation}
        onDuplicateForm={onDuplicateForm}
        onSaveForm={onSaveForm}
      />
    ),
  }))

  return (
    <Tabs
      type="editable-card"
      tabPosition="left"
      activeKey={activeFormId.toString()}
      onChange={(key) => onTabChange(parseInt(key))}
      onEdit={(targetKey, action) => {
        if (action === 'remove') {
          onDeleteForm(parseInt(targetKey as string))
        }
      }}
      items={tabItems}
      hideAdd
      tabBarStyle={{
        marginBottom: 16,
        backgroundColor: '#fff',
        padding: '8px 16px 0',
        borderRadius: '8px 8px 0 0',
      }}
    />
  )
}
