# PANDUAN TEST MENYELURUH BACKEND CAMPING API

Panduan ini berisi langkah-langkah berurutan untuk mengecek apakah semua fitur backend sudah berjalan dengan benar.

Lakukan test menggunakan **Postman** atau alat test API lainnya.
Pastikan server backend sudah berjalan (`npm run dev` atau `node src/index.js`).

## 1. AUTHENTICATION (Login & Register)

### A. Register User Baru
- **Method**: `POST`
- **URL**: `http://localhost:3000/auth/register`
- **Body (JSON)**:
  ```json
  {
    "username": "user_test_1",
    "email": "user_test_1@example.com",
    "password": "password123"
  }
  ```
- **Ekspektasi**: Status 201 Created, pesan "User registered successfully".

### B. Login (Gagal - Email Belum Verifikasi)
- **Method**: `POST`
- **URL**: `http://localhost:3000/auth/login`
- **Body (JSON)**:
  ```json
  {
    "identifier": "user_test_1@example.com",
    "password": "password123"
  }
  ```
- **Ekspektasi**: Status 403 Forbidden, pesan "Email belum diverifikasi".

### C. Verifikasi Email (Manual di Database)
Karena kita tidak membuka email sungguhan, kita verifikasi manual lewat database atau endpoint verifikasi (jika kode diketahui). Untuk cepatnya:
- Jalankan query SQL di database:
  ```sql
  UPDATE users SET is_verified = true WHERE email = 'user_test_1@example.com';
  ```

### D. Login (Berhasil)
- **Method**: `POST`
- **URL**: `http://localhost:3000/auth/login`
- **Body (JSON)**: Sama seperti langkah B.
- **Ekspektasi**: Status 200 OK.
- **Simpan Response**: Copy `token` dari response. Kita sebut ini **TOKEN_USER**.

### E. Forgot Password Flow
1. **Request Reset Password**
   - **Method**: `POST`
   - **URL**: `http://localhost:3000/auth/forgot-password`
   - **Body (JSON)**:
     ```json
     {
       "email": "user_test_1@example.com"
     }
     ```
   - **Ekspektasi**: Status 200 OK, message "Email reset password telah dikirim".

2. **Ambil Token (Manual di Database)**
   - Karena email tidak terkirim beneran, ambil token lewat database (Prisma Studio atau Query).
   - Query: `SELECT reset_password_token FROM users WHERE email = 'user_test_1@example.com';`
   - Copy token tersebut. Kita sebut **RESET_TOKEN**.

3. **Reset Password Baru**
   - **Method**: `POST`
   - **URL**: `http://localhost:3000/auth/reset-password`
   - **Body (JSON)**:
     ```json
     {
       "token": "RESET_TOKEN",
       "newPassword": "passwordBaru123"
     }
     ```
   - **Ekspektasi**: Status 200 OK, message "Password berhasil diubah".

4. **Login dengan Password Baru**
   - Coba login dengan password baru ("passwordBaru123").

---

## 2. SETUP ADMIN & ALAT (Sebagai Admin)

### A. Login Admin
Gunakan akun yang sudah dijadikan admin (misalnya `faazahusna10@gmail.com` yang kemarin).
- **Method**: `POST`
- **URL**: `http://localhost:3000/auth/login`
- **Body (JSON)**:
  ```json
  {
    "identifier": "faazahusna10@gmail.com",
    "password": "password_adminnya"
  }
  ```
- **Ekspektasi**: Status 200 OK, role "ADMIN".
- **Simpan Response**: Copy `token`. Kita sebut ini **TOKEN_ADMIN**.

### B. Cek Daftar Camp & Ambil ID Camp
- **Method**: `GET`
- **URL**: `http://localhost:3000/admin/camps`
- **Header**: `Authorization: Bearer TOKEN_ADMIN`
- **Ekspektasi**: List camp.
- **Simpan Response**: Copy `id` salah satu camp (UUID). Kita sebut ini **CAMP_UUID**.

### C. Atur Kapasitas Camp
- **Method**: `PUT`
- **URL**: `http://localhost:3000/admin/camps/CAMP_UUID/capacity`
- **Header**: `Authorization: Bearer TOKEN_ADMIN`
- **Body (JSON)**:
  ```json
  {
    "dailyCapacity": 10
  }
  ```
- **Ekspektasi**: Status 200 OK, `dailyCapacity` berubah jadi 10.

### D. Tambah Alat (Equipment) Baru
- **Method**: `POST`
- **URL**: `http://localhost:3000/admin/equipments`
- **Header**: `Authorization: Bearer TOKEN_ADMIN`
- **Body (JSON)**:
  ```json
  {
    "name": "Tenda Besar Test",
    "description": "Muat 4 orang",
    "price": 50000,
    "stock": 5,
    "photoUrl": "http://contoh.com/foto.jpg"
  }
  ```
- **Ekspektasi**: Status 201 Created.
- **Simpan Response**: Copy `public_id` (UUID) dari alat baru ini. Kita sebut ini **ALAT_UUID**.

---

## 3. ALUR BOOKING (Sebagai User)

### A. Cek Ketersediaan Camp
- **Method**: `GET`
- **URL**: `http://localhost:3000/booking/camps/CAMP_UUID/availability?startDate=2025-02-01&endDate=2025-02-03`
- **Header**: `Authorization: Bearer TOKEN_USER`
- **Ekspektasi**:
  - `capacity`: 10
  - `availability`: array 2 hari. `used` harusnya 0 (kalau belum ada booking lain), `remaining` 10.

