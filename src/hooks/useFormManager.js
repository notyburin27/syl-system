import { useState, useCallback } from "react";

// Initial form data structure
const createEmptyForm = (id) => ({
  id,
  title: `Transport Document #${id}`,
  hasErrors: false,
  data: {
    date: null,
    customerName: "",
    booking: "",
    agent: "",
    shipName: "",
    invoice: "",
    containerSize: "",
    containerNumber: "",
    sealNumber: "",
    shipping: "",
    pickupLocation: "",
    returnLocation: "",
    closingTime: null,
    factoryTime: "",
    loadingSlot: "",
    driverName: "",
    vehicleRegistration: "",
    phoneNumber: "",
    remarks: "",
  },
});

export const useFormManager = () => {
  const [forms, setForms] = useState([createEmptyForm(1)]);
  const [activeFormId, setActiveFormId] = useState(1);
  const [nextId, setNextId] = useState(2);

  // Add new form
  const addForm = useCallback(() => {
    const newForm = createEmptyForm(nextId);
    setForms((prev) => [...prev, newForm]);
    setActiveFormId(nextId);
    setNextId((prev) => prev + 1);
  }, [nextId]);

  // Delete form (ensure minimum of 1 form)
  const deleteForm = useCallback(
    (formId) => {
      setForms((prev) => {
        const filteredForms = prev.filter((form) => form.id !== formId);

        // Ensure at least one form exists
        if (filteredForms.length === 0) {
          const newForm = createEmptyForm(1);
          setActiveFormId(1);
          setNextId(2);
          return [newForm];
        }

        // If we deleted the active form, switch to the first available form
        if (formId === activeFormId) {
          setActiveFormId(filteredForms[0].id);
        }

        return filteredForms;
      });
    },
    [activeFormId]
  );

  // Update form data
  const updateFormData = useCallback((formId, fieldName, value) => {
    setForms((prev) =>
      prev.map((form) =>
        form.id === formId
          ? {
              ...form,
              data: {
                ...form.data,
                [fieldName]: value,
              },
            }
          : form
      )
    );
  }, []);

  // Clear form data
  const clearForm = useCallback((formId) => {
    setForms((prev) =>
      prev.map((form) =>
        form.id === formId
          ? {
              ...form,
              data: createEmptyForm(formId).data,
              hasErrors: false,
            }
          : form
      )
    );
  }, []);

  // Duplicate form with specific fields
  const duplicateForm = useCallback(
    (fieldsToOopy) => {
      const newForm = createEmptyForm(nextId);
      // Copy only specific fields
      newForm.data = {
        ...newForm.data,
        ...fieldsToOopy,
      };
      setForms((prev) => [...prev, newForm]);
      setActiveFormId(nextId);
      setNextId((prev) => prev + 1);
    },
    [nextId]
  );

  // Set form error status
  const setFormError = useCallback((formId, hasErrors) => {
    setForms((prev) =>
      prev.map((form) => (form.id === formId ? { ...form, hasErrors } : form))
    );
  }, []);

  // Get active form
  const getActiveForm = useCallback(() => {
    return forms.find((form) => form.id === activeFormId);
  }, [forms, activeFormId]);

  // Get all forms
  const getAllForms = useCallback(() => {
    return forms;
  }, [forms]);

  // Validate form data
  const validateForm = useCallback((formData) => {
    const requiredFields = [
      "date",
      "customerName",
      "booking",
      "agent",
      "shipName",
      "invoice",
      "containerSize",
      "containerNumber",
      "sealNumber",
      "shipping",
      "pickupLocation",
      "returnLocation",
      "closingTime",
      "driverName",
      "vehicleRegistration",
      "phoneNumber",
    ];

    const errors = [];
    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field] === "") {
        errors.push(field);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, []);

  // Validate all forms
  const validateAllForms = useCallback(() => {
    const results = forms.map((form) => ({
      formId: form.id,
      title: form.title,
      validation: validateForm(form.data),
    }));

    // Update error status for each form
    results.forEach((result) => {
      setFormError(result.formId, !result.validation.isValid);
    });

    return results;
  }, [forms, validateForm, setFormError]);

  return {
    forms,
    activeFormId,
    setActiveFormId,
    addForm,
    deleteForm,
    duplicateForm,
    updateFormData,
    clearForm,
    getActiveForm,
    getAllForms,
    validateForm,
    validateAllForms,
    setFormError,
    formsCount: forms.length,
  };
};
