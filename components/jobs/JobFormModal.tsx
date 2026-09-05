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
  Space,
  Checkbox,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  LoadingOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  UnlockOutlined,
  CloseOutlined,
  ShareAltOutlined,
  LinkOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { Popconfirm } from "antd";
import dayjs from "dayjs";
import type { Job, Customer, Location, JobTransfer, JobTowingLink, TowingJobSummary, MainJobSummary } from "@/types/job";
import { JOB_TYPES, SIZE_OPTIONS, NO_JOB_REASONS } from "@/types/job";
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
  const [transfers, setTransfers] = useState<JobTransfer[]>([]);
  const [isCancelled, setIsCancelled] = useState(false);

  // Carry-over (ยกยอดไปงานอื่น)
  const [carryOverOpen, setCarryOverOpen] = useState(false);
  const [carryOverMonth, setCarryOverMonth] = useState<string>(""); // YYYY-MM
  const [carryOverJobs, setCarryOverJobs] = useState<Job[]>([]);
  const [carryOverTargetId, setCarryOverTargetId] = useState<string>("");
  const [carryOverLoading, setCarryOverLoading] = useState(false);
  const [carryOverSaving, setCarryOverSaving] = useState(false);
  const [carryOverDone, setCarryOverDone] = useState<{ jobId: string; jobNumber: string; jobDate: string; jobType: string } | null>(null);

  // Towing links
  const [towingLinks, setTowingLinks] = useState<JobTowingLink[]>([]);
  const [towingMainJob, setTowingMainJob] = useState<MainJobSummary | null>(null);
  const [towingCandidates, setTowingCandidates] = useState<{ slot: 1 | 2; jobs: TowingJobSummary[] } | null>(null);
  const [towingCandidatesLoading, setTowingCandidatesLoading] = useState<1 | 2 | null>(null);
  const [towingLinking, setTowingLinking] = useState<1 | 2 | null>(null);

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
  // "ไม่มีงาน" ใช้ฟอร์มแบบพิเศษเหมือนเบิกล่วงหน้า (ระบบออกเลขให้, ไม่มีข้อมูลการเงิน)
  const isNoJob = jobTypeWatch === "noJob";
  const isSpecialType = isAdvance || isNoJob;
  const watchPickupLocationId = Form.useWatch("pickupLocationId", form);
  const watchReturnLocationId = Form.useWatch("returnLocationId", form);

  // Fetch and preview next ADV number when jobType switches to เบิกล่วงหน้า
  useEffect(() => {
    if (isSpecialType && mode === "create" && !createdJob) {
      fetch(`/api/jobs/advance-number?jobType=${jobTypeWatch}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.jobNumber) form.setFieldValue("jobNumber", data.jobNumber);
        })
        .catch(() => {});
    } else if (!isSpecialType && mode === "create" && !createdJob) {
      form.setFieldValue("jobNumber", undefined);
    }
  }, [isSpecialType, jobTypeWatch, mode, createdJob, form]);

  // คาดการณ์โอน: auto-sum จากคาดการณ์ค่ารับตู้ + ค่าคืนตู้ (realtime) — ช่อง read-only
  const watchEstimatedPickupFee = Form.useWatch("estimatedPickupFee", form);
  const watchEstimatedReturnFee = Form.useWatch("estimatedReturnFee", form);

  useEffect(() => {
    const pickup = String(watchEstimatedPickupFee ?? "").trim();
    const ret = String(watchEstimatedReturnFee ?? "").trim();
    if (pickup === "" && ret === "") {
      form.setFieldValue("estimatedTransfer", undefined);
      return;
    }
    const sum = (Number(pickup) || 0) + (Number(ret) || 0);
    form.setFieldValue("estimatedTransfer", sum);
  }, [watchEstimatedPickupFee, watchEstimatedReturnFee, form]);

  // Computed fields
  const watchAdvance = Form.useWatch("advance", form) || 0;
  const watchToll = Form.useWatch("toll", form) || 0;
  const watchPickupFee = Form.useWatch("pickupFee", form) || 0;
  const watchReturnFee = Form.useWatch("returnFee", form) || 0;
  const watchLiftFee = Form.useWatch("liftFee", form) || 0;
  const watchStorageFee = Form.useWatch("storageFee", form) || 0;
  const watchTire = Form.useWatch("tire", form) || 0;
  const watchOther = Form.useWatch("other", form) || 0;
  const watchFuelCashAmount = Form.useWatch("fuelCashAmount", form) || 0;
  const watchActualTransfer = Number(activeJob?.actualTransferPrev ?? 0);

  const driverOverall =
    Number(watchAdvance) +
    Number(watchToll) +
    Number(watchPickupFee) +
    Number(watchReturnFee) +
    Number(watchLiftFee) +
    Number(watchStorageFee) +
    Number(watchTire) +
    Number(watchOther) +
    Number(watchFuelCashAmount);

  const completedTransferSum = transfers
    .filter((t) => t.isCompleted)
    .reduce((s, t) => s + Number(t.amount), 0);

  const difference =
    (isCancelled ? 0 : driverOverall) - Number(watchActualTransfer) - completedTransferSum;
  const totalTransfer = completedTransferSum;

  // ส่วนต่าง: ติดลบ = แดงสด, บวก = น้ำเงินสด, 0/ไม่มีค่า = พื้นหลัง disabled ปกติ
  const roundedDifference = Math.round(difference);
  const differenceStyle =
    !driverOverall && !isCancelled
      ? undefined
      : roundedDifference < 0
        ? { backgroundColor: "#fff1f0", color: "#f5222d", borderColor: "#ffa39e" }
        : roundedDifference > 0
          ? { backgroundColor: "#e6f4ff", color: "#1677ff", borderColor: "#91caff" }
          : undefined;

  useEffect(() => {
    if (open) {
      setCreatedJob(null);
      setSaveStatus("idle");
      setClearStatus(mode === "edit" && job ? !!job.clearStatus : false);
      setIsCancelled(mode === "edit" && job ? !!job.isCancelled : false);
      setTransfers(mode === "edit" && job?.transfers ? job.transfers : []);
      setCarryOverOpen(false);
      setCarryOverMonth("");
      setCarryOverJobs([]);
      setCarryOverTargetId("");
      setTowingLinks(mode === "edit" && job?.towingLinksAsMain ? job.towingLinksAsMain : []);
      setTowingMainJob(mode === "edit" && job?.towingLinkAsTowing?.mainJob ? job.towingLinkAsTowing.mainJob : null);
      setTowingCandidates(null);
      // restore carryOverDone from existing job data
      const existingCarryId = (mode === "edit" && job) ? job.carryOverToJobId : null;
      if (existingCarryId) {
        fetch(`/api/jobs/${existingCarryId}`)
          .then((r) => r.json())
          .then((j: Job) => setCarryOverDone({ jobId: j.id, jobNumber: j.jobNumber, jobDate: j.jobDate, jobType: j.jobType }))
          .catch(() => setCarryOverDone(null));
      } else {
        setCarryOverDone(null);
      }
      if (mode === "edit" && job) {
        const estimatedPickup = job.estimatedPickupFee ?? undefined
        const estimatedReturn = job.estimatedReturnFee ?? undefined
        const estimated = estimatedPickup != null && estimatedReturn != null
          ? Number(estimatedPickup) + Number(estimatedReturn)
          : estimatedPickup != null ? Number(estimatedPickup)
          : estimatedReturn != null ? Number(estimatedReturn)
          : undefined
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
          estimatedPickupFee: estimatedPickup,
          estimatedReturnFee: estimatedReturn,
          estimatedTransfer: estimated,
          actualTransferPrev: job.actualTransferPrev,
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
          remarks: job.remarks,
          noJobReason: job.noJobReason || undefined,
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
      "estimatedPickupFee",
      "estimatedReturnFee",
      "actualTransferPrev",
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
      field === "jobType" ||
      field === "noJobReason"
    ) {
      value = rawValue ?? null;
    } else if (field === "remarks") {
      const str = String(rawValue ?? "").trim();
      value = str === "" ? null : str;
    } else if (field === "jobNumber") {
      const str = String(rawValue ?? "").trim();
      if (str === "") {
        // เลขที่งานว่างไม่ได้ — คืนค่าเดิม
        form.setFieldValue("jobNumber", targetJob.jobNumber);
        message.error("กรุณากรอก JOB/เลขที่");
        return;
      }
      value = str;
      form.setFieldValue("jobNumber", str);
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

  const prefillEstimatedTransfer = async (trigger?: "pickupLocationId" | "returnLocationId" | "size" | "jobType") => {
    const jobType = form.getFieldValue("jobType");
    const size = form.getFieldValue("size");
    if (!jobType || !size) return;

    const pickupLocationId = form.getFieldValue("pickupLocationId");
    const returnLocationId = form.getFieldValue("returnLocationId");
    if (!pickupLocationId && !returnLocationId) return;

    // ถ้า trigger จาก pickupLocationId ให้ยิงเฉพาะ pickup
    // ถ้า trigger จาก returnLocationId ให้ยิงเฉพาะ return
    // ถ้า trigger จาก size/jobType ให้ยิงทั้งคู่ที่มีค่า
    const sendPickup = trigger === "pickupLocationId" || trigger === "size" || trigger === "jobType" ? pickupLocationId : undefined;
    const sendReturn = trigger === "returnLocationId" || trigger === "size" || trigger === "jobType" ? returnLocationId : undefined;

    if (!sendPickup && !sendReturn) return;

    try {
      const res = await fetch("/api/jobs/calculate/estimated-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType, size, pickupLocationId: sendPickup, returnLocationId: sendReturn }),
      });
      const data = await res.json();
      const feeUpdates: Record<string, number | undefined> = {};
      if (sendPickup && data.pickupFee !== null) feeUpdates.estimatedPickupFee = data.pickupFee;
      if (sendReturn && data.returnFee !== null) feeUpdates.estimatedReturnFee = data.returnFee;

      if (Object.keys(feeUpdates).length > 0) {
        form.setFieldsValue(feeUpdates);
        const currentPickup = feeUpdates.estimatedPickupFee ?? Number(form.getFieldValue("estimatedPickupFee") || 0);
        const currentReturn = feeUpdates.estimatedReturnFee ?? Number(form.getFieldValue("estimatedReturnFee") || 0);
        const estimated = currentPickup + currentReturn;
        // ดึงค่าใหม่จากระบบ → กลับมาใช้ auto-sum แทนค่าที่เคยพิมพ์ทับ
          form.setFieldsValue({ estimatedTransfer: estimated });
        if (isCreated) {
          await Promise.all([
            "estimatedPickupFee" in feeUpdates ? handleFieldBlur("estimatedPickupFee") : Promise.resolve(),
            "estimatedReturnFee" in feeUpdates ? handleFieldBlur("estimatedReturnFee") : Promise.resolve(),
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
    const factoryLocationId = form.getFieldValue("factoryLocationId") ?? null;
    if (!jobType || !size) return;
    if (jobType !== "towing" && !factoryLocationId) return;
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

  const handleCarryOverMonthChange = async (monthVal: string) => {
    setCarryOverMonth(monthVal);
    setCarryOverTargetId("");
    setCarryOverJobs([]);
    if (!monthVal || !activeJob?.driverId) return;
    setCarryOverLoading(true);
    try {
      const res = await fetch(`/api/jobs?driverId=${activeJob.driverId}&month=${monthVal}`);
      const data: Job[] = await res.json();
      setCarryOverJobs(data.filter((j) => j.id !== activeJob.id && !j.clearStatus && j.jobType !== "advance"));
    } catch {
      // ignore
    } finally {
      setCarryOverLoading(false);
    }
  };

  const handleCarryOverConfirm = async () => {
    if (!carryOverTargetId || !activeJob) return;
    const amount = Math.abs(Math.round(difference));
    setCarryOverSaving(true);
    try {
      // อัปเดต job ปลายทาง: ใส่ยอด actualTransferPrev
      const res = await fetch(`/api/jobs/${carryOverTargetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualTransferPrev: amount }),
      });
      if (!res.ok) {
        message.error("ยกยอดล้มเหลว");
        return;
      }
      // บันทึก carryOverToJobId ที่ job ต้นทาง
      const res2 = await fetch(`/api/jobs/${activeJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carryOverToJobId: carryOverTargetId }),
      });
      if (!res2.ok) {
        const err = await res2.json();
        message.error(err.error || "บันทึก carryOverToJobId ล้มเหลว");
        return;
      }
      const targetJob = carryOverJobs.find((j) => j.id === carryOverTargetId)!;
      setCarryOverDone({
        jobId: targetJob.id,
        jobNumber: targetJob.jobNumber,
        jobDate: targetJob.jobDate,
        jobType: targetJob.jobType,
      });
      setCarryOverOpen(false);
      message.success(`ยกยอด ${amount.toLocaleString()} บาท → ${targetJob.jobNumber} เรียบร้อย`);
    } catch {
      message.error("ยกยอดล้มเหลว");
    } finally {
      setCarryOverSaving(false);
    }
  };

  const handleCarryOverRemove = async () => {
    if (!carryOverDone || !activeJob) return;
    try {
      // ล้าง actualTransferPrev ที่ job ปลายทาง
      await fetch(`/api/jobs/${carryOverDone.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualTransferPrev: null }),
      });
      // ล้าง carryOverToJobId ที่ job ต้นทาง
      await fetch(`/api/jobs/${activeJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carryOverToJobId: null }),
      });
      setCarryOverDone(null);
      message.success("ยกเลิกการยกยอดแล้ว");
    } catch {
      message.error("ยกเลิกการยกยอดล้มเหลว");
    }
  };

  const handleOpenTowingCandidates = async (slot: 1 | 2) => {
    if (!activeJob) return;
    if (towingCandidates?.slot === slot) {
      setTowingCandidates(null);
      return;
    }
    setTowingCandidatesLoading(slot);
    setTowingCandidates(null);
    try {
      const res = await fetch(`/api/jobs/${activeJob.id}/towing-candidates?slot=${slot}`);
      const jobs: TowingJobSummary[] = await res.json();
      setTowingCandidates({ slot, jobs });
    } catch {
      message.error("โหลดรายการทอยตู้ไม่สำเร็จ");
    } finally {
      setTowingCandidatesLoading(null);
    }
  };

  const handleLinkTowing = async (slot: 1 | 2, towingJobId: string) => {
    if (!activeJob) return;
    setTowingLinking(slot);
    try {
      const res = await fetch(`/api/jobs/${activeJob.id}/towing-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: slot, towingJobId }),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "ลิ้งงานล้มเหลว");
        return;
      }
      const link: JobTowingLink = await res.json();
      setTowingLinks((prev) => [...prev.filter((l) => l.sequence !== slot), link].sort((a, b) => a.sequence - b.sequence));
      setTowingCandidates(null);
      message.success(`เชื่อม JOB ${slot === 1 ? "รับตู้" : "คืนตู้"}เรียบร้อย`);

      // คำนวณ estimatedPickupFee / estimatedReturnFee จาก location ของ towing job
      const jobType = form.getFieldValue("jobType");
      const size = form.getFieldValue("size");
      if (jobType && size) {
        const towingPickupId = link.towingJob.pickupLocation?.id;
        const towingReturnId = link.towingJob.returnLocation?.id;
        // slot 1: towing pickupLocation (xxx) → estimatedPickupFee
        // slot 2: towing returnLocation (xxx) → estimatedReturnFee
        const lookupId = slot === 1 ? towingPickupId : towingReturnId;
        const feeField = slot === 1 ? "estimatedPickupFee" : "estimatedReturnFee";
        if (lookupId) {
          try {
            const calcRes = await fetch("/api/jobs/calculate/estimated-transfer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jobType,
                size,
                pickupLocationId: slot === 1 ? lookupId : undefined,
                returnLocationId: slot === 2 ? lookupId : undefined,
              }),
            });
            const calcData = await calcRes.json();
            const fee = slot === 1 ? calcData.pickupFee : calcData.returnFee;
            if (fee !== null && fee !== undefined) {
              form.setFieldValue(feeField, fee);
              // อัปเดต estimatedTransfer รวม
              const pickup = Number(form.getFieldValue("estimatedPickupFee") || 0);
              const ret = Number(form.getFieldValue("estimatedReturnFee") || 0);
                      form.setFieldValue("estimatedTransfer", pickup + ret);
              await handleFieldBlur(feeField);
            }
          } catch { /* ไม่ block UX ถ้า calc ล้มเหลว */ }
        }
      }
    } catch {
      message.error("เชื่อม JOB ล้มเหลว");
    } finally {
      setTowingLinking(null);
    }
  };

  const handleUnlinkTowing = async (slot: 1 | 2) => {
    if (!activeJob) return;
    try {
      const res = await fetch(`/api/jobs/${activeJob.id}/towing-links/${slot}`, { method: "DELETE" });
      if (!res.ok) {
        message.error("ยกเลิกลิ้งล้มเหลว");
        return;
      }
      setTowingLinks((prev) => prev.filter((l) => l.sequence !== slot));
      message.success("ยกเลิกลิ้งแล้ว");
    } catch {
      message.error("ยกเลิกลิ้งล้มเหลว");
    }
  };

  const isLocalTransfer = (id: string) => id.startsWith("tmp-");

  const handleAddTransfer = () => {
    if (!activeJob) return;
    const tmp: JobTransfer = {
      id: `tmp-${Date.now()}`,
      jobId: activeJob.id,
      amount: 0,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTransfers((prev) => [...prev, tmp]);
  };

  const handleUpdateTransferLocal = (
    transferId: string,
    patch: { amount?: number; isCompleted?: boolean },
  ) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === transferId ? { ...t, ...patch } : t)),
    );
  };

  const handleUpdateTransfer = async (
    transferId: string,
    patch: { amount?: number; isCompleted?: boolean },
  ) => {
    if (isLocalTransfer(transferId)) {
      const current = transfers.find((t) => t.id === transferId);
      if (!current || !activeJob) return;
      const next = { ...current, ...patch };

      // Persist on first ✓
      if (patch.isCompleted === true) {
        if (Number(next.amount) === 0) {
          message.warning("กรุณากรอกจำนวนเงินก่อน");
          return;
        }
        handleSaveStatus("saving");
        try {
          const res = await fetch(`/api/jobs/${activeJob.id}/transfers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: Number(next.amount),
              isCompleted: true,
            }),
          });
          if (!res.ok) {
            handleSaveStatus("error");
            return;
          }
          const created: JobTransfer = await res.json();
          setTransfers((prev) =>
            prev.map((t) => (t.id === transferId ? created : t)),
          );
          handleSaveStatus("saved");
        } catch {
          handleSaveStatus("error");
        }
        return;
      }

      // Pure local edit (amount or uncheck) — just update state
      handleUpdateTransferLocal(transferId, patch);
      return;
    }

    handleSaveStatus("saving");
    try {
      const res = await fetch(`/api/jobs/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        handleSaveStatus("error");
        return;
      }
      const updated: JobTransfer = await res.json();
      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, ...updated } : t)),
      );
      handleSaveStatus("saved");
    } catch {
      handleSaveStatus("error");
    }
  };

  const handleDeleteTransfer = async (transferId: string) => {
    if (isLocalTransfer(transferId)) {
      setTransfers((prev) => prev.filter((t) => t.id !== transferId));
      return;
    }
    handleSaveStatus("saving");
    try {
      const res = await fetch(`/api/jobs/transfers/${transferId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        handleSaveStatus("error");
        return;
      }
      setTransfers((prev) => prev.filter((t) => t.id !== transferId));
      handleSaveStatus("saved");
    } catch {
      handleSaveStatus("error");
    }
  };

  // Create job (POST) — needs jobDate + jobType + jobNumber
  const handleCreate = async () => {
    const jobNumber = form.getFieldValue("jobNumber");
    const jobDate = form.getFieldValue("jobDate");
    const jobType = form.getFieldValue("jobType");

    if (!jobDate || !jobType || (!jobNumber && jobType !== "advance" && jobType !== "noJob")) {
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
    const noJobReason = isNoJob ? form.getFieldValue("noJobReason") : undefined;
    const noJobRemarks = isNoJob
      ? String(form.getFieldValue("remarks") ?? "").trim() || undefined
      : undefined;

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
          ...(noJobReason && { noJobReason }),
          ...(noJobRemarks && { remarks: noJobRemarks }),
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
  const isTowingLinked = jobTypeWatch === "towing" && !!towingMainJob;
  const hasSlot1Link = towingLinks.some((l) => l.sequence === 1);
  const hasSlot2Link = towingLinks.some((l) => l.sequence === 2);
  const hasAnyTowingLink = hasSlot1Link || hasSlot2Link;

  const numberRule = {
    validator: (_: unknown, value: string) => {
      if (value === undefined || value === null || String(value).trim() === "")
        return Promise.resolve();
      return isNaN(Number(value))
        ? Promise.reject("กรุณากรอกตัวเลข")
        : Promise.resolve();
    },
  };

  const numberInput = (field: string, label: string, disabled?: boolean, skipClearLock?: boolean, bgColor?: string) => (
    <Form.Item label={label} name={field} rules={[numberRule]}>
      <Input
        allowClear
        autoComplete="off"
        className={bgColor && !fieldsDisabled && !disabled && !(!skipClearLock && isCleared) ? "input-bg-highlight" : undefined}
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
      // กด Tab ไล่ฟอร์มแล้วให้ dropdown เปิดเอง ไม่ต้องกดซ้ำ
      showAction={["focus"]}
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

  const renderTransferChip = (t: JobTransfer, index: number) => {
    const amt = Number(t.amount);
    const sign = amt > 0 ? "out" : amt < 0 ? "in" : "zero";
    // Completed transfers render with the native disabled style (like other locked inputs),
    // not a green highlight. Custom background/border only apply while still editable.
    const isInputDisabled = isCleared || t.isCompleted;
    const border =
      sign === "out" ? "#91CAFF" : sign === "in" ? "#FFD591" : "#D9D9D9";

    return (
      <Col span={3} key={t.id}>
        <Form.Item
          label={`${amt < 0 ? "ยอดโอนคืน" : "ยอดโอน"}ครั้งที่ ${index + 1}`}
          style={{ marginBottom: 0 }}
        >
          <Space.Compact style={{ width: "100%" }}>
            <Popconfirm
              title="ยืนยันลบรายการนี้?"
              okText="ลบ"
              cancelText="ยกเลิก"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDeleteTransfer(t.id)}
              disabled={isCleared}
            >
              <Button
                size="small"
                icon={<CloseOutlined style={{ color: "#ff4d4f" }} />}
                disabled={isCleared}
              />
            </Popconfirm>
            <Input
              size="small"
              key={`${t.id}-${amt}`}
              defaultValue={amt === 0 ? "" : amt}
              disabled={isInputDisabled}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const newAmt = raw === "" ? 0 : Number(raw);
                if (isNaN(newAmt) || newAmt === amt) return;
                handleUpdateTransfer(t.id, { amount: newAmt });
              }}
              onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
              styles={{
                input: { textAlign: "right", ...(isInputDisabled ? {} : { background: "#D4EEF1" }) },
              }}
              style={isInputDisabled ? undefined : { borderColor: border }}
            />
            <Button
              size="small"
              icon={
                <CheckOutlined
                  style={{ color: t.isCompleted ? "#bfbfbf" : "#52c41a" }}
                />
              }
              disabled={isCleared}
              onClick={() => {
                if (amt === 0) {
                  message.warning("กรุณากรอกจำนวนเงินก่อน");
                  return;
                }
                handleUpdateTransfer(t.id, { isCompleted: !t.isCompleted });
              }}
            />
          </Space.Compact>
        </Form.Item>
      </Col>
    );
  };

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
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
              {!isSpecialType && activeJob && (
                <Tooltip title={completedTransferSum > 0 ? "" : "ต้องมียอดโอนก่อน"}>
                  <Checkbox
                    data-testid="job-cancel-checkbox"
                    style={{ marginRight: "auto" }}
                    checked={isCancelled}
                    disabled={isCleared || completedTransferSum === 0}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setIsCancelled(next);
                      handleSaveStatus("saving");
                      const ok = await onFieldSave(activeJob.id, "isCancelled", next);
                      handleSaveStatus(ok ? "saved" : "error");
                      if (!ok) setIsCancelled(!next);
                    }}
                  >
                    ยกเลิกใบงาน
                  </Checkbox>
                </Tooltip>
              )}
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
              {isAdmin && !isSpecialType && activeJob && (
                <Button
                  data-testid="job-prefill-btn"
                  type="default"
                  icon={<DownloadOutlined />}
                  disabled={isCleared}
                  onClick={() => {
                    prefillIncome();
                    prefillDriverWage();
                  }}
                >
                  ดึงข้อมูล
                </Button>
              )}
              {!isSpecialType && activeJob && (
                <Button
                  data-testid="job-clear-status-btn"
                  type="default"
                  style={{ width: 100 }}
                  icon={clearing ? <LoadingOutlined /> : clearStatus ? <UnlockOutlined /> : <CheckCircleOutlined />}
                  disabled={clearing || (!isAdmin && clearStatus) || (!clearStatus && Math.round(difference) !== 0 && !carryOverDone && !isCancelled)}
                  onClick={async () => {
                    setClearing(true);
                    try {
                      const res = await fetch(`/api/jobs/${activeJob.id}/clear`, { method: "PATCH" });
                      if (res.ok) {
                        setClearStatus((prev) => !prev);
                        handleSaveStatus("saved");
                      } else {
                        const err = await res.json().catch(() => ({}));
                        message.error(err.error || "เปลี่ยนสถานะเคลียร์ไม่สำเร็จ");
                        handleSaveStatus("error");
                      }
                    } catch {
                      message.error("เปลี่ยนสถานะเคลียร์ไม่สำเร็จ");
                      handleSaveStatus("error");
                    } finally {
                      setClearing(false);
                    }
                  }}
                >
                  {clearStatus ? "ปลดล็อค" : "เคลียร์"}
                </Button>
              )}
              <Button data-testid="job-form-close-btn" type="primary" onClick={onClose} style={{ width: 100 }}>บันทึก</Button>
            </div>
        }
        width="100%"
        // ฟอร์มสูงเกือบเต็มจอ — ลดระยะห่างจากขอบบน (default antd = 100px) ให้เห็นเนื้อหาได้มากขึ้น
        style={{ top: 16 }}
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
                    showAction={["focus"]}
                    disabled={isCleared || isTowingLinked || hasAnyTowingLink}
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
                      setTimeout(() => prefillEstimatedTransfer("jobType"), 0);
                      setTimeout(() => prefillIncome(), 0);
                    }}
                  />
              </Form.Item>
            </Col>
            <Col span={3}>
              <Form.Item
                label="JOB/เลขที่"
                name="jobNumber"
                rules={[{ required: !isCreated && mode === "create" && !isSpecialType, message: "กรุณากรอก JOB/เลขที่" }]}
              >
                <Input
                  id="jobNumber"
                  data-testid="job-number-input"
                  disabled={isSpecialType || (isCreated && isCleared)}
                  onBlur={() => isCreated && handleFieldBlur("jobNumber")}
                />
              </Form.Item>
            </Col>
            {mode === "create" && !isCreated && isAdvance && (
              <Col span={3}>
                <Form.Item label="เบิกล่วงหน้า" name="advance" rules={[numberRule]}>
                  <Input allowClear styles={{ input: { textAlign: "right" } }} />
                </Form.Item>
              </Col>
            )}
            {mode === "create" && !isCreated && isNoJob && (
              <>
                <Col span={3}>
                  <Form.Item
                    label="เหตุผล"
                    name="noJobReason"
                    rules={[{ required: true, message: "กรุณาเลือกเหตุผล" }]}
                  >
                    <Select
                      id="no-job-reason-select"
                      allowClear
                      showAction={["focus"]}
                      options={NO_JOB_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="หมายเหตุ" name="remarks">
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                </Col>
              </>
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
                        const fieldsToValidate = isSpecialType
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
            {isCreated && isNoJob && (
              <>
                <Col span={3}>
                  <Form.Item label="เหตุผล" name="noJobReason">
                    {selectDropdown(
                      "noJobReason",
                      NO_JOB_REASONS.map((r) => ({ value: r.value, label: r.label })),
                    )}
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="หมายเหตุ" name="remarks">
                    <Input
                      allowClear
                      autoComplete="off"
                      disabled={isCleared}
                      onBlur={() => handleFieldBlur("remarks")}
                    />
                  </Form.Item>
                </Col>
              </>
            )}
            {isCreated && !isSpecialType && (
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
                      [() => prefillEstimatedTransfer("size"), prefillIncome, prefillDriverWage],
                    )}
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="สถานที่รับตู้" name="pickupLocationId">
                    {selectDropdown(
                      "pickupLocationId",
                      generalLocations.map((l) => ({ value: l.id, label: l.name })),
                      addButton("location", "general", "pickupLocationId"),
                      isAdvance || isTowingLinked || hasSlot1Link,
                      [() => prefillEstimatedTransfer("pickupLocationId"), prefillIncome],
                    )}
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="โรงงาน" name="factoryLocationId">
                    {selectDropdown(
                      "factoryLocationId",
                      factoryLocations.map((l) => ({ value: l.id, label: l.name })),
                      addButton("location", "factory", "factoryLocationId"),
                      isAdvance || isTowingLinked,
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
                      isAdvance || isTowingLinked || hasSlot2Link,
                      [() => prefillEstimatedTransfer("returnLocationId"), prefillIncome],
                    )}
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>

          {/* Section 2 + 3: แสดงหลังสร้าง job แล้ว (ไม่แสดงถ้าเป็นเบิกล่วงหน้า) */}
          {isCreated && !isSpecialType && (
            <>
              <Divider style={{ margin: "8px 0" }} />

              <Row gutter={12}>
                <Col span={3}>
                  {numberInput("estimatedPickupFee", "คาดการณ์ค่ารับตู้")}
                </Col>
                <Col span={3}>
                  {numberInput("estimatedReturnFee", "คาดการณ์ค่าคืนตู้")}
                </Col>
                <Col span={3}>
                  <Form.Item label="คาดการณ์โอน" name="estimatedTransfer" rules={[numberRule]}>
                    <Input disabled styles={{ input: { textAlign: "right" } }} />
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="ยกยอด" name="actualTransferPrev">
                    <Input disabled styles={{ input: { textAlign: "right" } }} />
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item label="ส่วนต่าง">
                    <Input
                      disabled
                      styles={{
                        input: {
                          textAlign: "right",
                          ...(differenceStyle ? { ...differenceStyle, fontWeight: 700 } : {}),
                        },
                      }}
                      value={
                        !driverOverall && !isCancelled
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
                    <Input disabled styles={{ input: { textAlign: "right" } }} value={completedTransferSum ? totalTransfer : "-"} />
                  </Form.Item>
                </Col>
                {/* ปุ่มยกยอด หรือ chip job ที่ยกยอดไปแล้ว */}
                {(carryOverDone || ((driverOverall > 0 || isCancelled) && difference < 0 && !isCleared && !watchActualTransfer)) && <Col span={3}>
                  <Form.Item label="ยกยอดไป" style={{ marginBottom: 0 }}>
                    {carryOverDone ? (
                      <Space.Compact style={{ width: "100%" }}>
                        <Popconfirm
                          title="ยกเลิกการยกยอดนี้?"
                          okText="ยืนยัน"
                          cancelText="ยกเลิก"
                          okButtonProps={{ danger: true }}
                          onConfirm={handleCarryOverRemove}
                          disabled={isCleared}
                        >
                          <Button
                            size="small"
                            icon={<CloseOutlined style={{ color: "#ff4d4f" }} />}
                            disabled={isCleared}
                          />
                        </Popconfirm>
                        <Input
                          size="small"
                          readOnly
                          value={carryOverDone.jobNumber}
                          styles={{ input: { textAlign: "right", background: "#FFF0F6" } }}
                          style={{ borderColor: "#FFADD2" }}
                        />
                      </Space.Compact>
                    ) : (driverOverall > 0 || isCancelled) && difference < 0 && !isCleared && !watchActualTransfer ? (
                      <Button
                        size="small"
                        type="dashed"
                        icon={<ShareAltOutlined />}
                        style={{ width: "100%" }}
                        onClick={() => {
                          setCarryOverOpen(true);
                          const defaultMonth = month >= dayjs().format("YYYY-MM") ? month : dayjs().format("YYYY-MM");
                          handleCarryOverMonthChange(defaultMonth);
                        }}
                      >
                        ยกยอดไปงานอื่น
                      </Button>
                    ) : null}
                  </Form.Item>
                </Col>}
              </Row>

              {/* Inline carry-over form */}
              {carryOverOpen && (
                <Row gutter={12} align="bottom" justify="end" style={{ marginBottom: 8 }}>
                  <Col span={3}>
                    <Form.Item label="เดือน" style={{ marginBottom: 0 }}>
                      <Select
                        size="small"
                        value={carryOverMonth || undefined}
                        placeholder="เลือกเดือน"
                        popupMatchSelectWidth={false}
                        onChange={handleCarryOverMonthChange}
                        options={(() => {
                          const today = dayjs().format("YYYY-MM");
                          const start = month;
                          const end = start > today ? start : today;
                          const months = [];
                          let cur = dayjs(start);
                          while (cur.format("YYYY-MM") <= end) {
                            const m = cur.format("YYYY-MM");
                            months.push({ value: m, label: cur.format("MMM YYYY") });
                            cur = cur.add(1, "month");
                          }
                          return months;
                        })()}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item label="JOB/เลขที่" style={{ marginBottom: 0 }}>
                      <Select
                        size="small"
                        showSearch
                        value={carryOverTargetId || undefined}
                        placeholder={carryOverLoading ? "กำลังโหลด..." : "เลือก JOB"}
                        loading={carryOverLoading}
                        popupMatchSelectWidth={false}
                        filterOption={(input, option) =>
                          ((option?.label as string) ?? "").toLowerCase().includes(input.toLowerCase())
                        }
                        onChange={setCarryOverTargetId}
                        options={carryOverJobs.map((j) => ({
                          value: j.id,
                          label: j.jobNumber,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item label="ยอด" style={{ marginBottom: 0 }}>
                      <Input
                        size="small"
                        disabled
                        styles={{ input: { textAlign: "right" } }}
                        value={Math.abs(Math.round(difference))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item label=" " style={{ marginBottom: 0 }}>
                      <Space.Compact style={{ width: "100%" }}>
                        <Button
                          size="small"
                          loading={carryOverSaving}
                          disabled={!carryOverTargetId}
                          onClick={handleCarryOverConfirm}
                          style={{
                            width: "50%",
                            ...(carryOverTargetId
                              ? { background: "#52c41a", borderColor: "#52c41a", color: "#fff" }
                              : {}),
                          }}
                        >
                          ยืนยัน
                        </Button>
                        <Button
                          size="small"
                          style={{ width: "50%" }}
                          onClick={() => { setCarryOverOpen(false); setCarryOverTargetId(""); setCarryOverMonth(""); setCarryOverJobs([]); }}
                        >
                          ยกเลิก
                        </Button>
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                </Row>
              )}

              <Divider style={{ margin: "8px 0" }} />

              <Row gutter={12} align="bottom" justify="start">
                {transfers.map((t, i) => renderTransferChip(t, i))}
                <Col span={3}>
                  <Form.Item label=" " style={{ marginBottom: 0 }}>
                    <Button
                      type="dashed"
                      size="small"
                      icon={<PlusOutlined />}
                      disabled={
                        isCleared ||
                        isTowingLinked ||
                        transfers.some((t) => Number(t.amount) === 0)
                      }
                      onClick={handleAddTransfer}
                      style={{ width: "100%" }}
                    >
                      เพิ่มการโอน
                    </Button>
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: "8px 0" }} />
              <Row gutter={12}>
                <Col span={3}>{numberInput("toll", "ค่าทางด่วน", isAdvance || isTowingLinked, false, "#FFF3C4")}</Col>
                <Col span={3}>
                  {numberInput("pickupFee", "ค่ารับตู้", isAdvance || isTowingLinked, false, "#FFF3C4")}
                </Col>
                <Col span={3}>
                  {numberInput("returnFee", "ค่าคืนตู้", isAdvance || isTowingLinked, false, "#FFF3C4")}
                </Col>
                <Col span={3}>{numberInput("liftFee", "ค่ายกตู้", isAdvance || isTowingLinked, false, "#FFF3C4")}</Col>
                <Col span={3}>
                  {numberInput("storageFee", "ค่าฝากตู้", isAdvance || isTowingLinked, false, "#FFF3C4")}
                </Col>
                <Col span={3}>{numberInput("tire", "ค่ายาง", isAdvance || isTowingLinked, false, "#FFF3C4")}</Col>
                <Col span={3}>{numberInput("other", "อื่นๆ", isAdvance || isTowingLinked, false, "#FFF3C4")}</Col>
                <Col span={3}>
                  <Form.Item label="รวมคนรถปิดงาน">
                    <Input disabled styles={{ input: { textAlign: "right" } }} value={driverOverall || "-"} />
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
                  {numberInput("fuelCashAmount", "น้ำมันสด (฿)", isAdvance, true, "#FFF3C4")}
                </Col>
                <Col span={3}>
                  {numberInput("fuelCreditLiters", "เครดิต (ลิตร)", isAdvance, true)}
                </Col>
                <Col span={3}>
                  {numberInput("fuelCreditAmount", "เครดิต (฿)", isAdvance, true)}
                </Col>
                {isAdmin && (
                  <>
                    <Col span={3}>{numberInput("income", "ค่าขนส่ง", isAdvance)}</Col>
                    <Col span={3}>
                      {numberInput("driverWage", "ค่าเที่ยวคนขับ", isAdvance)}
                    </Col>
                  </>
                )}
              </Row>
            {/* Section 4a: งานหลัก — เฉพาะ towing ที่ถูกเชื่อมโยง */}
            {isCreated && jobTypeWatch === "towing" && towingMainJob && (
              <>
                <Divider style={{ margin: "8px 0" }} />
                <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13, color: "#595959" }}>
                  งานหลักที่เชื่อมโยง
                </div>
                <Row gutter={12}>
                  <Col span={6}>
                    <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 4 }}>
                      {towingMainJob.jobType === "inbound" ? "ขาเข้า" : towingMainJob.jobType === "outbound" ? "ขาออก" : towingMainJob.jobType}
                    </div>
                    <Input
                      size="small"
                      readOnly
                      value={towingMainJob.jobNumber}
                      styles={{ input: { background: "#E6F4FF", fontSize: 12 } }}
                      style={{ borderColor: "#91CAFF" }}
                    />
                  </Col>
                </Row>
              </>
            )}

            {/* Section 4b: เชื่อมโยง JOB ทอยตู้ — เฉพาะ inbound/outbound ที่มี SYL */}
            {isCreated && (jobTypeWatch === "inbound" || jobTypeWatch === "outbound") && (() => {
              const sylId = generalLocations.find((l) => l.name === "SYL")?.id;
              // slot 1 รับตู้: return = SYL, slot 2 คืนตู้: pickup = SYL
              const showSlot1 = !!sylId && watchPickupLocationId === sylId;
              const showSlot2 = !!sylId && watchReturnLocationId === sylId;
              const visibleSlots = ([1, 2] as const).filter((s) => s === 1 ? showSlot1 : showSlot2);
              if (visibleSlots.length === 0) return null;
              return (
              <>
                <Divider style={{ margin: "8px 0" }} />
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13, color: "#595959" }}>
                  เชื่อมโยง JOB ทอยตู้
                </div>
                <Row gutter={12}>
                  {visibleSlots.map((slot) => {
                    const linked = towingLinks.find((l) => l.sequence === slot);
                    const label = slot === 1 ? "เชื่อม JOB รับตู้ (xxx→SYL)" : "เชื่อม JOB คืนตู้ (SYL→xxx)";
                    const isOpen = towingCandidates?.slot === slot;
                    const noResults = isOpen && !towingCandidatesLoading && towingCandidates?.jobs.length === 0;

                    return (
                      <Col span={6} key={slot}>
                        <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 4 }}>{label}</div>
                        {linked ? (
                          <Space.Compact style={{ width: "100%" }}>
                            <Popconfirm
                              title="ยกเลิกการเชื่อมโยง JOB นี้?"
                              okText="ยืนยัน"
                              cancelText="ยกเลิก"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => handleUnlinkTowing(slot)}
                              disabled={isCleared}
                            >
                              <Button
                                size="small"
                                icon={<CloseOutlined style={{ color: "#ff4d4f" }} />}
                                disabled={isCleared}
                              />
                            </Popconfirm>
                            <Input
                              size="small"
                              readOnly
                              value={`${linked.towingJob.jobNumber}${linked.towingJob.pickupLocation ? ` · ${linked.towingJob.pickupLocation.name}` : ""}${linked.towingJob.returnLocation ? ` → ${linked.towingJob.returnLocation.name}` : ""}`}
                              styles={{ input: { background: "#F6FFED", fontSize: 12 } }}
                              style={{ borderColor: "#B7EB8F" }}
                            />
                          </Space.Compact>
                        ) : (
                          <>
                            <Button
                              size="small"
                              type="dashed"
                              loading={towingCandidatesLoading === slot}
                              icon={towingCandidatesLoading === slot ? undefined : <LinkOutlined />}
                              style={{ width: "100%", marginBottom: isOpen ? 4 : 0 }}
                              disabled={isCleared || towingCandidatesLoading === slot}
                              onClick={() => handleOpenTowingCandidates(slot)}
                            >
                              {isOpen ? "ยกเลิก" : "เชื่อม JOB"}
                            </Button>
                            {isOpen && !noResults && (
                              <Select
                                autoFocus
                                showSearch
                                size="small"
                                style={{ width: "100%" }}
                                placeholder="ค้นหา JOB..."
                                loading={towingCandidatesLoading === slot}
                                disabled={towingLinking === slot}
                                filterOption={(input, option) =>
                                  ((option?.label as string) ?? "").toLowerCase().includes(input.toLowerCase())
                                }
                                options={(towingCandidates?.jobs ?? []).map((j) => ({
                                  value: j.id,
                                  label: `${j.jobNumber}${j.pickupLocation ? ` · ${j.pickupLocation.name}` : ""}${j.returnLocation ? ` → ${j.returnLocation.name}` : ""}`,
                                }))}
                                onSelect={(val: string) => handleLinkTowing(slot, val)}
                                popupMatchSelectWidth={false}
                                styles={{ popup: { root: { minWidth: 320 } } }}
                              />
                            )}
                            {noResults && (
                              <div style={{ fontSize: 12, color: "#ff4d4f", marginTop: 2 }}>
                                ไม่มี JOB ที่เลือกได้
                              </div>
                            )}
                          </>
                        )}
                      </Col>
                    );
                  })}
                </Row>
              </>
              );
            })()}

            {/* Section 5: หมายเหตุ */}
            <Divider style={{ margin: "8px 0" }} />
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item label="หมายเหตุ" name="remarks" style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    data-testid="job-remarks-input"
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    onBlur={() => isCreated && handleFieldBlur("remarks")}
                  />
                </Form.Item>
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
