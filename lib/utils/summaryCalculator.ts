import type { DriverMonthlySummary } from "@/types/job";

/** ลักษณะงานที่นับเป็น "งาน" ในสรุป — ทอยตู้แยกนับต่างหาก */
const MAIN_JOB_TYPES = ["inbound", "outbound", "flatbed", "mill"];

export interface SummaryJobInput {
  jobType: string;
  noJobReason: string | null;
  isCancelled: boolean;
  income: number | null;
  driverWage: number | null;
  fuelOfficeLiters: number | null;
  fuelCashLiters: number | null;
  fuelCreditLiters: number | null;
}

export interface SummaryInput {
  month: string;
  driver: {
    id: string;
    name: string;
    vehicleNumber: string | null;
    groupName: string | null;
    startDate: string | null;
    baseSalary: number | null;
  };
  jobs: SummaryJobInput[];
  leaveCount: number;
  fuelPricePerLiter: number | null;
  /** ค่าที่กรอกมือของเดือนนั้น — null/undefined = ยังไม่เคยกรอก */
  entry?: SummaryEntryInput | null;
}

/** ค่าที่กรอกมือในหน้าสรุปงาน (มาจากตาราง DriverMonthlyEntry) */
export interface SummaryEntryInput {
  carryTrips: number | null;
  fuelDeduction: number | null;
  otherExpenses: number | null;
  driverPayout: number | null;
}

export function calculateDriverSummary(input: SummaryInput): DriverMonthlySummary {
  const { month, driver, jobs, leaveCount, fuelPricePerLiter, entry } = input;

  // งานที่ยกเลิกไม่นับในทุกช่อง
  const active = jobs.filter((j) => !j.isCancelled);

  const num = (v: number | null) => Number(v ?? 0);

  return {
    month,
    driverId: driver.id,
    driverName: driver.name,
    vehicleNumber: driver.vehicleNumber,
    groupName: driver.groupName,
    startDate: driver.startDate,

    leaveDays: leaveCount,
    // ซ่อมรถ/ค้างคืน เก็บในรูปงานประเภท "ไม่มีงาน" ที่มีเหตุผลกำกับ
    repairDays: active.filter((j) => j.jobType === "noJob" && j.noJobReason === "repair").length,
    overnightDays: active.filter((j) => j.jobType === "noJob" && j.noJobReason === "overnight").length,
    jobTrips: active.filter((j) => MAIN_JOB_TYPES.includes(j.jobType)).length,
    towingTrips: active.filter((j) => j.jobType === "towing").length,

    // ค่ากรอกมือ — คงความต่างระหว่าง null (ยังไม่กรอก) กับ 0 (กรอกว่าเป็นศูนย์)
    carryTrips: entry?.carryTrips ?? null,
    fuelDeduction: entry?.fuelDeduction ?? null,
    otherExpenses: entry?.otherExpenses ?? null,
    driverPayout: entry?.driverPayout ?? null,

    income: active.reduce((sum, j) => sum + num(j.income), 0),
    fuelPricePerLiter,
    fuelLiters: active.reduce(
      (sum, j) => sum + num(j.fuelOfficeLiters) + num(j.fuelCashLiters) + num(j.fuelCreditLiters),
      0
    ),
    driverWage: active.reduce((sum, j) => sum + num(j.driverWage), 0),
    baseSalary: driver.baseSalary,
  };
}
