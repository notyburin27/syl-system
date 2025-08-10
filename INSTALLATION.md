# SYL Transport System - Installation & Usage Guide

## Quick Start

### Prerequisites

- Node.js 16+
- npm or yarn package manager
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation Steps

1. **Clone and navigate to project**

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

4. **Open application**
   - Open browser and go to: `http://localhost:3000`
   - Application should load with SYL logo and Transport Documents page

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Application Features

### 1. Multi-Form Management

- **Add New Form**: Click "Add New Form" button
- **Switch Forms**: Click on tabs to navigate between forms
- **Delete Forms**: Click X on tab (minimum 1 form required)
- **Form Counter**: Shows active form count in header

### 2. Form Fields (All Required unless noted)

| Field                | Thai Label     | Type            | Format                         |
| -------------------- | -------------- | --------------- | ------------------------------ |
| Date                 | วันที่         | Date Picker     | DD/M/YY (Buddhist Era)         |
| Customer Name        | ชื่อลูกค้า     | Text Input      | Free text                      |
| Booking              | บุ๊คกิ้ง       | Text Input      | Free text                      |
| Agent                | เอเย่นต์       | Text Input      | Free text                      |
| Ship Name            | ชื่อเรือ       | Text Input      | Free text                      |
| Invoice              | อินวอยซ์       | Text Input      | Free text                      |
| Container Size       | ขนาดตู้        | Text Input      | Free text                      |
| Container Number     | เบอร์ตู้       | Text Input      | Free text                      |
| Seal Number          | เบอร์ซีล       | Text Input      | Free text                      |
| Shipping             | ชิปปิ้ง        | Text Input      | Free text                      |
| Pickup Location      | สถานที่รับตู้  | Text Input      | Free text                      |
| Return Location      | สถานที่คืนตู้  | Text Input      | Free text                      |
| Closing Time         | CLOSING TIME   | DateTime Picker | DD/M/YYYY HH:MM (Buddhist Era) |
| Factory Time         | เวลาเข้าโรงงาน | Text Input      | Free text (Optional)           |
| Loading Slot         | ช่องโหลด       | Text Input      | Free text (Optional)           |
| Driver Name          | ชื่อ พขร.      | Text Input      | Free text                      |
| Vehicle Registration | ทะเบียนรถ      | Text Input      | Free text                      |
| Phone Number         | เบอร์โทร       | Text Input      | Free text                      |
| Remarks              | หมายเหตุ       | Text Area       | Free text (Optional)           |

### 3. PDF Generation

#### Single PDF Generation

1. Fill out all required fields in a form
2. Click "Generate PDF" button in the form
3. PDF will be automatically downloaded

#### Multiple PDF Generation

1. Fill out all required fields in all forms
2. Click "Generate All PDFs" button in header
3. Modal will show generation progress
4. PDFs will be downloaded individually

#### PDF Features

- **Filename Format**: `Transport_Document_#X_YYYYMMDD.pdf`
- **Font**: Sarabun from Google Fonts
- **Layout**: Bordered document with dotted underlines
- **Company Header**: บริษัท ทรงยุทธ โลจิสติคส์ จำกัด
- **Date Format**: Buddhist Era (B.E.)

### 4. Form Validation

#### Real-time Validation

- Required fields show error state when empty
- Form tabs show error indicator (red color) when validation fails
- PDF generation blocked until all validations pass

#### Error Messages

- Individual field validation on blur/change
- Bulk validation before PDF generation
- Clear error messages in English

### 5. Data Management

#### Form State

- No local storage - all data in React state
- Data persists during session only
- Clear form functionality resets all fields

#### Form Operations

- **Clear Form**: Reset current form to empty state
- **Add Form**: Create new empty form
- **Delete Form**: Remove form (minimum 1 required)
- **Switch Form**: Change active form tab

## Technical Details

### Date Handling

- **Input Format**: Uses Ant Design DatePicker
- **Display**: Buddhist Era (C.E. + 543 years)
- **Storage**: JavaScript Date objects
- **PDF Output**: Formatted as Buddhist Era

### Font Configuration

- **UI Font**: Kanit from Google Fonts
- **PDF Font**: Sarabun from Google Fonts
- **Language**: UI text in English, form labels in Thai

### Browser Compatibility

- **Minimum**: Chrome 90+, Firefox 88+, Safari 14+
- **PDF Generation**: html2pdf.js requires canvas support
- **Recommended**: Latest browser versions

## Troubleshooting

### Common Issues

#### PDF Generation Fails

- **Check**: All required fields filled
- **Check**: Browser allows file downloads
- **Check**: Sufficient memory for PDF processing

#### Date Picker Issues

- **Solution**: Use Buddhist Era format (Year + 543)
- **Example**: 2025 becomes 2568 in Buddhist Era

#### Form Validation Errors

- **Check**: All red-marked required fields
- **Check**: Date formats are valid
- **Check**: No empty required fields

#### Application Won't Start

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

#### Build Issues

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable lint issues
npm run lint -- --fix
```

### Performance Tips

#### Large Numbers of Forms

- Recommended maximum: 20-30 forms per session
- Performance impact: Memory usage increases with form count
- Solution: Generate PDFs and clear forms periodically

#### PDF Generation

- Single PDF: ~2-3 seconds per document
- Multiple PDFs: Process sequentially to avoid browser freeze
- Large batches: Consider generating in smaller chunks

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── Layout/         # Layout components
│   ├── SideMenu/       # Navigation
│   └── Forms/          # Form-related components
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── templates/          # PDF HTML template
└── styles/             # CSS styles
```

### Key Files

- `src/hooks/useFormManager.js` - Form state management
- `src/utils/pdfUtils.js` - PDF generation logic
- `src/templates/pdfTemplate.html` - PDF HTML template
- `src/styles/global.css` - Global styles and fonts

### Customization

#### Adding New Fields

1. Update form structure in `useFormManager.js`
2. Add field to `TransportForm.jsx`
3. Update PDF template with placeholder
4. Add validation rules in `pdfUtils.js`

#### Modifying PDF Layout

1. Edit `src/templates/pdfTemplate.html`
2. Update CSS styles in template
3. Modify replacement logic in `pdfUtils.js`

## Support

### Getting Help

- Check browser console for error messages
- Verify all dependencies installed correctly
- Ensure Node.js version 16 or higher

### Reporting Issues

- Include browser version and OS
- Provide steps to reproduce issue
- Include any console error messages

---

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Platform**: Desktop Web Application
