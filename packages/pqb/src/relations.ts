import { Query, QueryWithTable } from './query';

export type BaseRelation = {
  type: string;
  key: string;
  model: QueryWithTable;
  joinQuery: Query;
  options: {
    scope?(q: QueryWithTable): QueryWithTable;
    required?: boolean;
  };
};

export interface BelongsToRelation extends BaseRelation {
  type: 'belongsTo';
  options: BaseRelation['options'] & {
    primaryKey: string;
    foreignKey: string;
  };
}

export interface HasOneRelation extends BaseRelation {
  type: 'hasOne';
  options: BaseRelation['options'] &
    (
      | {
          primaryKey: string;
          foreignKey: string;
        }
      | {
          through: string;
          source: string;
        }
    );
}

export interface HasManyRelation extends BaseRelation {
  type: 'hasMany';
  options: BaseRelation['options'] &
    (
      | {
          primaryKey: string;
          foreignKey: string;
        }
      | {
          through: string;
          source: string;
        }
    );
}

export interface HasAndBelongsToManyRelation extends BaseRelation {
  type: 'hasAndBelongsToMany';
  options: BaseRelation['options'] & {
    primaryKey: string;
    foreignKey: string;
    associationPrimaryKey: string;
    associationForeignKey: string;
    joinTable: string;
  };
}

export type Relation =
  | BelongsToRelation
  | HasOneRelation
  | HasManyRelation
  | HasAndBelongsToManyRelation;

export type RelationsBase = Record<never, Relation>;

export type RelationQuery<
  Params = never,
  T extends Query = Query,
  Required extends boolean = boolean,
> = ((params: Params) => T) & T & { requiredRelation: Required };