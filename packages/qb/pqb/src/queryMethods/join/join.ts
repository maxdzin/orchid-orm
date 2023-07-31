import {
  Query,
  GetQueryResult,
  Selectable,
  SelectableBase,
  WithDataBase,
  WithDataItem,
  QueryReturnType,
} from '../../query';
import { pushQueryValue, setQueryObjectValue } from '../../queryDataUtils';
import { WhereQueryBase } from '../where/where';
import { RelationsBase } from '../../relations';
import { QueryData } from '../../sql';
import {
  Expression,
  StringKey,
  QueryInternal,
  EmptyTuple,
  NullableColumn,
  QueryMetaBase,
  ColumnsShapeBase,
  QueryThen,
  QueryCatch,
  emptyObject,
} from 'orchid-core';
import { _join, _joinLateral } from './_join';
import { AliasOrTable } from '../../utils';
import { ColumnsObject } from '../../columns';
import { QueryBase } from '../../queryBase';

// Type of column names of a `with` table, to use to join a `with` table by these columns.
// Union of `with` column names that may be prefixed with a `with` table name.
type WithSelectable<
  T extends QueryBase,
  W extends keyof T['withData'],
> = T['withData'][W] extends WithDataItem
  ?
      | StringKey<keyof T['withData'][W]['shape']>
      | `${T['withData'][W]['table']}.${StringKey<
          keyof T['withData'][W]['shape']
        >}`
  : never;

/**
 * The first argument of all `join` and `joinLateral` methods.
 * See argument of {@link Join.join}.
 */
export type JoinFirstArg<T extends QueryBase> =
  | Query
  | keyof T['relations']
  | keyof T['withData']
  | ((q: T['relations']) => Query);

/**
 * Arguments of `join` methods (not `joinLateral`).
 * See {@link Join.join}
 */
export type JoinArgs<
  T extends QueryBase,
  Arg extends JoinFirstArg<T>,
> = Arg extends Query
  ? JoinQueryArgs<T, Arg>
  : Arg extends keyof T['relations']
  ? EmptyTuple
  : Arg extends keyof T['withData']
  ? JoinWithArgs<T, Arg>
  : never;

/**
 * Column names of the joined table that can be used to join.
 * Derived from 'result', not from 'shape',
 * because if the joined table has a specific selection, it will be wrapped like:
 * ```sql
 * JOIN (SELECT something FROM joined) joined ON joined.something = ...
 * ```
 * And the selection becomes available to use in the `ON` and to select from the joined table.
 */
type JoinSelectable<Q extends Query> =
  | keyof Q['result']
  | `${AliasOrTable<Q>}.${StringKey<keyof Q['result']>}`;

// Available arguments when joining a query object. Can be:
// - an object where keys are columns of the joined table and values are columns of the main table or a raw SQL.
// - raw SQL expression
// - `true` to join without conditions
// - pair of columns, first is of the joined table, second is of main table
// - string tuple of a column of a joined table, operator string such as '=' or '!=', and a column of the main table
type JoinQueryArgs<T extends QueryBase, Q extends Query> =
  | [
      conditions:
        | Record<JoinSelectable<Q>, Selectable<T> | Expression>
        | Expression
        | true,
    ]
  | [
      leftColumn: JoinSelectable<Q> | Expression,
      rightColumn: Selectable<T> | Expression,
    ]
  | [
      leftColumn: JoinSelectable<Q> | Expression,
      op: string,
      rightColumn: Selectable<T> | Expression,
    ];

// Available arguments when joining a `with` table. Can be:
// - an object where keys are columns of the `with` table and values are columns of the main table or a raw SQL
// - raw SQL expression
// - pair of columns, first is of the `with` table, second is of main table
// - string tuple of a column of a `with` table, operator string such as '=' or '!=', and a column of the main table
type JoinWithArgs<T extends QueryBase, W extends keyof T['withData']> =
  | [
      conditions:
        | Record<WithSelectable<T, W>, Selectable<T> | Expression>
        | Expression,
    ]
  | [
      leftColumn: WithSelectable<T, W> | Expression,
      rightColumn: Selectable<T> | Expression,
    ]
  | [
      leftColumn: WithSelectable<T, W> | Expression,
      op: string,
      rightColumn: Selectable<T> | Expression,
    ];

/**
 * Result of all `join` methods, not `joinLateral`.
 * Adds joined table columns from its 'result' to the 'selectable' of the query.
 *
 * @param T - query type to join to
 * @param Arg - first arg of join, see {@link JoinFirstArg}
 * @param RequireJoined - when false, joined table shape will be mapped to make all columns optional
 * @param RequireMain - when false, main table shape will be mapped to make all columns optional (for right and full join)
 */
