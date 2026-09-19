import type { DriverMonthlySummary } from "@/types/job";
import { isTowingJobType } from "@/types/job";

/** ลักษณะงานที่นับเป็น "งาน" ในสรุป — ทอยตู้แยกนับต่างหาก */
const MAIN_JOB_TYPES = ["inbound", "outbound", "flatbed", "mill"];

export interface SummaryJobInput {
  jobType: string;
  noJobReason: string | null;
  isCancelled: boolean;
  /** แบก — นับเพิ่มควบคู่กับหมวดเดิม ไม่ได้แทนที่ */
  isCarry: boolean;
  /**
   * true = ใบที่ถูกจับคู่แล้วยอดถูกล้าง — ไม่นับเป็นเที่ยว แต่ค่าใช้จ่าย/น้ำมันยังรวม
   * optional เพื่อให้ call site เดิมไม่ต้องแก้
   */
  isPairSecondary?: boolean;
  income: number | null;
  driverWage: number | null;
  fuelOfficeLiters: number | null;
  fuelCashLiters: number | null;
  fuelCreditLiters: number | null;
  /** ค่าใช้จ่ายที่รวมเป็น "ค่าใช้จ่ายต่างๆ" ในหน้าสรุป */
  toll: number | null;
  liftFee: number | null;
  storageFee: number | null;
  tire: number | null;
  other: number | null;
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
    isGasVehicle: boolean;
  };
  jobs: SummaryJobInput[];
  /** จำนวนวันลาแยกตามประเภท */
  sickLeaveCount: number;
  personalLeaveCount: number;
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
  const {
    month,
    driver,
    jobs,
    sickLeaveCount,
    personalLeaveCount,
    fuelPricePerLiter,
    entry,
  } = input;

  // งานที่ยกเลิกไม่นับในทุกช่อง
  const active = jobs.filter((j) => !j.isCancelled);

  // ใบที่ถูกจับคู่แล้วยอดถูกล้าง ไม่นับเป็นเที่ยว — วิ่งครั้งเดียวคือหนึ่งเที่ยว
  const counted = active.filter((j) => !j.isPairSecondary);

  const num = (v: number | null) => Number(v ?? 0);

  // แบก/ค่าใช้จ่ายต่างๆ คำนวณจากงานจริง แล้วให้ผู้ใช้แก้ทับได้ในหน้าสรุป
  const carryTripsPrefill = active.filter((j) => j.isCarry).length;
  const otherExpensesPrefill = active.reduce(
    (sum, j) =>
      sum + num(j.toll) + num(j.liftFee) + num(j.storageFee) + num(j.tire) + num(j.other),
    0
  );

  // รถก๊าซไม่คิดน้ำมัน — บล็อกน้ำมันและยอดคงเหลือของบริษัทเว้นว่างทั้ง UI และ Excel
  const isGasVehicle = driver.isGasVehicle;

  return {
    month,
    driverId: driver.id,
    driverName: driver.name,
    vehicleNumber: driver.vehicleNumber,
    groupName: driver.groupName,
    startDate: driver.startDate,

    sickLeaveDays: sickLeaveCount,
    personalLeaveDays: personalLeaveCount,
    // ซ่อมรถ/ค้างคืน/มีงานไม่ไปงาน เก็บในรูปงานประเภท "ไม่มีงาน" ที่มีเหตุผลกำกับ
    repairDays: active.filter((j) => j.jobType === "noJob" && j.noJobReason === "repair").length,
    overnightDays: active.filter((j) => j.jobType === "noJob" && j.noJobReason === "overnight").length,
    noShowDays: active.filter((j) => j.jobType === "noJob" && j.noJobReason === "noShow").length,
    jobTrips: counted.filter((j) => MAIN_JOB_TYPES.includes(j.jobType)).length,
    towingTrips: counted.filter((j) => isTowingJobType(j.jobType)).length,

    // ค่ากรอกมือ — คงความต่างระหว่าง null (ยังไม่กรอก) กับ 0 (กรอกว่าเป็นศูนย์)
    carryTrips: entry?.carryTrips ?? null,
    carryTripsPrefill,
    otherExpensesPrefill,
    fuelDeduction: entry?.fuelDeduction ?? null,
    otherExpenses: entry?.otherExpenses ?? null,
    driverPayout: entry?.driverPayout ?? null,

    isGasVehicle,
    income: active.reduce((sum, j) => sum + num(j.income), 0),
    // รถก๊าซไม่มีบล็อกน้ำมัน — ส่ง null/0 ให้ทั้ง UI และ Excel เว้นว่างตรงกัน
    fuelPricePerLiter: isGasVehicle ? null : fuelPricePerLiter,
    fuelLiters: isGasVehicle
      ? 0
      : active.reduce(
          (sum, j) => sum + num(j.fuelOfficeLiters) + num(j.fuelCashLiters) + num(j.fuelCreditLiters),
          0
        ),
    driverWage: active.reduce((sum, j) => sum + num(j.driverWage), 0),
    baseSalary: driver.baseSalary,
  };
}
