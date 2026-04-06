import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createUser(@Body() createUserDto: CreateUserDto, @Request() req) {
    return this.usersService.createUser(createUserDto, req.user.companyId);
  }
}
