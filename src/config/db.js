const { Pool } = require("pg");

let db = null;

if (process.env.DATABASE_URL) {
  // Detect if connecting to local database
  const isLocal = process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1");
  
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : {
      rejectUnauthorized: false, // Required for Neon/Render/Heroku
    },
    max: 10,
  });
} else if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
  db = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    max: 10,
  });
}

if (db) {
  (async () => {
    try {
      // 1. PRIORITAS UTAMA: Buat tabel token_blacklist agar auth tidak error
      console.log("[DB] Mencoba membuat tabel token_blacklist...");
      await db.query(`
        CREATE TABLE IF NOT EXISTS "token_blacklist" (
          "id" SERIAL PRIMARY KEY,
          "token" TEXT UNIQUE NOT NULL,
          "expires_at" TIMESTAMP NOT NULL,
          "created_at" TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log("[DB] Tabel token_blacklist siap.");

      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reset_password_token') THEN
            ALTER TABLE "users" ADD COLUMN "reset_password_token" TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reset_password_expires') THEN
            ALTER TABLE "users" ADD COLUMN "reset_password_expires" TIMESTAMP;
          END IF;
        END $$;
      `);

      await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'camps' AND column_name = 'daily_capacity'
           ) THEN
             ALTER TABLE "camps" ADD COLUMN "daily_capacity" INTEGER NOT NULL DEFAULT 100;
           END IF;
         END $$;`
      );

      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'public_id'
           ) THEN
             ALTER TABLE "users" ADD COLUMN "public_id" uuid NOT NULL DEFAULT gen_random_uuid();
           END IF;
         END $$;`
      );

      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'camps' AND column_name = 'public_id'
           ) THEN
             ALTER TABLE "camps" ADD COLUMN "public_id" uuid NOT NULL DEFAULT gen_random_uuid();
           END IF;
         END $$;`
      );

      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'public_id'
           ) THEN
             ALTER TABLE "bookings" ADD COLUMN "public_id" uuid NOT NULL DEFAULT gen_random_uuid();
           END IF;
         END $$;`
      );

      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'equipments' AND column_name = 'public_id'
           ) THEN
             ALTER TABLE "equipments" ADD COLUMN "public_id" uuid NOT NULL DEFAULT gen_random_uuid();
           END IF;
         END $$;`
      );
      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'people_count'
           ) THEN
             ALTER TABLE "bookings" ADD COLUMN "people_count" INTEGER NOT NULL DEFAULT 1;
           END IF;
         END $$;`
      );
      await db.query(`ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PAID'`);
      await db.query(`ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'CHECK_IN'`);
      await db.query(`ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'CHECK_OUT'`);

      // Create notifications table
      await db.query(`
        CREATE TABLE IF NOT EXISTS "notifications" (
          "id" SERIAL PRIMARY KEY,
          "message" TEXT NOT NULL,
          "is_read" BOOLEAN DEFAULT false,
          "type" TEXT,
          "related_id" INTEGER,
          "created_at" TIMESTAMP DEFAULT NOW()
        );
      `);

      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole' OR typname = 'userrole') THEN
             CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
           END IF;
         END $$;`
      );
      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
           ) THEN
             ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
           END IF;
         END $$;`
      );

      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone_number'
           ) THEN
             ALTER TABLE "users" ADD COLUMN "phone_number" VARCHAR(20);
           END IF;
           
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name'
           ) THEN
             ALTER TABLE "users" ADD COLUMN "full_name" VARCHAR(255);
           END IF;

           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'address'
           ) THEN
             ALTER TABLE "users" ADD COLUMN "address" TEXT;
           END IF;

           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'profile_picture'
           ) THEN
             ALTER TABLE "users" ADD COLUMN "profile_picture" TEXT;
           END IF;

           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'google_id'
           ) THEN
             ALTER TABLE "users" ADD COLUMN "google_id" VARCHAR(255);
             ALTER TABLE "users" ADD CONSTRAINT "users_google_id_key" UNIQUE ("google_id");
           END IF;
         END $$;`
      );

      // Add photo_url column to camps table
      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'camps' AND column_name = 'photo_url'
           ) THEN
             ALTER TABLE "camps" ADD COLUMN "photo_url" TEXT;
           END IF;
         END $$;`
      );

      // Create equipments table
      await db.query(`
        CREATE TABLE IF NOT EXISTS "equipments" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "price" INTEGER NOT NULL,
          "stock" INTEGER NOT NULL,
          "photo_url" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create booking_equipments table
      await db.query(`
        CREATE TABLE IF NOT EXISTS "booking_equipments" (
          "id" SERIAL PRIMARY KEY,
          "booking_id" INTEGER NOT NULL REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "equipment_id" INTEGER NOT NULL REFERENCES "equipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "quantity" INTEGER NOT NULL,
          "nights" INTEGER NOT NULL DEFAULT 1,
          "price" INTEGER NOT NULL
        );
      `);

      await db.query(`
        ALTER TABLE "booking_equipments"
        ADD COLUMN IF NOT EXISTS "nights" INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "price" INTEGER NOT NULL DEFAULT 0;
      `);

      await db.query(`
        ALTER TABLE "bookings"
        ADD COLUMN IF NOT EXISTS "payment_proof" TEXT;
      `);

      // Create review_questions table
      await db.query(`
        CREATE TABLE IF NOT EXISTS "review_questions" (
          "id" SERIAL PRIMARY KEY,
          "question" TEXT NOT NULL,
          "options" JSONB NOT NULL,
          "created_at" TIMESTAMP DEFAULT NOW()
        );
      `);

      // Create reviews table
      await db.query(`
        CREATE TABLE IF NOT EXISTS "reviews" (
          "id" SERIAL PRIMARY KEY,
          "booking_id" INTEGER REFERENCES "bookings"("id"),
          "user_id" INTEGER REFERENCES "users"("id"),
          "evaluation_answers" TEXT,
          "total_score" INTEGER DEFAULT 0,
          "comment" TEXT,
          "created_at" TIMESTAMP DEFAULT NOW()
        );
      `);

      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'evaluation_answers'
          ) THEN
            ALTER TABLE "reviews" ADD COLUMN "evaluation_answers" TEXT;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'total_score'
          ) THEN
            ALTER TABLE "reviews" ADD COLUMN "total_score" INTEGER DEFAULT 0;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'comment'
          ) THEN
            ALTER TABLE "reviews" ADD COLUMN "comment" TEXT;
          END IF;
        END $$;
      `);

      // Insert default questions (10 questions grouped by 5 aspects)
      const qCheck = await db.query("SELECT COUNT(*) FROM review_questions");
      if (parseInt(qCheck.rows[0].count) === 0) {
        const defaultQuestions = [
          // Kebersihan (1-2)
          ['Seberapa bersih area perkemahan secara keseluruhan?', JSON.stringify(['Sangat Bersih', 'Bersih', 'Cukup', 'Kotor', 'Sangat Kotor'])],
          ['Bagaimana kondisi kebersihan toilet dan fasilitas air?', JSON.stringify(['Sangat Bersih', 'Bersih', 'Cukup', 'Kotor', 'Sangat Kotor'])],
          // Fasilitas (3-4)
          ['Apakah peralatan camping yang disewa dalam kondisi baik?', JSON.stringify(['Sangat Baik', 'Baik', 'Cukup', 'Buruk', 'Sangat Buruk'])],
          ['Seberapa lengkap fasilitas pendukung (listrik, lampu, dll)?', JSON.stringify(['Sangat Lengkap', 'Lengkap', 'Cukup', 'Kurang', 'Sangat Kurang'])],
          // Pelayanan (5-6)
          ['Bagaimana keramahan staf dalam melayani Anda?', JSON.stringify(['Sangat Ramah', 'Ramah', 'Cukup', 'Kurang', 'Sangat Kurang'])],
          ['Seberapa cepat respon staf saat Anda membutuhkan bantuan?', JSON.stringify(['Sangat Cepat', 'Cepat', 'Cukup', 'Lambat', 'Sangat Lambat'])],
          // Keamanan & Lingkungan (7-8)
          ['Seberapa aman perasaan Anda selama berkemah di sini?', JSON.stringify(['Sangat Aman', 'Aman', 'Cukup', 'Rawan', 'Sangat Rawan'])],
          ['Bagaimana ketenangan dan kenyamanan lingkungan sekitar?', JSON.stringify(['Sangat Tenang', 'Tenang', 'Cukup', 'Bising', 'Sangat Bising'])],
          // Kepuasan Umum (9-10)
          ['Seberapa besar kemungkinan Anda merekomendasikan tempat ini?', JSON.stringify(['Sangat Mungkin', 'Mungkin', 'Ragu-ragu', 'Tidak Mungkin', 'Sangat Tidak Mungkin'])],
          ['Apakah harga yang dibayar sebanding dengan pengalaman Anda?', JSON.stringify(['Sangat Sebanding', 'Sebanding', 'Cukup', 'Mahal', 'Sangat Mahal'])]
        ];
        for (const [q, opt] of defaultQuestions) {
          await db.query('INSERT INTO review_questions (question, options) VALUES ($1, $2)', [q, opt]);
        }
      }
    } catch (e) {
      console.error("Database bootstrap error:", e);
    }
  })();
} else {
  console.warn("Database env variables are not fully configured");
}

module.exports = { db };
