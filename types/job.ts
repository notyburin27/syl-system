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
