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
  isActive: boolean;
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
  estimatedTransfer: number | null;
  income: number | null;
  driverWage: number | null;
  actualTransfer: number | null;
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
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverJobSummary {
  driverId: string;
  driverName: string;
  vehicleNumber: string | null;
  jobCount: number;
  totalIncome: number;
  totalTransfer: number;
}

export const JOB_TYPES = [
  "ขาเข้า",
  "ขาออก",
  "ทอยตู้",
  "พื้นเรียบ",
  "โรงสี",
  "เบิกล่วงหน้า",
] as const;

export const SIZE_OPTIONS = [
  "20DC",
  "40DC",
  "20RF",
  "40RF",
  "2x20DC",
  "truck",
] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type SizeOption = (typeof SIZE_OPTIONS)[number];
