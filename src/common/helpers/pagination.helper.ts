import { PaginationDto } from "../dto/pagination.dto";

/**
 * Builds a standardised paginated response.
 *
 * Usage inside any service:
 *   const [data, total] = await Promise.all([
 *     prisma.model.findMany({ ...query, ...paginateArgs(dto) }),
 *     prisma.model.count({ where: query.where }),
 *   ]);
 *   return paginate(data, total, dto);
 */
export function paginateArgs(dto: PaginationDto) {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 20;
  return { skip: (page - 1) * limit, take: limit };
}

export function paginate<T>(data: T[], total: number, dto: PaginationDto) {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 20;
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
