import { BadRequestException, Injectable } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export enum FilterCombination {
  And = 'AND',
  Or = 'OR',
}

export enum FilterFieldType {
  Address = 'address',
  Boolean = 'boolean',
  Date = 'date',
  Number = 'number',
}

export type SortDirection = 'ASC' | 'DESC';

export interface DateRangeFilter {
  from?: Date | string;
  to?: Date | string;
}

export interface NumericRangeFilter {
  min?: number | string;
  max?: number | string;
}

export interface FilterFieldConfig {
  column: string;
  type: FilterFieldType;
  sortable?: boolean;
}

export interface StatusFilterCondition {
  field: string;
  value: boolean | number | string | null;
  operator?: '=' | '!=' | 'IS' | 'IS NOT';
}

export interface EntityFilterConfig {
  fields: Record<string, FilterFieldConfig>;
  statuses?: Record<string, StatusFilterCondition[]>;
}

export interface FilteringRequest {
  dateRanges?: Record<string, DateRangeFilter>;
  statuses?: string | string[];
  numericRanges?: Record<string, NumericRangeFilter>;
  addresses?: Record<string, string | string[]>;
  booleans?: Record<string, boolean | string>;
  combination?: FilterCombination;
  sort?: {
    field: string;
    direction?: string;
  };
}

export interface FilterClause {
  sql: string;
  parameters: Record<
    string,
    boolean | Date | number | string | string[] | null
  >;
}

export interface FilterPlan {
  clauses: FilterClause[];
  combination: FilterCombination;
  sort?: {
    column: string;
    direction: SortDirection;
  };
}

const PARAM_PREFIX = 'filter';

@Injectable()
export class FilteringService {
  buildFilterPlan(
    config: EntityFilterConfig,
    request: FilteringRequest,
  ): FilterPlan {
    const clauses: FilterClause[] = [];
    const combination = request.combination ?? FilterCombination.And;
    let parameterIndex = 0;

    this.assertCombination(combination);

    for (const [field, range] of Object.entries(request.dateRanges ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Date);
      const from = this.parseOptionalDate(range.from, `${field}.from`);
      const to = this.parseOptionalDate(range.to, `${field}.to`);

      if (from && to && from > to) {
        throw new BadRequestException(
          `${field}.from must be before ${field}.to`,
        );
      }

      if (from) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} >= :${parameterName}`,
          parameters: { [parameterName]: from },
        });
      }

      if (to) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} <= :${parameterName}`,
          parameters: { [parameterName]: to },
        });
      }
    }

    const statuses = this.normalizeArray(request.statuses);
    if (statuses.length > 0) {
      clauses.push(this.buildStatusClause(config, statuses, parameterIndex));
      parameterIndex += statuses.reduce(
        (count, status) => count + (config.statuses?.[status]?.length ?? 0),
        0,
      );
    }

    for (const [field, range] of Object.entries(request.numericRanges ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Number);
      const min = this.parseOptionalNumber(range.min, `${field}.min`);
      const max = this.parseOptionalNumber(range.max, `${field}.max`);

      if (min !== undefined && max !== undefined && min > max) {
        throw new BadRequestException(
          `${field}.min must be less than ${field}.max`,
        );
      }

      if (min !== undefined) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} >= :${parameterName}`,
          parameters: { [parameterName]: min },
        });
      }

      if (max !== undefined) {
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        clauses.push({
          sql: `${fieldConfig.column} <= :${parameterName}`,
          parameters: { [parameterName]: max },
        });
      }
    }

    for (const [field, value] of Object.entries(request.addresses ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Address);
      const addresses = this.normalizeArray(value).map((address) =>
        address.trim().toLowerCase(),
      );

      if (addresses.length === 0 || addresses.some((address) => !address)) {
        throw new BadRequestException(`${field} must include a valid address`);
      }

      const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
      clauses.push({
        sql: `LOWER(${fieldConfig.column}) IN (:...${parameterName})`,
        parameters: { [parameterName]: addresses },
      });
    }

    for (const [field, value] of Object.entries(request.booleans ?? {})) {
      const fieldConfig = this.getField(config, field, FilterFieldType.Boolean);
      const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
      clauses.push({
        sql: `${fieldConfig.column} = :${parameterName}`,
        parameters: {
          [parameterName]: this.parseBoolean(value, field),
        },
      });
    }

    return {
      clauses,
      combination,
      sort: this.buildSort(config, request.sort),
    };
  }

  applyFilters<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    config: EntityFilterConfig,
    request: FilteringRequest,
  ): SelectQueryBuilder<T> {
    const plan = this.buildFilterPlan(config, request);

    if (plan.clauses.length > 0) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          plan.clauses.forEach((clause, index) => {
            if (index === 0) {
              qb.where(clause.sql, clause.parameters);
              return;
            }

            if (plan.combination === FilterCombination.Or) {
              qb.orWhere(clause.sql, clause.parameters);
              return;
            }

            qb.andWhere(clause.sql, clause.parameters);
          });
        }),
      );
    }

    if (plan.sort) {
      queryBuilder.orderBy(plan.sort.column, plan.sort.direction);
    }

    return queryBuilder;
  }

  private buildStatusClause(
    config: EntityFilterConfig,
    statuses: string[],
    startParameterIndex: number,
  ): FilterClause {
    const statusMap = config.statuses ?? {};
    const parameters: FilterClause['parameters'] = {};
    let parameterIndex = startParameterIndex;

    const groups = statuses.map((status) => {
      const conditions = statusMap[status];

      if (!conditions) {
        throw new BadRequestException(`Unsupported status filter: ${status}`);
      }

      const conditionSql = conditions.map((condition) => {
        const operator = condition.operator ?? '=';
        const parameterName = `${PARAM_PREFIX}_${parameterIndex++}`;
        parameters[parameterName] = condition.value;
        return `${condition.field} ${operator} :${parameterName}`;
      });

      return `(${conditionSql.join(' AND ')})`;
    });

    return {
      sql: `(${groups.join(' OR ')})`,
      parameters,
    };
  }

  private buildSort(
    config: EntityFilterConfig,
    sort: FilteringRequest['sort'],
  ): FilterPlan['sort'] {
    if (!sort) {
      return undefined;
    }

    const fieldConfig = config.fields[sort.field];
    if (!fieldConfig || fieldConfig.sortable === false) {
      throw new BadRequestException(`Unsupported sort field: ${sort.field}`);
    }

    const direction = (sort.direction ?? 'DESC').toUpperCase();
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new BadRequestException(
        `Unsupported sort direction: ${sort.direction}`,
      );
    }

    return {
      column: fieldConfig.column,
      direction,
    };
  }

  private getField(
    config: EntityFilterConfig,
    field: string,
    expectedType: FilterFieldType,
  ): FilterFieldConfig {
    const fieldConfig = config.fields[field];

    if (!fieldConfig || fieldConfig.type !== expectedType) {
      throw new BadRequestException(
        `Unsupported ${expectedType} filter: ${field}`,
      );
    }

    return fieldConfig;
  }

  private normalizeArray(value: string | string[] | undefined): string[] {
    if (value === undefined) {
      return [];
    }

    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) =>
      item
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }

  private parseOptionalDate(
    value: Date | string | undefined,
    label: string,
  ): Date | undefined {
    if (value === undefined) {
      return undefined;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} must be a valid date`);
    }

    return date;
  }

  private parseOptionalNumber(
    value: number | string | undefined,
    label: string,
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException(`${label} must be a valid number`);
    }

    return numberValue;
  }

  private parseBoolean(value: boolean | string, label: string): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    throw new BadRequestException(`${label} must be true or false`);
  }

  private assertCombination(combination: FilterCombination): void {
    if (!Object.values(FilterCombination).includes(combination)) {
      throw new BadRequestException(
        `Unsupported filter combination: ${combination}`,
      );
    }
  }
}

