import { AutomationError } from "@/lib/errors";
import type {
  AppendPlan,
  LarkColumnRead,
  PoolCellValue,
} from "@/types/automation";

function isPoolCellValue(value: unknown): value is PoolCellValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function filterPoolValues(rows: unknown[][]): PoolCellValue[] {
  const values: PoolCellValue[] = [];

  for (const row of rows) {
    const cell = row[0];

    if (cell === null || cell === undefined || cell === "") {
      continue;
    }

    if (!isPoolCellValue(cell)) {
      throw new AutomationError({
        code: "PROVIDER_RESPONSE_INVALID",
        provider: "google",
        operation: "read",
      });
    }

    values.push(cell);
  }

  return values;
}

export function findLastOccupiedRow(
  target: LarkColumnRead,
  headerRow = 1,
): number {
  let lastOccupiedRow = headerRow;

  target.values.forEach((row, index) => {
    const physicalRow = target.startRow + index;

    if (physicalRow <= headerRow) {
      return;
    }

    const cell = row[0];

    if (cell !== null && cell !== undefined && cell !== "") {
      lastOccupiedRow = physicalRow;
    }
  });

  return lastOccupiedRow;
}

export function createAppendPlan(
  values: PoolCellValue[],
  target: LarkColumnRead,
  headerRow = 1,
): AppendPlan | null {
  if (values.length === 0) {
    return null;
  }

  const firstInsertRow = Math.max(
    headerRow + 1,
    findLastOccupiedRow(target, headerRow) + 1,
  );
  const endRow = firstInsertRow + values.length - 1;

  return {
    values,
    startRow: firstInsertRow,
    endRow,
    targetRange: `${target.sheetId}!L${firstInsertRow}:L${endRow}`,
  };
}
