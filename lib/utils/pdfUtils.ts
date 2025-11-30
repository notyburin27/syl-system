import dayjs from 'dayjs'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import 'dayjs/locale/th'
import { TransportFormData } from '@/types/document'

// Setup dayjs with Buddhist Era
dayjs.extend(buddhistEra)
dayjs.locale('th')

// Dynamic import for html2pdf (client-side only)
const getHtml2Pdf = async () => {
  if (typeof window !== 'undefined') {
    const html2pdf = (await import('html2pdf.js')).default
    return html2pdf
  }
  throw new Error('html2pdf can only be used in browser environment')
}

// Convert date to Buddhist Era format
export const formatDateToBuddhistEra = (date: Date | null): string => {
  if (!date) return ''
  return dayjs(date).format('DD/MM/BB') // BB = 2-digit Buddhist Era year
}

// Format closing time to Buddhist Era with time
export const formatClosingTimeToBuddhistEra = (datetime: Date | null): string => {
  if (!datetime) return ''
  return dayjs(datetime).format('DD/MM/BBBB HH:mm') // BBBB = 4-digit Buddhist Era year
}

// Replace template placeholders with actual data
export const generatePDFFromTemplate = async (formData: TransportFormData): Promise<string> => {
  // Fetch template from public folder
  const response = await fetch('/templates/pdfTemplate.html')
  let htmlTemplate = await response.text()

  // Format dates with Buddhist Era
  const formattedDate = formatDateToBuddhistEra(formData.date)
  const formattedClosingTime = formatClosingTimeToBuddhistEra(formData.closingTime)

  // Replace all placeholders
  const replacements: Record<string, string> = {
    '{{date}}': formattedDate,
    '{{customerName}}': formData.customerName || '',
    '{{booking}}': formData.booking || '',
    '{{agent}}': formData.agent || '',
    '{{shipName}}': formData.shipName || '',
    '{{invoice}}': formData.invoice || '',
    '{{containerSize}}': formData.containerSize || '',
    '{{containerNumber}}': formData.containerNumber || '',
    '{{sealNumber}}': formData.sealNumber || '',
    '{{shipping}}': formData.shipping || '',
    '{{pickupLocation}}': formData.pickupLocation || '',
    '{{returnLocation}}': formData.returnLocation || '',
    '{{closingTime}}': formattedClosingTime,
    '{{factoryTime}}': formData.factoryTime || '',
    '{{loadingSlot}}': formData.loadingSlot || '',
    '{{driverName}}': formData.driverName || '',
    '{{vehicleRegistration}}': formData.vehicleRegistration || '',
    '{{phoneNumber}}': formData.phoneNumber || '',
    '{{remarks}}': formData.remarks || '',
  }

  // Replace all placeholders in the template
  Object.entries(replacements).forEach(([placeholder, value]) => {
    htmlTemplate = htmlTemplate.replace(new RegExp(placeholder, 'g'), value)
  })

  return htmlTemplate
}

// Generate PDF from form data
export const generateSinglePDF = async (
  formData: TransportFormData,
  formTitle: string
): Promise<{ success: boolean; filename?: string; error?: string }> => {
  try {
    const htmlContent = await generatePDFFromTemplate(formData)

    // Create filename with current date
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
    const filename = `${formTitle.replace(/\s+/g, '_')}_${dateStr}.pdf`

    const options = {
      margin: 0.5,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        letterRendering: true,
      },
      jsPDF: {
        unit: 'in',
        format: 'a4',
        orientation: 'portrait',
      },
    }

    // Generate and download PDF
    const html2pdf = await getHtml2Pdf()
    await html2pdf().set(options).from(htmlContent).save()

    return { success: true, filename }
  } catch (error: any) {
    console.error('PDF generation error:', error)
    return { success: false, error: error.message }
  }
}

// Progress callback type
export interface PDFProgress {
  current: number
  total: number
  formTitle?: string
  status: 'processing' | 'completed'
}

// Form with data interface
export interface FormWithData {
  id: number
  title: string
  data: TransportFormData
}

// Generate multiple PDFs
export const generateMultiplePDFs = async (
  forms: FormWithData[],
  onProgress?: (progress: PDFProgress) => void
): Promise<Array<{ formId: number; formTitle: string; success: boolean; filename?: string; error?: string }>> => {
  const results = []

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i]

    // Update progress
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: forms.length,
        formTitle: form.title,
        status: 'processing',
      })
    }

    try {
      const result = await generateSinglePDF(form.data, form.title)
      results.push({
        formId: form.id,
        formTitle: form.title,
        ...result,
      })

      // Small delay to prevent browser freezing
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error: any) {
      results.push({
        formId: form.id,
        formTitle: form.title,
        success: false,
        error: error.message,
      })
    }
  }

  // Final progress update
  if (onProgress) {
    onProgress({
      current: forms.length,
      total: forms.length,
      status: 'completed',
    })
  }

  return results
}

// Generate combined PDF with multiple forms as pages
export const generateCombinedPDF = async (
  forms: FormWithData[],
  onProgress?: (progress: PDFProgress) => void
): Promise<{ success: boolean; filename?: string; formCount?: number; formTitles?: string[]; error?: string }> => {
  try {
    // Create combined HTML content with page breaks
    let combinedHtml = ''
    let headContent = ''

    for (let i = 0; i < forms.length; i++) {
      const form = forms[i]

      // Update progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: forms.length,
          formTitle: form.title,
          status: 'processing',
        })
      }

      // Generate HTML for this form
      const htmlContent = await generatePDFFromTemplate(form.data)

      // Extract body content (remove html/head tags) on first iteration, get head
      if (i === 0) {
        const headMatch = htmlContent.match(/<head[^>]*>(.*?)<\/head>/s)
        headContent = headMatch ? headMatch[1] : ''
      }

      const bodyMatch = htmlContent.match(/<body[^>]*>(.*?)<\/body>/s)
      const bodyContent = bodyMatch ? bodyMatch[1] : htmlContent

      // Add page content
      combinedHtml += bodyContent

      // Add page break except for the last form
      if (i < forms.length - 1) {
        combinedHtml += '<div style="page-break-after: always;"></div>'
      }
    }

    // Wrap in complete HTML structure
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        ${headContent}
      </head>
      <body>
        ${combinedHtml}
      </body>
      </html>
    `

    // Create filename with current date
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
    const filename = `Combined_Transport_Documents_${dateStr}.pdf`

    const options = {
      margin: 0.5,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        letterRendering: true,
        allowTaint: true,
      },
      jsPDF: {
        unit: 'in',
        format: 'a4',
        orientation: 'portrait',
      },
    }

    // Generate and download PDF
    const html2pdf = await getHtml2Pdf()
    await html2pdf().set(options).from(fullHtml).save()

    // Final progress update
    if (onProgress) {
      onProgress({
        current: forms.length,
        total: forms.length,
        status: 'completed',
      })
    }

    return {
      success: true,
      filename,
      formCount: forms.length,
      formTitles: forms.map((f) => f.title),
    }
  } catch (error: any) {
    console.error('Combined PDF generation error:', error)
    return { success: false, error: error.message }
  }
}

// Validate form data before PDF generation
export const validateFormForPDF = (
  formData: TransportFormData
): { isValid: boolean; missingFields: string[] } => {
  // Currently no required fields for PDF, but can be added
  const requiredFields: { key: keyof TransportFormData; label: string }[] = []

  const missingFields = requiredFields
    .filter((field) => !formData[field.key] || formData[field.key] === '')
    .map((field) => field.label)

  return {
    isValid: missingFields.length === 0,
    missingFields,
  }
}
