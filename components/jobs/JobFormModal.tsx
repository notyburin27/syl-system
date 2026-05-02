"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Divider,
  Button,
  App,
  Row,
  Col,
} from "antd";
import {
  PlusOutlined,
  LoadingOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Job, Customer, Location } from "@/types/job";
import { JOB_TYPES, SIZE_OPTIONS } from "@/types/job";
import QuickAddModal from "./QuickAddModal";

interface JobFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  job: Job | null; // null for create
  driverId: string;
  month: string; // YYYY-MM
  isAdmin: boolean;
  customers: Customer[];
  factoryLocations: Location[];
  generalLocations: Location[];
  onClose: () => void;
  onCreated: (job: Job) => void;
  onFieldSave: (
    jobId: string,
    field: string,
    value: unknown,
  ) => Promise<boolean>;
  onRefreshReferenceData: () => void;
}

export default function JobFormModal({
  open,
  mode,
  job,
  driverId,
  month,
  isAdmin,
  customers,
  factoryLocations,
  generalLocations,
  onClose,
  onCreated,
  onFieldSave,
  onRefreshReferenceData,
}: JobFormModalProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [createdJob, setCreatedJob] = useState<Job | null>(null);
  const [clearStatus, setClearStatus] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Quick add modal
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<"customer" | "location">(
    "customer",
  );
  const [quickAddLocationType, setQuickAddLocationType] = useState<
    "factory" | "general" | undefined
  >();
  const [quickAddField, setQuickAddField] = useState<string | null>(null);

  // Track which job we're editing (could be the passed job or a newly created one)
  const activeJob = createdJob || job;

  const jobTypeWatch = Form.useWatch("jobType", form);
  const isAdvance = jobTypeWatch === "advance";

  // Fetch and preview next ADV number when jobType switches to เบิกล่วงหน้า
  useEffect(() => {
    if (isAdvance && mode === "create" && !createdJob) {
      fetch("/api/jobs/advance-number")
        .then((r) => r.json())
        .then((data) => {
          if (data.jobNumber) form.setFieldValue("jobNumber", data.jobNumber);
        })
        .catch(() => {});
    } else if (!isAdvance && mode === "create" && !createdJob) {
      form.setFieldValue("jobNumber", undefined);
    }
  }, [isAdvance, mode, createdJob, form]);

  // Computed fields
  const watchAdvance = Form.useWatch("advance", form) || 0;
  const watchToll = Form.useWatch("toll", form) || 0;
  const watchPickupFee = Form.useWatch("pickupFee", form) || 0;
  const watchReturnFee = Form.useWatch("returnFee", form) || 0;
  const watchLiftFee = Form.useWatch("liftFee", form) || 0;
  const watchStorageFee = Form.useWatch("storageFee", form) || 0;
  const watchTire = Form.useWatch("tire", form) || 0;
  const watchOther = Form.useWatch("other", form) || 0;
  const watchActualTransfer = Form.useWatch("actualTransfer", form) || 0;

  const driverOverall =
    Number(watchAdvance) +
    Number(watchToll) +
    Number(watchPickupFee) +
    Number(watchReturnFee) +
    Number(watchLiftFee) +
    Number(watchStorageFee) +
    Number(watchTire) +
    Number(watchOther);
  const difference = driverOverall - Number(watchActualTransfer);
  const totalTransfer = Number(watchActualTransfer) + difference;

  useEffect(() => {
    if (open) {
      setCreatedJob(null);
      setSaveStatus("idle");
      setClearStatus(mode === "edit" && job ? !!job.clearStatus : false);
      if (mode === "edit" && job) {
        form.setFieldsValue({
          jobNumber: job.jobNumber,
          jobDate: job.jobDate ? dayjs(job.jobDate) : null,
          jobType: job.jobType || undefined,
          customerId: job.customerId || undefined,
          size: job.size || undefined,
          pickupLocationId: job.pickupLocationId || undefined,
          factoryLocationId: job.factoryLocationId || undefined,
          returnLocationId: job.returnLocationId || undefined,
          income: job.income,
          driverWage: job.driverWage,
          actualTransfer: job.actualTransfer,
          advance: job.advance,
          toll: job.toll,
          pickupFee: job.pickupFee,
          returnFee: job.returnFee,
          liftFee: job.liftFee,
          storageFee: job.storageFee,
          tire: job.tire,
          other: job.other,
          mileage: job.mileage,
          fuelOfficeLiters: job.fuelOfficeLiters,
          fuelCashLiters: job.fuelCashLiters,
          fuelCashAmount: job.fuelCashAmount,
          fuelCreditLiters: job.fuelCreditLiters,
          fuelCreditAmount: job.fuelCreditAmount,
          clearStatus: job.clearStatus,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, mode, job, form]);

  const handleSaveStatus = useCallback(
    (status: "saving" | "saved" | "error") => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus(status);
      if (status === "saved") {
        saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      }
    },
    [],
  );

  const parseNumber = (val: unknown) => {
    const str = String(val ?? "").trim();
    if (str === "") return null;
    const num = Number(str);
    return isNaN(num) ? null : num;
  };

  // Handle field blur for existing jobs (auto-save)
  const handleFieldBlur = async (field: string) => {
    const targetJob = activeJob;
    if (!targetJob) return;

    const rawValue = form.getFieldValue(field);
    let value: unknown = rawValue;

    // Parse based on field type
    const numberFields = [
      "income",
      "driverWage",
      "actualTransfer",
      "advance",
      "toll",
      "pickupFee",
      "returnFee",
      "liftFee",
      "storageFee",
      "tire",
      "other",
      "mileage",
      "fuelOfficeLiters",
      "fuelCashLiters",
      "fuelCashAmount",
      "fuelCreditLiters",
      "fuelCreditAmount",
    ];

    if (numberFields.includes(field)) {
      const str = String(rawValue ?? "").trim();
      if (str !== "" && isNaN(Number(str))) return; // invalid number, don't save
      value = parseNumber(rawValue);
    } else if (field === "jobDate") {
      if (rawValue) {
        const selectedMonth = rawValue.format("YYYY-MM");
        if (selectedMonth !== month) {
          modal.error({
            title: "วันที่ไม่ตรงกับเดือนปัจจุบัน",
            content: `กรุณาเลือกวันที่ในเดือน ${dayjs(month).format("MMMM YYYY")}`,
          });
          form.setFieldValue(
            "jobDate",
            targetJob.jobDate ? dayjs(targetJob.jobDate) : null,
          );
          return;
        }
        value = rawValue.format("YYYY-MM-DD");
      } else {
        value = null;
      }
    } else if (
      field === "customerId" ||
      field === "size" ||
      field === "pickupLocationId" ||
      field === "factoryLocationId" ||
      field === "returnLocationId" ||
      field === "jobType"
    ) {
      value = rawValue ?? null;
    }

    // Check if value actually changed
    const oldValue = (targetJob as unknown as Record<string, unknown>)[field];
    const normalizedOld =
      field === "jobDate" && oldValue
        ? dayjs(oldValue as string).format("YYYY-MM-DD")
        : oldValue;
    if (value === normalizedOld) return;

    handleSaveStatus("saving");
    const success = await onFieldSave(targetJob.id, field, value);
    if (success) {
      handleSaveStatus("saved");
    } else {
      handleSaveStatus("error");
    }
  };

  const prefillEstimatedTransfer = async () => {
    const jobType = form.getFieldValue("jobType");
    const size = form.getFieldValue("size");
    const pickupLocationId = form.getFieldValue("pickupLocationId");
    const returnLocationId = form.getFieldValue("returnLocationId");
    if (!jobType || !size || !pickupLocationId || !returnLocationId) return;
    try {
      const res = await fetch("/api/jobs/calculate/estimated-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType, size, pickupLocationId, returnLocationId }),
      });
      const data = await res.json();
      if (data.estimatedTransfer) {
        form.setFieldsValue({
          estimatedTransfer: data.estimatedTransfer,
          pickupFee: data.pickupFee || undefined,
          returnFee: data.returnFee || undefined,
        });
        // prefill actualTransfer if empty
        const currentActual = form.getFieldValue("actualTransfer");
        if (currentActual === undefined || currentActual === null || String(currentActual).trim() === "") {
          form.setFieldValue("actualTransfer", data.estimatedTransfer);
          if (isCreated) await handleFieldBlur("actualTransfer");
        }
        if (isCreated) {
          await Promise.all([
            handleFieldBlur("pickupFee"),
            handleFieldBlur("returnFee"),
          ]);
        }
      }
    } catch {}
  };

  const prefillIncome = async () => {
    const currentVal = form.getFieldValue("income");
    if (currentVal !== undefined && currentVal !== null && String(currentVal).trim() !== "") return;
    const jobType = form.getFieldValue("jobType");
    const size = form.getFieldValue("size");
    const factoryLocationId = form.getFieldValue("factoryLocationId");
    const customerId = form.getFieldValue("customerId");
    const jobDateVal = form.getFieldValue("jobDate");
    if (!jobType || !size || !factoryLocationId || !customerId) return;
    try {
      const res = await fetch("/api/jobs/calculate/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType,
          size,
          factoryLocationId,
          customerId,
          jobDate: jobDateVal ? jobDateVal.format?.("YYYY-MM-DD") ?? jobDateVal : undefined,
        }),
      });
      const data = await res.json();
      if (data.income) {
        form.setFieldValue("income", data.income);
        await handleFieldBlur("income");
      }
    } catch {}
  };

  const prefillDriverWage = async () => {
    const currentVal = form.getFieldValue("driverWage");
    if (currentVal !== undefined && currentVal !== null && String(currentVal).trim() !== "") return;
    const jobType = form.getFieldValue("jobType");
    const size = form.getFieldValue("size");
    const factoryLocationId = form.getFieldValue("factoryLocationId");
    if (!jobType || !size || !factoryLocationId) return;
    try {
      const res = await fetch("/api/jobs/calculate/driver-wage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType, size, factoryLocationId }),
      });
      const data = await res.json();
      if (data.driverWage) {
        form.setFieldValue("driverWage", data.driverWage);
        await handleFieldBlur("driverWage");
      }
    } catch {}
  };

  // Create job (POST) — needs jobDate + jobType + jobNumber
  const handleCreate = async () => {
    const jobNumber = form.getFieldValue("jobNumber");
    const jobDate = form.getFieldValue("jobDate");
    const jobType = form.getFieldValue("jobType");

    if (!jobDate || !jobType || (!jobNumber && jobType !== "advance")) {
      return;
    }

    const selectedMonth = jobDate.format("YYYY-MM");
    if (selectedMonth !== month) {
      modal.error({
        title: "วันที่ไม่ตรงกับเดือนปัจจุบัน",
        content: `กรุณาเลือกวันที่ในเดือน ${dayjs(month).format("MMMM YYYY")}`,
      });
      return;
    }

    const advance = isAdvance ? parseNumber(form.getFieldValue("advance")) : undefined;

    setSaving(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobNumber,
          jobDate: jobDate.format("YYYY-MM-DD"),
          jobType,
          driverId,
          ...(advance != null && { advance }),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "สร้างงานล้มเหลว");
        return;
      }
      const newJob: Job = await res.json();
      setCreatedJob(newJob);
      form.setFieldValue("jobNumber", newJob.jobNumber);
      onCreated(newJob);
    } catch {
      message.error("สร้างงานล้มเหลว");
    } finally {
      setSaving(false);
    }
  };


  const openQuickAdd = (
    type: "customer" | "location",
    locType?: "factory" | "general",
    field?: string,
  ) => {
    setQuickAddType(type);
    setQuickAddLocationType(locType);
    setQuickAddField(field || null);
    setQuickAddOpen(true);
  };

  const addButton = (
    type: "customer" | "location",
    locType?: "factory" | "general",
    field?: string,
  ) => (
    <>
      <Divider style={{ margin: "4px 0" }} />
      <div
        style={{ padding: "4px 8px" }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Button
          type="link"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => openQuickAdd(type, locType, field)}
        >
          เพิ่มใหม่
        </Button>
      </div>
    </>
  );

  const isCreated = !!activeJob;
  const isCleared = clearStatus;
  const fieldsDisabled = mode === "create" && !isCreated;

  const numberRule = {
    validator: (_: unknown, value: string) => {
      if (value === undefined || value === null || String(value).trim() === "")
        return Promise.resolve();
      return isNaN(Number(value))
        ? Promise.reject("กรุณากรอกตัวเลข")
        : Promise.resolve();
    },
  };

  const numberInput = (field: string, label: string, disabled?: boolean, skipClearLock?: boolean) => (
    <Form.Item label={label} name={field} rules={[numberRule]}>
      <Input
        allowClear
        styles={{ input: { textAlign: "right" } }}
        disabled={fieldsDisabled || disabled || (!skipClearLock && isCleared)}
        onBlur={() => isCreated && handleFieldBlur(field)}
        onChange={(e) => {
          if (e.target.value === "" && isCreated) {
            setTimeout(() => handleFieldBlur(field), 0);
          }
        }}
      />
    </Form.Item>
  );

  const selectDropdown = (
    field: string,
    options: { value: string; label: string }[],
    extra?: React.ReactNode,
    disabled?: boolean,
    prefills?: Array<() => void>,
  ) => (
    <Select
      showSearch
      allowClear
      disabled={fieldsDisabled || disabled || isCleared}
      popupMatchSelectWidth={false}
      styles={{ popup: { root: { minWidth: 200 } } }}
      filterOption={(input, option) =>
        ((option?.label as string) ?? "")
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      options={options}
      onChange={() => {
        if (isCreated) setTimeout(() => handleFieldBlur(field), 0);
        if (prefills) prefills.forEach((fn) => setTimeout(fn, 0));
      }}
      dropdownRender={
        extra
          ? (menu) => (
              <>
                {menu}
                {extra}
              </>
            )
          : undefined
      }
    />
  );

  return (
    <>
      <Modal
        title={
          mode === "create"
            ? "เพิ่มงานใหม่"
            : `แก้ไขงาน ${job?.jobNumber || ""}`
        }
        open={open}
        onCancel={onClose}
        footer={
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              {saveStatus === "saving" && (
                <span style={{ color: "#1890ff", fontSize: 13 }}>
                  <LoadingOutlined style={{ marginRight: 4 }} />
                  กำลังบันทึก...
                </span>
              )}
              {saveStatus === "saved" && (
                <span style={{ color: "#52c41a", fontSize: 13 }}>
                  <CheckOutlined style={{ marginRight: 4 }} />
                  บันทึกแล้ว
                </span>
              )}
              {saveStatus === "error" && (
                <span style={{ color: "#ff4d4f", fontSize: 13 }}>
                  บันทึกล้มเหลว
                </span>
              )}
            </div>
            <Button data-testid="job-form-close-btn" onClick={onClose}>ปิด</Button>
          </div>
        }
        width="100%"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          {/* Section 1: ข้อมูล */}

          <Row gutter={12} align="bottom">
            <Col span={3}>
              <Form.Item
                label="วันที่"
                name="jobDate"
                rules={[{ required: !isCreated && mode === "create", message: "กรุณาเลือกวันที่" }]}
              >
                <DatePicker
                    id="job-date-picker"
                    format="DD/MM/YYYY"
                    style={{ width: "100%" }}
                    disabled={(mode === "edit" && !isCreated) || isCleared}
                    onChange={() => {
                      if (isCreated) {
                        setTimeout(() => handleFieldBlur("jobDate"), 0);
                      }
                    }}
                  />
              </Form.Item>
            </Col>
            <Col span={3}>
              <Form.Item
                label="ลักษณะงาน"
                name="jobType"
                rules={[
                  {
                    required: !isCreated && mode === "create",
                    message: "กรุณาเลือกลักษณะงาน",
                  },
                ]}
              >
                <Select
                    id="job-type-select"
                    showSearch
                    allowClear
                    disabled={isCleared}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { minWidth: 200 } } }}
                    filterOption={(input, option) =>
                      ((option?.label as string) ?? "")
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    options={JOB_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                    onChange={() => {
                      if (isCreated) setTimeout(() => handleFieldBlur("jobType"), 0);
                      setTimeout(() => prefillEstimatedTransfer(), 0);
                      setTimeout(() => prefillIncome(), 0);
                    }}
                  />
              </Form.Item>
            </Col>
            <Col span={3}>
              <Form.Item
                label="JOB/เลขที่"
                name="jobNumber"
                rules={[{ required: !isCreated && mode === "create" && !isAdvance, message: "กรุณากรอก JOB/เลขที่" }]}
              >
                <Input id="jobNumber" data-testid="job-number-input" disabled={mode === "edit" || isAdvance} />
              </Form.Item>
            </Col>
            {mode === "create" && !isCreated && isAdvance && (
              <Col span={3}>
                <Form.Item label="เบิกล่วงหน้า" name="advance" rules={[numberRule]}>
                  <Input allowClear styles={{ input: { textAlign: "right" } }} />
                </Form.Item>
              </Col>
            )}
            {mode === "create" && !isCreated && (
              <Col span={3}>
                <Form.Item label=" ">
                  <Button
                    data-testid="job-create-btn"
                    type="primary"
                    loading={saving}
                    onClick={async () => {
                      try {
                        const fieldsToValidate = isAdvance
                          ? ["jobDate", "jobType"]
                          : ["jobDate", "jobType", "jobNumber"];
                        await form.validateFields(fieldsToValidate);
                        await handleCreate();
                      } catch {
                        // validation failed, do nothing
                      }
                    }}
                    style={{ width: "100%" }}
                  >
                    สร้าง
                  </Button>
                </Form.Item>
              </Col>
            )}
            {isCreated && isAdvance && (
              <Col span={3}>
                {numberInput("advance", "เบิกล่วงหน้า", false, true)}
              </Col>
            )}
            {isCreated && !isAdvance && (
              <>
                <Col span={3}>
                  <Form.Item label="ลูกค้า" name="customerId">
                    {selectDropdown(
                      "customerId",
                      customers.map((c) => ({ value: c.id, label: c.name })),
                      addButton("customer", undefined, "customerId"),
                      undefined,
                      [prefillIncome],
                    )}
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="SIZE" name="size">
                    {selectDropdown(
                      "size",
                      SIZE_OPTIONS.map((s) => ({ value: s, label: s })),
                      undefined,
                      isAdvance,
                      [prefillEstimatedTransfer, prefillIncome, prefillDriverWage],
                    )}
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="สถานที่รับตู้" name="pickupLocationId">
                    {selectDropdown(
                      "pickupLocationId",
                      generalLocations.map((l) => ({ value: l.id, label: l.name })),
                      addButton("location", "general", "pickupLocationId"),
                      isAdvance,
                      [prefillEstimatedTransfer, prefillIncome],
                    )}
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="โรงงาน" name="factoryLocationId">
                    {selectDropdown(
                      "factoryLocationId",
                      factoryLocations.map((l) => ({ value: l.id, label: l.name })),
                      addButton("location", "factory", "factoryLocationId"),
                      isAdvance,
                      [prefillIncome, prefillDriverWage],
                    )}
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="สถานที่คืนตู้" name="returnLocationId">
                    {selectDropdown(
                      "returnLocationId",
                      generalLocations.map((l) => ({ value: l.id, label: l.name })),
                      addButton("location", "general", "returnLocationId"),
                      isAdvance,
                      [prefillEstimatedTransfer, prefillIncome],
                    )}
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>

          {/* Section 2 + 3: แสดงหลังสร้าง job แล้ว (ไม่แสดงถ้าเป็นเบิกล่วงหน้า) */}
          {isCreated && !isAdvance && (
            <>
              <Divider style={{ margin: "8px 0" }} />

              <Row gutter={12}>
                <Col span={3}>
                  <Form.Item label="คาดการณ์โอน" name="estimatedTransfer">
                    <Input
                      disabled
                      styles={{ input: { textAlign: "right" } }}
                    />
                  </Form.Item>
                </Col>
                <Col span={3}>
                  {numberInput("actualTransfer", "ยอดโอนจริง", isAdvance)}
                </Col>
                <Col span={3}>
                  <Form.Item label="ส่วนต่าง">
                    <Input
                      disabled
                      styles={{ input: { textAlign: "right" } }}
                      value={
                        !watchActualTransfer
                          ? "-"
                          : difference > 0
                            ? `+${Math.round(difference)}`
                            : String(Math.round(difference))
                      }
                    />
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="รวมยอดโอน">
                    <Input disabled styles={{ input: { textAlign: "right" } }} value={watchActualTransfer ? totalTransfer : "-"} />
                  </Form.Item>
                </Col>
                {isAdmin && (
                  <>
                    <Col span={3}>{numberInput("income", "รายได้", isAdvance)}</Col>
                    <Col span={3}>
                      {numberInput("driverWage", "ค่าเที่ยวคนขับ", isAdvance)}
                    </Col>
                  </>
                )}
                {!isAdvance && activeJob && (
                  <Col span={3}>
                    <Form.Item label="สถานะ">
                      <Button
                        data-testid="job-clear-status-btn"
                        type="link"
                        size="small"
                        icon={clearing ? <LoadingOutlined /> : clearStatus ? <UnlockOutlined /> : <CheckCircleOutlined />}
                        disabled={clearing || (!isAdmin && clearStatus)}
                        title={clearStatus ? "ปลดล็อค" : "เคลียร์"}
                        onClick={async () => {
                          setClearing(true);
                          await fetch(`/api/jobs/${activeJob.id}/clear`, { method: "PATCH" });
                          setClearStatus((prev) => !prev);
                          handleSaveStatus("saved");
                          setClearing(false);
                        }}
                      />
                    </Form.Item>
                  </Col>
                )}
              </Row>
              <Row gutter={12}>
                <Col span={3}>{numberInput("toll", "ค่าทางด่วน", isAdvance)}</Col>
                <Col span={3}>
                  {numberInput("pickupFee", "ค่ารับตู้", isAdvance)}
                </Col>
                <Col span={3}>
                  {numberInput("returnFee", "ค่าคืนตู้", isAdvance)}
                </Col>
                <Col span={3}>{numberInput("liftFee", "ค่ายกตู้", isAdvance)}</Col>
                <Col span={3}>
                  {numberInput("storageFee", "ค่าฝากตู้", isAdvance)}
                </Col>
                <Col span={3}>{numberInput("tire", "ค่ายาง", isAdvance)}</Col>
                <Col span={3}>{numberInput("other", "อื่นๆ", isAdvance)}</Col>
                <Col span={3}>
                  <Form.Item label="รวมคนรถปิดงาน">
                    <Input disabled styles={{ input: { textAlign: "right" } }} value={driverOverall || undefined} />
                  </Form.Item>
                </Col>
              </Row>

              {/* Section 3: น้ำมัน */}
              <Divider style={{ margin: "8px 0" }} />

              <Row gutter={12}>
                <Col span={3}>{numberInput("mileage", "ไมล์รถ", isAdvance, true)}</Col>
                <Col span={3}>
                  {numberInput("fuelOfficeLiters", "น้ำมัน OFF (ลิตร)", isAdvance, true)}
                </Col>
                <Col span={3}>
                  {numberInput("fuelCashLiters", "น้ำมันสด (ลิตร)", isAdvance, true)}
                </Col>
                <Col span={3}>
                  {numberInput("fuelCashAmount", "น้ำมันสด (฿)", isAdvance, true)}
                </Col>
                <Col span={3}>
                  {numberInput("fuelCreditLiters", "เครดิต (ลิตร)", isAdvance, true)}
                </Col>
                <Col span={3}>
                  {numberInput("fuelCreditAmount", "เครดิต (฿)", isAdvance, true)}
                </Col>
              </Row>
            </>
          )}
        </Form>
      </Modal>

      <QuickAddModal
        open={quickAddOpen}
        type={quickAddType}
        locationType={quickAddLocationType}
        onClose={() => setQuickAddOpen(false)}
        onSuccess={(item) => {
          onRefreshReferenceData();
          if (quickAddField) {
            form.setFieldValue(quickAddField, item.id);
            if (isCreated) {
              setTimeout(() => handleFieldBlur(quickAddField), 0);
            }
          }
        }}
      />
    </>
  );
}
