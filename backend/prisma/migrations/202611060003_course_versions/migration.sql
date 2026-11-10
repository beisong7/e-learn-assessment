BEGIN;
ALTER TABLE "courses" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "courses" ADD CONSTRAINT "courses_version_positive" CHECK ("version" > 0);
COMMIT;
