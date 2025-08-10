# SYL Transport System

A multi-form transport document web application with PDF generation capability using HTML templates.

## Features

- **Multi-form Management**: Create, edit, and manage multiple transport document forms simultaneously
- **PDF Generation**: Generate PDF documents from HTML templates with exact formatting
- **Buddhist Era Support**: All dates use Buddhist Era calendar system (B.E.)
- **Font Integration**:
  - UI: Kanit font from Google Fonts
  - PDF: Sarabun font from Google Fonts
- **Form Validation**: Real-time validation with error highlighting
- **Responsive Design**: Desktop-optimized interface with Ant Design components

## Tech Stack

- **Frontend**: Vite + React 18
- **UI Library**: Ant Design (antd)
- **PDF Generation**: html2pdf.js
- **State Management**: React Hooks (useState, useEffect)
- **Routing**: React Router DOM
- **Date Handling**: Day.js with Buddhist Era plugin
- **Fonts**: Google Fonts (Kanit, Sarabun)

## Project Structure

```
src/
├── components/
│   ├── Layout/
│   │   └── MainLayout.jsx
│   ├── SideMenu/
│   │   └── SideMenu.jsx
│   └── Forms/
│       ├── TransportForm.jsx
│       ├── FormTabs.jsx
│       └── PDFGenerator.jsx
├── pages/
│   └── TransportDocuments.jsx
├── hooks/
│   └── useFormManager.js
├── utils/
│   ├── pdfUtils.js
│   └── templateRenderer.js
├── templates/
│   └── pdfTemplate.html
├── styles/
│   └── global.css
├── App.jsx
└── main.jsx
```

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd syl-system
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start development server**

   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   ```

## Form Fields

All form fields use Thai labels as specified:

1. **วันที่** - Date (Buddhist Era format: DD/M/YY)
2. **ชื่อลูกค้า** - Customer Name
3. **บุ๊คกิ้ง** - Booking
4. **เอเย่นต์** - Agent
5. **ชื่อเรือ** - Ship Name
6. **อินวอยซ์** - Invoice
7. **ขนาดตู้** - Container Size
8. **เบอร์ตู้** - Container Number
9. **เบอร์ซีล** - Seal Number
10. **ชิปปิ้ง** - Shipping
11. **สถานที่รับตู้** - Pickup Location
12. **สถานที่คืนตู้** - Return Location
13. **CLOSING TIME** - Closing Time (Buddhist Era format: DD/M/YYYY HH:MM)
14. **เวลาเข้าโรงงาน** - Factory Entry Time (Free text)
15. **ช่องโหลด** - Loading Slot
16. **ชื่อ พขร.** - Driver Name
17. **ทะเบียนรถ** - Vehicle Registration
18. **เบอร์โทร** - Phone Number
19. **หมายเหตุ** - Remarks

## Usage Instructions

### Managing Forms

1. **Add New Form**: Click "Add New Form" button to create a new transport document
2. **Switch Forms**: Click on tabs to switch between different forms
3. **Delete Form**: Click the X button on the tab (minimum 1 form required)
4. **Clear Form**: Use "Clear Form" button to reset all fields in the current form

### Generating PDFs

1. **Single PDF**: Click "Generate PDF" button in each form tab
2. **Multiple PDFs**: Click "Generate All PDFs" button to create PDFs for all forms
3. **Validation**: All required fields must be filled before PDF generation
4. **File Names**: PDFs are saved as "Transport*Document*#X_YYYYMMDD.pdf"

### Form Validation

- Required fields are marked with red asterisk (\*)
- Forms with missing required fields show error indicators on tabs
- Real-time validation provides immediate feedback
- Bulk PDF generation validates all forms before processing

### Date Formats

- **Date Input**: Buddhist Era calendar with DD/M/YY format
- **Closing Time**: Buddhist Era calendar with DD/M/YYYY HH:MM format
- **Factory Time**: Free text input (no specific format required)

## PDF Template

The HTML template (`src/templates/pdfTemplate.html`) generates PDFs with:

- Company header: "บริษัท ทรงยุทธ โลจิสติคส์ จำกัด"
- Bordered document layout
- Dotted underlines for each field
- Sarabun font for consistent Thai text rendering
- Exact formatting matching the specified design

## Customization

### Adding New Fields

1. Update the form data structure in `useFormManager.js`
2. Add the field to `TransportForm.jsx`
3. Update the PDF template with new placeholder
4. Add field validation in `pdfUtils.js`

### Modifying PDF Layout

1. Edit `src/templates/pdfTemplate.html`
2. Update CSS styles for layout changes
3. Add new placeholders using `{{fieldName}}` syntax
4. Update `pdfUtils.js` replacement logic

### Changing Fonts

1. **UI Font**: Modify Google Fonts import in `index.html` and update `global.css`
2. **PDF Font**: Update font import in `pdfTemplate.html`

## Dependencies

```json
{
  "@ant-design/icons": "^5.3.7",
  "antd": "^5.17.0",
  "dayjs": "^1.11.10",
  "html2pdf.js": "^0.10.1",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.23.0"
}
```

## Browser Support

- **Minimum**: Chrome 90+, Firefox 88+, Safari 14+
- **Recommended**: Latest versions of modern browsers
- **PDF Generation**: Requires modern browser with canvas support

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Environment

- **Node.js**: 16+ required
- **Package Manager**: npm or yarn
- **Development Port**: 3000 (configurable in vite.config.js)

## License

This project is proprietary and confidential.

## Support

For technical support or questions, please contact the development team.
