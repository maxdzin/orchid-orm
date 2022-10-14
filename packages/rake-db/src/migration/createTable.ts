import { columnTypes, getColumnTypes, getTableData, quote } from 'pqb';
import { joinColumns } from '../common';
import {
  TableOptions,
  ColumnsShapeCallback,
  Migration,
  ColumnIndex,
  ColumnComment,
} from './migration';
import {
  addColumnComment,
  addColumnIndex,
  columnToSql,
  constraintToSql,
  migrateIndexes,
} from './migrationUtils';

export const createTable = async (
  migration: Migration,
  tableName: string,
  options: TableOptions,
  fn: ColumnsShapeCallback,
) => {
  const shape = getColumnTypes(columnTypes, fn);

  if (!migration.up) {
    await migration.query(`DROP TABLE "${tableName}" CASCADE`);
    return;
  }

  const lines: string[] = [];

  const state: {
    migration: Migration;
    tableName: string;
    values: unknown[];
    indexes: ColumnIndex[];
    comments: ColumnComment[];
  } = {
    migration,
    tableName,
    values: [],
    indexes: [],
    comments: [],
  };

  for (const key in shape) {
    const item = shape[key];
    addColumnIndex(state.indexes, key, item);
    addColumnComment(state.comments, key, item);
    lines.push(`\n  ${columnToSql(key, item, state)}`);
  }

  const tableData = getTableData();
  if (tableData.primaryKey) {
    lines.push(`\n  PRIMARY KEY (${joinColumns(tableData.primaryKey)})`);
  }

  tableData.foreignKeys.forEach((foreignKey) => {
    lines.push(`\n  ${constraintToSql(state, foreignKey)}`);
  });

  await migration.query({
    text: `CREATE TABLE "${tableName}" (${lines.join(',')}\n)`,
    values: state.values,
  });

  state.indexes.push(...tableData.indexes);

  await migrateIndexes(state);

  for (const { column, comment } of state.comments) {
    await migration.query(
      `COMMENT ON COLUMN "${tableName}"."${column}" IS ${quote(comment)}`,
    );
  }

  if (options.comment) {
    await migration.query(
      `COMMENT ON TABLE "${tableName}" IS ${quote(options.comment)}`,
    );
  }
};