export type JoinResult<
  T extends Query,
  Arg extends JoinFirstArg<T>,
  RequireJoined extends boolean,
  RequireMain extends boolean,
  Cb extends (q: never) => { meta: QueryMetaBase } = () => {
    meta: QueryMetaBase;
  },
  J extends Pick<Query, 'result' | 'table' | 'meta'> = Arg extends Query
    ? Arg
    : Arg extends keyof T['relations']
    ? T['relations'][Arg]['relationConfig']['table']
    : Arg extends (q: never) => Query
    ? ReturnType<Arg>
    : Arg extends keyof T['withData']
    ? T['withData'][Arg] extends WithDataItem
      ? {
          table: T['withData'][Arg]['table'];
          result: T['withData'][Arg]['shape'];
          meta: QueryBase['meta'];
        }
      : never
    : never,
  Selectable extends SelectableBase = JoinResultSelectable<
    J,
    RequireJoined,
    ReturnType<Cb>
  >,
> = RequireMain extends true
  ? JoinAddSelectable<T, Selectable>
  : JoinOptionalMain<T, Selectable>;

/**
 * Result of all `joinLateral` methods.
 * Adds joined table columns from its 'result' to the 'selectable' of the query.
 *
 * @param T - query type to join to
 * @param Arg - first arg of join, see {@link JoinFirstArg}
 * @param RequireJoined - when false, joined table shape will be mapped to make all columns optional
 */
export type JoinLateralResult<
  T extends Query,
  R extends QueryBase,
  RequireJoined extends boolean,
  Selectable extends SelectableBase = JoinResultSelectable<
    R,
    RequireJoined,
    { meta: QueryMetaBase }
  >,
> = JoinAddSelectable<T, Selectable>;

/**
 * Build `selectable` type for joined table.
 *
 * When `RequireJoined` parameter is false,
 * the result type of the joined table will be mapped to make all columns optional.
 *
 * Callback may override the joined table alias.
 *
 * The resulting selectable receives all joined table columns prefixed with the table name or alias,
 * and a star prefixed with the table name or alias to select all joined columns.
 */
type JoinResultSelectable<
  J extends Pick<Query, 'result' | 'table' | 'meta'>,
  RequireJoined extends boolean,
  CbResult extends { meta: QueryMetaBase },
  Result extends ColumnsShapeBase = RequireJoined extends true
    ? J['result']
    : { [K in keyof J['result']]: NullableColumn<J['result'][K]> },
  As extends string = CbResult extends { meta: QueryMetaBase & { as: string } }
    ? CbResult['meta']['as']
    : AliasOrTable<J>,
> = {
  [K in keyof Result as `${As}.${StringKey<K>}`]: {
    as: K;
    column: Result[K];
  };
} & {
  [K in As as `${As}.*`]: {
    as: K;
    column: RequireJoined extends true
      ? ColumnsObject<J['result']>
      : NullableColumn<ColumnsObject<J['result']>>;
  };
};

// Replace the 'selectable' of the query with the given selectable.
type JoinAddSelectable<T extends Query, Selectable extends SelectableBase> = {
  [K in keyof T]: K extends 'selectable' ? T['selectable'] & Selectable : T[K];
};

// Map `selectable` of the query to make all columns optional, and add the given `Selectable` to it.
// Derive and apply a new query result type, where all columns become optional.
type JoinOptionalMain<
  T extends Query,
  Selectable extends SelectableBase,
  Result extends ColumnsShapeBase = {
    [K in keyof T['result']]: NullableColumn<T['result'][K]>;
  },
  Data = GetQueryResult<T['returnType'], Result>,
> = {
  [K in keyof T]: K extends 'selectable'
    ? {
        [K in keyof T['selectable']]: {
          as: T['selectable'][K]['as'];
          column: NullableColumn<T['selectable'][K]['column']>;
        };
      } & Selectable
    : K extends 'result'
    ? Result
    : K extends 'then'
    ? QueryThen<Data>
    : K extends 'catch'
    ? QueryCatch<Data>
    : T[K];
};

/**
 * Map the `with` table first argument of `join` or `joinLateral` to a query type.
 * Constructs `selectable` based on `with` table shape, and adds generic types to conform the `QueryBase` type.
 */
type JoinWithArgToQuery<
  With extends WithDataItem,
  Selectable extends SelectableBase = {
    [K in keyof With['shape']]: {
      as: StringKey<K>;
      column: With['shape'][K];
    };
  },
> = {
  q: QueryData;
  table: With['table'];
  clone<T extends QueryBase>(this: T): T;
  selectable: Selectable & {
    [K in keyof Selectable as `${With['table']}.${StringKey<K>}`]: Selectable[K];
  };
  shape: With['shape'];
  result: With['shape'];
  baseQuery: Query;
  relations: RelationsBase;
  withData: WithDataBase;
  meta: QueryBase['meta'];
  internal: QueryInternal;
  returnType: QueryReturnType;
};

