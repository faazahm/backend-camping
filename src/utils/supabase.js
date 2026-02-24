const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] SUPABASE_URL atau SUPABASE_ANON_KEY tidak ditemukan di environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Upload file ke Supabase Storage
 * @param {Object} file - Object file dari multer (memoryStorage)
 * @param {string} bucket - Nama bucket di Supabase
 * @param {string} folder - Folder tujuan di dalam bucket
 * @returns {Promise<string>} - URL publik file yang diupload
 */
const uploadToSupabase = async (file, bucket, folder = '') => {
  try {
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;
    const filePath = fileName.replace(/\/+/g, '/'); // Bersihkan double slash

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('[Supabase Upload Error]:', error);
    throw error;
  }
};

module.exports = { supabase, uploadToSupabase };
