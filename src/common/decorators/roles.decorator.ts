import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator that marks a route as accessible only by the specified roles.
 * Must be used together with RolesGuard.
 *
 * @example
 * @Roles(Role.CEO)
 * @Roles(Role.CEO, Role.TEAM_LEAD)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