/**
 * Map the first argument of `join` or `joinLateral` to a query type.
 *
 * `with` table arg is mapped into `QueryBase`,
 * query arg is returned as is,
 * relation name is replaced with a relation table.
 */
type JoinArgToQuery<
  T extends QueryBase,
  Arg extends JoinFirstArg<T>,
> = Arg extends keyof T['withData']
  ? T['withData'][Arg] extends WithDataItem
    ? JoinWithArgToQuery<T['withData'][Arg]>
    : never
  : Arg extends Query
  ? Arg
  : Arg extends keyof T['relations']
  ? T['relations'][Arg]['relationConfig']['table']
  : never;

/**
 * Type of the `join` callback (not `joinLateral`).
 *
 * Receives a query builder that can access columns of both the main and the joined table.
 *
 * The query builder is limited to `or` and `where` methods only.
 *
 * Callback must return a query builder.
 */
export type JoinCallback<T extends QueryBase, Arg extends JoinFirstArg<T>> = (
  q: OnQueryBuilder<T, JoinArgToQuery<T, Arg>>,
) => OnQueryBuilder;

/**
 * Type of the `joinLateral`.
 *
 * Receives a query builder that can access columns of both the main and the joined table.
 *
 * Query builder inside callback is the query derived from the `joinLateral` first argument,
 * all query methods are allowed, `on` methods are available.
 *
 * The callback must return a query object. Its resulting type will become a type of the joined table.
 */
export type JoinLateralCallback<
  T extends QueryBase,
  Arg extends JoinFirstArg<T>,
  R extends QueryBase,
  Q extends QueryBase = JoinArgToQuery<T, Arg>,
> = (q: Q & OnQueryBuilder<T, Q>) => R;

export class Join {
  /**
   * TODO: write docs
   *
   * @param arg - can be a query object, a name of a relation, a name of `with` table, or a callback to join a relation
   * @param args - arguments depend on the first argument, it can be object with columns, list of columns, `true` literal.
   */
  join<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, true, true>;
  join<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, true, true, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  join(this: Query, ...args: any) {
    return _join(this.clone(), true, 'JOIN', args);
  }
  _join<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, true, true>;
  _join<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, true, true, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _join(this: Query, ...args: any) {
    return _join(this, true, 'JOIN', args);
  }

  leftJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, false, true>;
  leftJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, false, true, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leftJoin(this: Query, ...args: any) {
    return _join(this.clone(), false, 'LEFT JOIN', args);
  }
  _leftJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, false, true>;
  _leftJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, false, true, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _leftJoin(this: Query, ...args: any) {
    return _join(this, false, 'LEFT JOIN', args);
  }

  rightJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, true, false>;
  rightJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, true, false, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rightJoin(this: Query, ...args: any) {
    return _join(this.clone(), true, 'RIGHT JOIN', args);
  }
  _rightJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, true, false>;
  _rightJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, true, false, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _rightJoin(this: Query, ...args: any) {
    return _join(this, true, 'RIGHT JOIN', args);
  }

  fullJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, false, false>;
  fullJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, false, false, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fullJoin(this: Query, ...args: any) {
    return _join(this.clone(), false, 'FULL JOIN', args);
  }
  _fullJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Args extends JoinArgs<T, Arg>,
  >(this: T, arg: Arg, ...args: Args): JoinResult<T, Arg, false, false>;
  _fullJoin<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    Cb extends JoinCallback<T, Arg>,
  >(this: T, arg: Arg, cb: Cb): JoinResult<T, Arg, false, false, Cb>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _fullJoin(this: Query, ...args: any) {
    return _join(this, false, 'FULL JOIN', args);
  }

  joinLateral<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    R extends QueryBase,
  >(
    this: T,
    arg: Arg,
    cb: JoinLateralCallback<T, Arg, R>,
  ): JoinLateralResult<T, R, true> {
    return _joinLateral<T, Arg, R, true>(this.clone(), 'JOIN', arg, cb);
  }
  _joinLateral<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    R extends QueryBase,
  >(
    this: T,
    arg: Arg,
    cb: JoinLateralCallback<T, Arg, R>,
  ): JoinLateralResult<T, R, true> {
    return _joinLateral<T, Arg, R, true>(this, 'JOIN', arg, cb);
  }

