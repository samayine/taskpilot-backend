-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ASSISTANT';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "department" TEXT;
