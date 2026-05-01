import { Test, TestingModule } from "@nestjs/testing";
import { UsersService } from "./users.service";
import { PrismaService } from "src/prisma/prisma.service";
import { NotFoundException } from "@nestjs/common";

describe("UsersService", () => {
  let service: UsersService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findByEmailOrThrow", () => {
    it("should return a user if found", async () => {
      const mockUser = { id: "1", email: "test@test.com" };
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue(mockUser as any);

      const result = await service.findByEmailOrThrow("test@test.com");
      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@test.com" },
      });
    });

    it("should throw NotFoundException if user is not found", async () => {
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue(null);

      await expect(service.findByEmailOrThrow("notfound@test.com")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
