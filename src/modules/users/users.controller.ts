import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * CEO-only: create a new employee or team lead account.
   * The companyId is automatically taken from the authenticated CEO's JWT.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CEO)
  @Post()
  createUser(@Body() createUserDto: CreateUserDto, @Request() req) {
    return this.usersService.createUser(createUserDto, req.user.companyId);
  }
}
