import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import {
  createTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type RowData,
  type SortingState,
  type Table,
  type TableState,
  type Updater,
} from "@tanstack/table-core";

function resolveUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(current) : updater;
}

/** Minimal flexRender for table-core (no React adapter). */
export function flexRender<TProps extends object>(
  Comp: unknown,
  props: TProps
): ComponentChildren {
  if (Comp == null) return null;
  if (typeof Comp === "function") {
    return (Comp as (p: TProps) => ComponentChildren)(props);
  }
  return Comp as ComponentChildren;
}

/**
 * Merge controlled slices onto TanStack feature defaults.
 * table-core's getState() returns options.state as-is (no auto-merge), so a
 * partial controlled state without columnPinning crashes getHeaderGroups()
 * on columnPinning.left. Mirrors @tanstack/react-table's setOptions pattern.
 */
export function mergeTableState(
  initialState: TableState,
  controlled: Partial<TableState>
): TableState {
  return {
    ...initialState,
    ...controlled,
    columnPinning: {
      left: controlled.columnPinning?.left ?? initialState.columnPinning?.left ?? [],
      right: controlled.columnPinning?.right ?? initialState.columnPinning?.right ?? [],
    },
  };
}

export function useLivestockTable<TData extends RowData>(opts: {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  getRowId?: (row: TData, index: number) => string;
  initialPageSize?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "id", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: opts.initialPageSize ?? 25,
  });

  const controlledState: Partial<TableState> = {
    sorting,
    globalFilter,
    pagination,
  };

  const table = useMemo(() => {
    const instance: Table<TData> = createTable({
      data: opts.data,
      columns: opts.columns,
      // Placeholder; setOptions below always merges with initialState defaults.
      state: {},
      onStateChange: () => {
        /* controlled via individual setters */
      },
      onSortingChange: (updater) => setSorting((old) => resolveUpdater(updater, old)),
      onGlobalFilterChange: (updater) => setGlobalFilter((old) => resolveUpdater(updater, old)),
      onPaginationChange: (updater) => setPagination((old) => resolveUpdater(updater, old)),
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      getRowId: opts.getRowId,
      renderFallbackValue: null,
    });
    instance.setOptions((prev) => ({
      ...prev,
      state: mergeTableState(instance.initialState, controlledState),
    }));
    return instance;
    // controlledState fields listed individually for stable deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.data, opts.columns, sorting, globalFilter, pagination, opts.getRowId]);

  table.setOptions((prev) => ({
    ...prev,
    data: opts.data,
    columns: opts.columns,
    state: mergeTableState(table.initialState, controlledState),
  }));

  return {
    table,
    sorting,
    setSorting,
    globalFilter,
    setGlobalFilter,
    pagination,
    setPagination,
  };
}
