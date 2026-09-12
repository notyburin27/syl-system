export interface Customer {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverBankAccount {
  id: string;
  driverId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  vehicleNumber: string | null;
  vehicleRegistration: string | null;
  groupName: string | null;
  /** ฐานเงินเดือน — API ตัด field นี้ออกสำหรับ role ที่ไม่ใช่ ADMIN */
  baseSalary?: number | null;
  /** วันเริ่มงาน (ISO date string) */
  startDate: string | null;
  isActive: boolean;
  resignedAt: string | null;
  bankAccounts: DriverBankAccount[];
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  type: "factory" | "general";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobTransfer {
  id: string;
  jobId: string;
  amount: number;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TowingJobSummary {
  id: string;
  jobNumber: string;
  jobDate: string;
  size: string | null;
  pickupLocation?: Location | null;
  returnLocation?: Location | null;
}

export interface MainJobSummary {
  id: string;
  jobNumber: string;
  jobDate: string;
  jobType: string;
}

export interface JobTowingLink {
  id: string;
  mainJobId: string;
  mainJob?: MainJobSummary;
  towingJobId: string;
  towingJob: TowingJobSummary;
  sequence: number; // 1 = รับตู้, 2 = คืนตู้
  createdAt: string;
}

export interface JobTowingLinkAsMain {
  id: string;
  mainJobId: string;
  mainJob: MainJobSummary;
  towingJobId: string;
  sequence: number;
  createdAt: string;
}

export interface Job {
  id: string;
  jobDate: string;
  jobType: string;
  customerId: string;
  customer?: Customer;
  jobNumber: string;
  driverId: string | null;
  driver?: Driver | null;
  size: string | null;
  pickupLocationId: string | null;
  pickupLocation?: Location | null;
  factoryLocationId: string | null;
  factoryLocation?: Location | null;
  returnLocationId: string | null;
  returnLocation?: Location | null;
  estimatedTransfer?: number | null; // computed, not stored
  income: number | null;
  driverWage: number | null;
  estimatedPickupFee: number | null;
  estimatedReturnFee: number | null;
  actualTransferPrev: number | null;
  advance: number | null;
  toll: number | null;
  pickupFee: number | null;
  returnFee: number | null;
  liftFee: number | null;
  storageFee: number | null;
  tire: number | null;
  other: number | null;
  mileage: number | null;
  fuelOfficeLiters: number | null;
  fuelCashLiters: number | null;
  fuelCashAmount: number | null;
  fuelCreditLiters: number | null;
  fuelCreditAmount: number | null;
  clearStatus: boolean;
  statementVerified: boolean;
  isCancelled: boolean;
  remarks: string | null;
  noJobReason: string | null;
  carryOverToJobId: string | null;
  carryOverToJob?: { jobNumber: string } | null;
  transfers?: JobTransfer[];
  towingLinksAsMain?: JobTowingLink[];
  towingLinkAsTowing?: JobTowingLinkAsMain | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverJobSummary {
  driverId: string;
  driverName: string;
  vehicleNumber: string | null;
  groupName: string | null;
  mainJobCount: number;
  mainTransfer: number;
  towingJobCount: number;
  towingTransfer: number;
  advanceJobCount: number;
  advanceAmount: number;
  driverWageAmount: number;
  totalTransfer: number;
}

export const JOB_TYPES = [
  { value: "inbound",  label: "ขาเข้า" },
  { value: "outbound", label: "ขาออก" },
  { value: "towing",   label: "ทอยตู้" },
  { value: "flatbed",  label: "พื้นเรียบ" },
  { value: "mill",     label: "โรงสี" },
  { value: "advance",  label: "เบิกล่วงหน้า" },
  { value: "noJob",    label: "ไม่มีงาน" },
] as const;

/** ลักษณะงานที่ตั้งอัตราค่าบริการได้ — "เบิกล่วงหน้า" กับ "ไม่มีงาน" ไม่มีอัตรา */
export const RATE_JOB_TYPES = JOB_TYPES.filter(
  (t) => t.value !== "advance" && t.value !== "noJob",
);

/** เหตุผลของงานประเภท "ไม่มีงาน" */
export const NO_JOB_REASONS = [
  { value: "repair",    label: "ซ่อมรถ" },
  { value: "lowVolume", label: "งานน้อย" },
  { value: "cancelled", label: "งานยกเลิก" },
  { value: "other",     label: "อื่นๆ" },
] as const;

export type NoJobReason = (typeof NO_JOB_REASONS)[number]["value"];

export function getNoJobReasonLabel(value: string): string {
  return NO_JOB_REASONS.find((r) => r.value === value)?.label ?? value;
}

export const SIZE_OPTIONS = [
  "20DC",
  "40DC",
  "20RF",
  "40RF",
  "2x20DC",
  "2x20RF",
  "45HC",
  "20OT",
  "40OT",
  "20FL",
  "40FL",
  "truck",
] as const;

export type JobType = (typeof JOB_TYPES)[number]["value"];
export type SizeOption = (typeof SIZE_OPTIONS)[number];

export function getJobTypeLabel(value: string): string {
  return JOB_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** ผลลัพธ์หนึ่งรายการจาก GET /api/jobs/search */
export interface JobSearchResult {
  id: string;
  jobNumber: string;
  jobDate: string;
  jobType: string;
  size: string | null;
  clearStatus: boolean;
  isCancelled: boolean;
  driverId: string | null;
  driver: { name: string; vehicleNumber: string | null; groupName: string | null } | null;
  customer: { name: string } | null;
}

export interface JobSearchResponse {
  total: number;
  limit: number;
  jobs: JobSearchResult[];
}

/** สรุปงานคนขับ 1 คน 1 เดือน — ช่องที่ระบบไม่มีข้อมูลจะเป็น null (เว้นว่างใน Excel ให้กรอกเอง) */
export interface DriverMonthlySummary {
  month: string;              // 'YYYY-MM'
  driverId: string;
  driverName: string;
  vehicleNumber: string | null;
  groupName: string | null;
  startDate: string | null;

  leaveDays: number;          // ลาหยุด
  repairDays: number;         // ซ่อมรถ
  jobTrips: number;           // งาน (เที่ยว)
  towingTrips: number;        // ทอย (เที่ยว)

  income: number;             // รายได้
  fuelPricePerLiter: number | null;
  fuelLiters: number;         // จำนวนน้ำมัน
  driverWage: number;         // ค่าเที่ยว
  baseSalary: number | null;  // เงินเดือน
}

/**
 * Sentinel token แทน "กลุ่มอื่นๆ" (คนขับที่ไม่มี groupName) ใน query param `groups`
 * ของ /api/summary/export — ใช้แทนสตริงว่างเพราะ "" ถูก .filter(Boolean) ทิ้งไปเสมอ
 * ไฟล์นี้ไม่มี import ใดๆ จึง import ได้ทั้งจาก client component และ server route
 */
export const UNGROUPED = "__ungrouped__";
