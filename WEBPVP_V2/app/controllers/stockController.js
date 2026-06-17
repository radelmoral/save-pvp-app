const multer = require('multer');
const XLSX   = require('xlsx');
const pool   = require('../config/db');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('spreadsheet') || file.originalname.match(/\.xlsx?$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos Excel (.xlsx)'));
    }
  },
});

async function subirStock(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha enviado ningún archivo' });
  }

  try {
    const wb    = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws    = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'El archivo no contiene datos' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('TRUNCATE TABLE stock_erp');

      const chunkSize = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk  = rows.slice(i, i + chunkSize);
        const values = chunk.map(r => [
          r['Store']                              || null,
          r['Reference']                          || null,
          r['Make']                               || null,
          r['Label']                              || null,
          r['Current Stock']  != null ? Number(r['Current Stock'])  : null,
          r['Category']                           || null,
          r['Model']                              || null,
          r['Amount (Without VAT)'] != null ? Number(r['Amount (Without VAT)']) : null,
          r['Unit Advisable sell price with tax'] != null
            ? Number(r['Unit Advisable sell price with tax']) : null,
        ]);
        await conn.query(
          `INSERT INTO stock_erp
            (store, reference, make, label, current_stock,
             category, model, amount_without_vat, sell_price_with_tax)
           VALUES ?`,
          [values]
        );
        inserted += chunk.length;
      }

      await conn.commit();
      res.json({ ok: true, rows: inserted });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error al procesar stock:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function estadoStock(req, res) {
  const [[{ total, updated_at }]] = await pool.execute(
    `SELECT COUNT(*) AS total, MAX(created_at) AS updated_at FROM stock_erp`
  );
  res.json({ total, updated_at });
}

module.exports = { upload, subirStock, estadoStock };
