const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");
const ExcelJS = require("exceljs");

const reportsRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminReports
 *   description: Laporan admin
 */

reportsRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/reports/download:
 *   get:
 *     summary: Download laporan bulanan (Excel)
 *     tags: [AdminReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *         description: Bulan (1-12)
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tahun (e.g., 2023)
 *     responses:
 *       200:
 *         description: File Excel laporan
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
// Endpoint untuk Download Laporan Bulanan (Excel .xlsx)
reportsRouter.get("/download", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Parameter month dan year wajib diisi" });
    }

    // 1. Ambil Data dari Database
    const query = `
      SELECT 
        b.public_id as "Booking ID",
        b.created_at,
        COALESCE(u.full_name, u.username) as "Nama Customer",
        u.email as "Email",
        c.name as "Lokasi Camp",
        b.start_date,
        b.end_date,
        b.people_count,
        b.total_price,
        b.status
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN camps c ON b.camp_id = c.id
      WHERE 
        EXTRACT(MONTH FROM b.created_at) = $1 
        AND EXTRACT(YEAR FROM b.created_at) = $2
        AND b.status IN ('PAID', 'CHECK_IN', 'CHECK_OUT')
      ORDER BY b.created_at DESC
    `;

    const result = await db.query(query, [month, year]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Tidak ada data transaksi pada periode ini" });
    }

    // 2. Setup Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Laporan Keuangan");

    // --- STYLING PALETTE ---
    const styles = {
      headerFont: { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF2C3E50' } }, // Dark Blue Text
      subHeaderFont: { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF7F8C8D' } }, // Grey Text
      tableHeaderFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } }, // Dark Blue Bg
      tableHeaderFont: { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }, // White Text
      totalRowFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECF0F1' } }, // Light Grey Bg
      border: {
        top: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        left: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        bottom: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        right: { style: 'thin', color: { argb: 'FFBDC3C7' } }
      }
    };

    // 3. Judul & Info (Header Report)
    worksheet.mergeCells('A1:J2'); // Merge 2 baris untuk judul
    const titleCell = worksheet.getCell('A1');
    titleCell.value = "LAPORAN PENDAPATAN CAMPING";
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.font = styles.headerFont;

    const monthNames = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const periodName = `${monthNames[parseInt(month)]} ${year}`;

    // Info Periode (Baris 4)
    worksheet.getCell('A4').value = "Periode Laporan";
    worksheet.getCell('A4').font = styles.subHeaderFont;
    worksheet.getCell('B4').value = `: ${periodName}`;
    worksheet.getCell('B4').font = { name: 'Segoe UI', size: 11 };

    // Info Tanggal Cetak (Baris 5)
    worksheet.getCell('A5').value = "Tanggal Cetak";
    worksheet.getCell('A5').font = styles.subHeaderFont;
    worksheet.getCell('B5').value = `: ${new Date().toLocaleString("id-ID")}`;
    worksheet.getCell('B5').font = { name: 'Segoe UI', size: 11 };

    // 4. Header Tabel (Baris 7)
    const headerRowIdx = 7;
    const tableHeaderRow = worksheet.getRow(headerRowIdx);
    tableHeaderRow.values = [
      "Booking ID", "Tanggal Booking", "Nama Customer", "Email", 
      "Lokasi Camp", "Check In", "Check Out", "Jumlah Orang", 
      "Total Harga", "Status"
    ];
    tableHeaderRow.height = 25; // Lebih tinggi biar lega
    
    tableHeaderRow.eachCell((cell) => {
      cell.fill = styles.tableHeaderFill;
      cell.font = styles.tableHeaderFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = styles.border;
    });

    // 5. Isi Data (Mulai Baris 8)
    let currentRowIndex = 8;
    let totalRevenue = 0;

    result.rows.forEach((row, index) => {
      const rowData = worksheet.getRow(currentRowIndex);
      
      rowData.values = [
        row["Booking ID"],
        new Date(row.created_at).toLocaleString("id-ID"),
        row["Nama Customer"],
        row["Email"],
        row["Lokasi Camp"],
        new Date(row.start_date).toLocaleDateString("id-ID"),
        new Date(row.end_date).toLocaleDateString("id-ID"),
        row.people_count,
        parseInt(row.total_price),
        row.status
      ];

      // Styling Per Cell
      rowData.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.border = styles.border;
        cell.alignment = { vertical: 'middle' };

        // Zebra Striping (Baris Genap dikasih warna abu tipis)
        if (index % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
        }

        // Alignment Khusus
        if (colNumber === 2 || colNumber === 6 || colNumber === 7) { // Tanggal
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 8 || colNumber === 9) { // Angka
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }

        // Warna Status (Kolom 10)
        if (colNumber === 10) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { bold: true, name: 'Segoe UI', size: 9 };
          if (row.status === 'PAID') cell.font.color = { argb: 'FF27AE60' }; // Hijau
          else if (row.status === 'CHECK_IN') cell.font.color = { argb: 'FF2980B9' }; // Biru
          else if (row.status === 'CHECK_OUT') cell.font.color = { argb: 'FF7F8C8D' }; // Abu
        }
      });

      // Format Currency
      rowData.getCell(9).numFmt = '"Rp"#,##0';

      totalRevenue += parseInt(row.total_price);
      currentRowIndex++;
    });

    // 6. Baris Total (Ada jarak 1 baris kosong biar enak dilihat)
    const totalRowIdx = currentRowIndex + 1;
    const totalRow = worksheet.getRow(totalRowIdx);
    
    totalRow.getCell(8).value = "GRAND TOTAL"; 
    totalRow.getCell(9).value = totalRevenue;
    
    // Styling Baris Total
    totalRow.height = 30;
    
    const totalLabelCell = totalRow.getCell(8);
    totalLabelCell.font = { bold: true, size: 12, name: 'Segoe UI', color: { argb: 'FF2C3E50' } };
    totalLabelCell.fill = styles.totalRowFill;
    totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    totalLabelCell.border = styles.border;

    const totalValueCell = totalRow.getCell(9);
    totalValueCell.font = { bold: true, size: 13, name: 'Segoe UI', color: { argb: 'FF2C3E50' } };
    totalValueCell.fill = styles.totalRowFill;
    totalValueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    totalValueCell.border = styles.border;
    totalValueCell.numFmt = '"Rp"#,##0';

    // 7. Auto Width
    worksheet.columns = [
      { width: 38 }, // ID
      { width: 22 }, // Tgl
      { width: 25 }, // Nama
      { width: 30 }, // Email
      { width: 25 }, // Lokasi
      { width: 15 }, // In
      { width: 15 }, // Out
      { width: 15 }, // Org
      { width: 20 }, // Harga
      { width: 15 }, // Status
    ];

    // 8. Kirim File ke User
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Laporan-Keuangan-${periodName}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Download Report Error:", err);
    // Jika header sudah terkirim, tidak bisa kirim JSON error
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
});

module.exports = { reportsRouter };
