BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('LEARNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CourseCategory" AS ENUM ('DESIGN', 'DEVELOPMENT', 'DATA_SCIENCE', 'BUSINESS');

-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ALL_LEVELS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LEARNER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "CourseCategory" NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "instructor_name" VARCHAR(120) NOT NULL,
    "level" "CourseLevel" NOT NULL DEFAULT 'BEGINNER',
    "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "video_url" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "position_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("user_id","lesson_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "courses_category_idx" ON "courses"("category");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_id_course_id_key" ON "lessons"("id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_course_id_position_key" ON "lessons"("course_id", "position");

-- CreateIndex
CREATE INDEX "enrollments_course_id_idx" ON "enrollments"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_course_id_key" ON "enrollments"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "lesson_progress_user_id_course_id_idx" ON "lesson_progress"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "lesson_progress_lesson_id_course_id_idx" ON "lesson_progress"("lesson_id", "course_id");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_course_id_fkey" FOREIGN KEY ("user_id", "course_id") REFERENCES "enrollments"("user_id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_course_id_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Prisma cannot express these PostgreSQL CHECK constraints in its schema.
ALTER TABLE "users"
  ADD CONSTRAINT "users_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "users_email_normalized" CHECK ("email" = lower(btrim("email")) AND position('@' in "email") > 1),
  ADD CONSTRAINT "users_password_hash_not_blank" CHECK (length(btrim("password_hash")) > 0);

ALTER TABLE "courses"
  ADD CONSTRAINT "courses_title_not_blank" CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "courses_description_not_blank" CHECK (length(btrim("description")) > 0),
  ADD CONSTRAINT "courses_instructor_not_blank" CHECK (length(btrim("instructor_name")) > 0),
  ADD CONSTRAINT "courses_thumbnail_http" CHECK ("thumbnail_url" ~ '^https?://');

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_title_not_blank" CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "lessons_video_http" CHECK ("video_url" ~ '^https?://'),
  ADD CONSTRAINT "lessons_duration_positive" CHECK ("duration_seconds" > 0),
  ADD CONSTRAINT "lessons_order_positive" CHECK ("position" > 0);

ALTER TABLE "lesson_progress"
  ADD CONSTRAINT "progress_position_valid" CHECK ("position_seconds" >= 0 AND "position_seconds" < 'Infinity'::double precision),
  ADD CONSTRAINT "progress_completion_consistent" CHECK ("completed" = ("completed_at" IS NOT NULL));

COMMIT;
