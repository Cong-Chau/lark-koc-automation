export type PoolCellValue = string | number | boolean;

export type AppendPlan = {
  values: PoolCellValue[];
  startRow: number;
  endRow: number;
  targetRange: string;
};

export type JobResult =
  | { status: "success"; count: number; startRow: number; endRow: number }
  | { status: "skipped"; reason: "POOL_EMPTY" };

export type LarkColumnRead = {
  sheetId: string;
  range: string;
  startRow: number;
  values: unknown[][];
};

export interface PoolReader {
  readValues(): Promise<PoolCellValue[]>;
}

export interface TargetSheet {
  readColumnL(): Promise<LarkColumnRead>;
  writeColumnL(range: string, values: PoolCellValue[]): Promise<void>;
}
