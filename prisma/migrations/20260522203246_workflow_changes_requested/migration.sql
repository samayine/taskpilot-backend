-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "changesRequested" BOOLEAN NOT NULL DEFAULT false;

-- Data backfill for the simplified workflow:
--   SUBMITTED  -> REVIEW  (single "In Review" state)
--   REJECTED   -> IN_PROGRESS + changesRequested (no permanent Rejected column)
UPDATE "Task" SET "status" = 'REVIEW' WHERE "status" = 'SUBMITTED';
UPDATE "Task" SET "status" = 'IN_PROGRESS', "changesRequested" = true WHERE "status" = 'REJECTED';