export const creatorEventFilterConfig: EntityFilterConfig = {
  fields: {
    created_at: {
      column: 'creatorEvent.created_at',
      type: FilterFieldType.Date,
    },
    on_chain_created_at: {
      column: 'creatorEvent.on_chain_created_at',
      type: FilterFieldType.Date,
    },
    participant_count: {
      column: 'creatorEvent.participant_count',
      type: FilterFieldType.Number,
    },
    match_count: {
      column: 'creatorEvent.match_count',
      type: FilterFieldType.Number,
    },
    creator: {
      column: 'creatorEvent.creator_address',
      type: FilterFieldType.Address,
      sortable: false,
    },
    is_active: {
      column: 'creatorEvent.is_active',
      type: FilterFieldType.Boolean,
    },
    is_cancelled: {
      column: 'creatorEvent.is_cancelled',
      type: FilterFieldType.Boolean,
    },
  },
  statuses: {
    active: [
      { field: 'creatorEvent.is_active', value: true },
      { field: 'creatorEvent.is_cancelled', value: false },
    ],
    completed: [
      { field: 'creatorEvent.is_active', value: false },
      { field: 'creatorEvent.is_cancelled', value: false },
    ],
    cancelled: [{ field: 'creatorEvent.is_cancelled', value: true }],
  },
};

export const matchFilterConfig: EntityFilterConfig = {
  fields: {
    created_at: {
      column: 'match.created_at',
      type: FilterFieldType.Date,
    },
    match_time: {
      column: 'match.match_time',
      type: FilterFieldType.Date,
    },
    submitted_at: {
      column: 'match.submitted_at',
      type: FilterFieldType.Date,
    },
    submitted_by: {
      column: 'match.submitted_by',
      type: FilterFieldType.Address,
      sortable: false,
    },
    result_submitted: {
      column: 'match.result_submitted',
      type: FilterFieldType.Boolean,
    },
  },
  statuses: {
    active: [{ field: 'match.result_submitted', value: false }],
    completed: [{ field: 'match.result_submitted', value: true }],
  },
};

export const predictionFilterConfig: EntityFilterConfig = {
  fields: {
    submitted_at: {
      column: 'prediction.submitted_at',
      type: FilterFieldType.Date,
    },
    stake_amount_stroops: {
      column: 'prediction.stake_amount_stroops',
      type: FilterFieldType.Number,
    },
    participant: {
      column: 'user.stellar_address',
      type: FilterFieldType.Address,
      sortable: false,
    },
    payout_claimed: {
      column: 'prediction.payout_claimed',
      type: FilterFieldType.Boolean,
    },
  },
  statuses: {
    active: [{ field: 'prediction.payout_claimed', value: false }],
    completed: [{ field: 'prediction.payout_claimed', value: true }],
  },
};
