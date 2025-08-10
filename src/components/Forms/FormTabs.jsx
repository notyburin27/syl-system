/* eslint-disable react/prop-types */
import React from "react";
import { Tabs } from "antd";
import TransportForm from "./TransportForm";

const FormTabs = ({
  forms,
  activeFormId,
  onTabChange,
  onDeleteForm,
  onFieldChange,
  onClearForm,
  onFormValidation,
  onDuplicateForm,
}) => {
  // Create tab items
  const tabItems = forms.map((form) => ({
    key: form.id.toString(),
    label: form.title,
    closable: forms.length > 1,
    children: (
      <TransportForm
        form={form}
        onFieldChange={onFieldChange}
        onClearForm={onClearForm}
        onFormValidation={onFormValidation}
        onDuplicateForm={onDuplicateForm}
      />
    ),
  }));

  return (
    <Tabs
      type="editable-card"
      tabPosition="left"
      activeKey={activeFormId.toString()}
      onChange={(key) => onTabChange(parseInt(key))}
      onEdit={(targetKey, action) => {
        if (action === "remove") {
          onDeleteForm(parseInt(targetKey));
        }
      }}
      items={tabItems}
      hideAdd
      tabBarStyle={{
        marginBottom: 16,
        backgroundColor: "#fff",
        padding: "8px 16px 0",
        borderRadius: "8px 8px 0 0",
      }}
    />
  );
};

export default FormTabs;