  leftJoinLateral<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    R extends QueryBase,
  >(
    this: T,
    arg: Arg,
    cb: JoinLateralCallback<T, Arg, R>,
  ): JoinLateralResult<T, R, false> {
    return _joinLateral<T, Arg, R, false>(this.clone(), 'LEFT JOIN', arg, cb);
  }
  _leftJoinLateral<
    T extends Query,
    Arg extends JoinFirstArg<T>,
    R extends QueryBase,
  >(
    this: T,
    arg: Arg,
    cb: JoinLateralCallback<T, Arg, R>,
  ): JoinLateralResult<T, R, false> {
    return _joinLateral<T, Arg, R, false>(this, 'LEFT JOIN', arg, cb);
  }
}

type OnArgs<Q extends { selectable: SelectableBase }> =
  | [leftColumn: keyof Q['selectable'], rightColumn: keyof Q['selectable']]
  | [
      leftColumn: keyof Q['selectable'],
      op: string,
      rightColumn: keyof Q['selectable'],
    ];

const makeOnItem = (
  joinTo: QueryBase,
  joinFrom: QueryBase,
  args: OnArgs<QueryBase>,
) => {
  return {
    ON: {
      joinTo,
      joinFrom,
      on: args,
    },
  };
};

export const pushQueryOn = <T extends QueryBase>(
  q: T,
  joinFrom: QueryBase,
  joinTo: QueryBase,
  ...on: OnArgs<QueryBase>
): T => {
  return pushQueryValue(q, 'and', makeOnItem(joinFrom, joinTo, on));
};

export const pushQueryOrOn: typeof pushQueryOn = (
  q,
  joinFrom,
  joinTo,
  ...on
) => {
  return pushQueryValue(q, 'or', [makeOnItem(joinFrom, joinTo, on)]);
};

export const addQueryOn = <T extends QueryBase>(
  q: T,
  joinFrom: QueryBase,
  joinTo: QueryBase,
  ...args: OnArgs<QueryBase>
): T => {
  const cloned = q.clone() as typeof q;
  setQueryObjectValue(
    cloned,
    'joinedShapes',
    (joinFrom.q.as || joinFrom.table) as string,
    joinFrom.q.shape,
  );
  return pushQueryOn(cloned, joinFrom, joinTo, ...args);
};

export const addQueryOrOn: typeof pushQueryOrOn = (
  q,
  joinFrom,
  joinTo,
  ...args
) => {
  return pushQueryOrOn(q.clone() as typeof q, joinFrom, joinTo, ...args);
};

type OnJsonPathEqualsArgs<T extends QueryBase> = [
  leftColumn: keyof T['selectable'],
  leftPath: string,
  rightColumn: keyof T['selectable'],
  rightPath: string,
];

export class OnQueryBuilder<
  S extends QueryBase = QueryBase,
  J extends QueryBase = QueryBase,
> extends WhereQueryBase {
  declare selectable: J['selectable'] & Omit<S['selectable'], keyof S['shape']>;
  declare relations: J['relations'];
  declare result: J['result'];
  shape: J['shape'];
  baseQuery: Query;
  withData = emptyObject;
  internal: QueryInternal;

  constructor(
    q: QueryBase,
    { shape, joinedShapes }: Pick<QueryData, 'shape' | 'joinedShapes'>,
    joinTo: QueryBase,
  ) {
    super();
    this.internal = q.internal;
    this.table = typeof q === 'object' ? q.table : q;
    this.shape = shape;
    this.q = {
      shape: shape as ColumnsShapeBase,
      joinedShapes,
    } as QueryData;
    this.baseQuery = this as unknown as Query;
    if (typeof q === 'object' && q.q.as) {
      this.q.as = q.q.as;
    }
    this.q.joinTo = joinTo;
  }

  on<T extends OnQueryBuilder>(this: T, ...args: OnArgs<T>): T {
    return this.clone()._on(...args);
  }
  _on<T extends OnQueryBuilder>(this: T, ...args: OnArgs<T>): T {
    return pushQueryOn(this, this.q.joinTo as QueryBase, this, ...args);
  }

  orOn<T extends OnQueryBuilder>(this: T, ...args: OnArgs<T>): T {
    return this.clone()._orOn(...args);
  }
  _orOn<T extends OnQueryBuilder>(this: T, ...args: OnArgs<T>): T {
    return pushQueryOrOn(this, this.q.joinTo as QueryBase, this, ...args);
  }

  onJsonPathEquals<T extends OnQueryBuilder>(
    this: T,
    ...args: OnJsonPathEqualsArgs<T>
  ): T {
    return this.clone()._onJsonPathEquals(...args);
  }
  _onJsonPathEquals<T extends OnQueryBuilder>(
    this: T,
    ...args: OnJsonPathEqualsArgs<T>
  ): T {
    return pushQueryValue(this, 'and', { ON: args });
  }
}