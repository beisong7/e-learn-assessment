BEGIN;
CREATE TABLE "sessions" (
  "token_hash" CHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash"),
  CONSTRAINT "sessions_expiry_valid" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "sessions_token_hash_valid" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
COMMIT;