### B. Cek Ketersediaan Alat
- **Method**: `GET`
- **URL**: `http://localhost:3000/booking/equipments?startDate=2025-02-01&endDate=2025-02-03`
- **Header**: `Authorization: Bearer TOKEN_USER`
- **Ekspektasi**: List alat. Cari alat "Tenda Besar Test", pastikan `availableStock` adalah 5.

### C. Buat Booking Baru
- **Method**: `POST`
- **URL**: `http://localhost:3000/booking`
- **Header**: `Authorization: Bearer TOKEN_USER`
- **Body (JSON)**:
  ```json
  {
    "campId": "CAMP_UUID",
    "startDate": "2025-02-01",
    "endDate": "2025-02-03",
    "peopleCount": 4,
    "equipments": [
      {
        "equipmentId": "ALAT_UUID",
        "quantity": 2,
        "nights": 1
      }
    ]
  }
  ```
  *Catatan: Menginap 2 malam, tapi sewa alat cuma 1 malam.*

- **Ekspektasi**:
  - Status 201 Created.
  - `totalPrice` dihitung benar:
    - Orang: 2 malam * 10.000 * 4 orang = 80.000
    - Alat: 50.000 * 2 buah * 1 malam = 100.000
    - Total: 180.000
  - Status booking: `PENDING`
- **Simpan Response**: Copy `public_id` booking. Kita sebut ini **BOOKING_UUID**.

---

## 4. VERIFIKASI LOGIKA BISNIS (Campuran)

### A. Cek Ketersediaan Saat Masih PENDING (User)
- Panggil lagi endpoint **3.A** (Cek Ketersediaan Camp).
- **Ekspektasi**: `used` masih 0, `remaining` masih 10. (Karena status masih PENDING, belum mengurangi kuota).

### B. Cek Stok Alat Saat Masih PENDING (User)
- Panggil lagi endpoint **3.B** (Cek Ketersediaan Alat).
- **Ekspektasi**: `availableStock` masih 5. (Belum mengurangi stok).

### C. Admin Mengubah Status ke PAID
- **Method**: `PUT`
- **URL**: `http://localhost:3000/admin/bookings/BOOKING_UUID/status`
- **Header**: `Authorization: Bearer TOKEN_ADMIN`
- **Body (JSON)**:
  ```json
  {
    "status": "PAID"
  }
  ```
- **Ekspektasi**: Status 200 OK, booking status jadi `PAID`.

### D. Verifikasi Pengurangan Kuota & Stok (PENTING)
1. **Cek Camp**: Panggil lagi endpoint **3.A**.
   - **Ekspektasi**:
     - Tanggal 2025-02-01: `used` = 4, `remaining` = 6.
     - Tanggal 2025-02-02: `used` = 4, `remaining` = 6.

2. **Cek Alat**: Panggil lagi endpoint **3.B**.
   - **Ekspektasi**:
     - Alat "Tenda Besar Test" `availableStock` = 3 (Awal 5 - Sewa 2).

### E. Admin Batalkan Booking (Test Restore Stok)
- **Method**: `PUT`
- **URL**: `http://localhost:3000/admin/bookings/BOOKING_UUID/status`
- **Header**: `Authorization: Bearer TOKEN_ADMIN`
- **Body (JSON)**:
  ```json
  {
    "status": "CANCELLED"
  }
  ```
- **Ekspektasi**: Status 200 OK.

### F. Verifikasi Pengembalian Kuota & Stok
1. **Cek Camp**: Panggil lagi endpoint **3.A**.
   - **Ekspektasi**: `used` kembali jadi 0, `remaining` kembali 10.
2. **Cek Alat**: Panggil lagi endpoint **3.B**.
   - **Ekspektasi**: `availableStock` kembali jadi 5.

---

## 5. TAMBAHAN FITUR BARU

### A. Edit Booking (Tambah Alat Susulan)
Misalkan booking tadi statusnya dikembalikan ke `PENDING` atau buat booking baru. Anggaplah kita pakai booking yang sama, ubah status ke `PENDING` dulu.

1. **Ubah ke PENDING**: Admin `PUT .../status` -> "PENDING".
2. **User Tambah Alat**:
   - **Method**: `PUT`
   - **URL**: `http://localhost:3000/booking/BOOKING_UUID/equipments`
   - **Header**: `Authorization: Bearer TOKEN_USER`
   - **Body (JSON)**:
     ```json
     {
       "equipments": [
         {
           "equipmentId": "ALAT_UUID",
           "quantity": 1,
           "nights": 2
         }
       ]
     }
     ```
   - **Ekspektasi**:
     - Status 200 OK.
     - Response berisi daftar equipment terbaru untuk booking tersebut.
     - Total harga booking di database akan bertambah sesuai alat baru.

### B. Validasi Input UUID (Error Handling)
Coba kirim request dengan ID asal-asalan untuk memastikan server tidak crash.
- **Method**: `GET`
- **URL**: `http://localhost:3000/booking/camps/bukan-uuid/availability?startDate=...`
- **Ekspektasi**: Status 400 Bad Request, message: "campId harus berupa UUID yang valid".

---

## RANGKUMAN
Jika semua langkah di atas berhasil (Status Code sesuai, Data JSON sesuai), maka:
1. **Auth & Role** aman.
2. **CRUD Admin** (Camp & Alat) aman.
3. **Booking Flow** (Create -> Pending -> Paid) aman.
4. **Logika Bisnis** (Kapasitas & Stok berkurang hanya saat PAID) aman.
5. **Fitur Tambahan** (Edit alat susulan, validasi UUID) aman.
