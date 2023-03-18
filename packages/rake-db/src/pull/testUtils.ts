import { DbStructure } from './dbStructure';

export const table: DbStructure.Table = {
  schemaName: 'public',
  name: 'table',
};

export const column: Omit<DbStructure.Column, 'type'> = {
  schemaName: 'public',
  tableName: 'table',
  name: 'column',
  typeSchema: 'pg_catalog',
  dataType: 'dataType',
  isNullable: false,
};

export const intColumn: DbStructure.Column = {
  schemaName: 'public',
  tableName: 'table',
  name: 'column',
  typeSchema: 'pg_catalog',
  type: 'int4',
  dataType: 'integer',
  default: '123',
  isNullable: false,
};

export const idColumn: DbStructure.Column = {
  ...intColumn,
  name: 'id',
  default: `nextval('table1_id_seq'::regclass)`,
};

export const textColumn: DbStructure.Column = {
  ...column,
  name: 'text',
  type: 'text',
  dataType: 'text',
};

export const varCharColumn: DbStructure.Column = {
  ...intColumn,
  name: 'varchar',
  type: 'character varying',
  collation: 'en_US',
  maxChars: 10,
};

export const decimalColumn: DbStructure.Column = {
  ...intColumn,
  name: 'decimal',
  type: 'decimal',
  numericPrecision: 10,
  numericScale: 2,
};

export const timestampColumn: DbStructure.Column = {
  ...intColumn,
  name: 'timestamp',
  type: 'timestamp',
  dateTimePrecision: 10,
};

export const createdAtColumn: DbStructure.Column = {
  ...timestampColumn,
  name: 'createdAt',
  dateTimePrecision: 6,
  default: 'now()',
};

export const updatedAtColumn: DbStructure.Column = {
  ...createdAtColumn,
  name: 'updatedAt',
};

export const index: DbStructure.Index = {
  schemaName: 'public',
  tableName: 'table',
  name: 'index',
  using: 'btree',
  isUnique: false,
  columns: [{ column: 'name' }],
};

export const foreignKey: DbStructure.ForeignKey = {
  schemaName: 'public',
  tableName: 'table',
  foreignTableSchemaName: 'public',
  foreignTableName: 'otherTable',
  name: 'fkey',
  columnNames: ['otherId'],
  foreignColumnNames: ['id'],
  match: 'f',
  onUpdate: 'c',
  onDelete: 'c',
};

export const extension: DbStructure.Extension = {
  schemaName: 'public',
  name: 'name',
  version: '123',
};

export const enumType: DbStructure.Enum = {
  schemaName: 'public',
  name: 'mood',
  values: ['sad', 'ok', 'happy'],
};

export const primaryKey: DbStructure.PrimaryKey = {
  schemaName: 'public',
  tableName: 'table',
  name: 'pkey',
  columnNames: ['id'],
};

export const check: DbStructure.Check = {
  schemaName: 'public',
  tableName: 'table',
  name: 'table_column_check',
  columnNames: ['column'],
  expression: 'column > 10',
};