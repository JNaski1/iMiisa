import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load supabase config from src/lib/supabase.ts
const cfg = fs.readFileSync(path.resolve('src/lib/supabase.ts'), 'utf8');
const urlMatch = cfg.match(/const supabaseUrl\s*=\s*['\"]([^'\"]+)['\"]/);
const keyMatch = cfg.match(/const supabaseAnonKey\s*=\s*['\"]([^'\"]+)['\"]/);
if (!urlMatch || !keyMatch) {
  console.error('Could not find Supabase URL/key in src/lib/supabase.ts');
  process.exit(1);
}
const supabaseUrl = urlMatch[1];
const supabaseAnonKey = keyMatch[1];

console.log('Using Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

async function run() {
  try {
    // 1) Try uploading a tiny text file to the daily-photos bucket
    const bucket = 'daily-photos';
    const testName = `imiisa-test-${Date.now()}.txt`;
    const filePath = path.resolve('scripts', 'imiisa-test.txt');
    fs.writeFileSync(filePath, 'imiisa test ' + new Date().toISOString());
    const file = fs.createReadStream(filePath);

    console.log('[TEST] Uploading test file to storage:', bucket, testName);
    const up = await supabase.storage.from(bucket).upload(testName, file, { upsert: true });
    console.log('[TEST] upload response:', up);

    // 2) Try listing objects in bucket
    console.log('[TEST] Listing objects in bucket...');
    const list = await supabase.storage.from(bucket).list('', { limit: 20 });
    console.log('[TEST] list response:', list);

    // 3) Try creating signed URL for uploaded object
    console.log('[TEST] createSignedUrl...');
    const signed = await supabase.storage.from(bucket).createSignedUrl(testName, 60);
    console.log('[TEST] signed url response:', signed);

    // 4) Try inserting/upserting a row in daily_photos
    const dateKey = new Date().toISOString().slice(0,10);
    console.log('[TEST] upserting daily_photos row for', dateKey);
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('daily_photos').upsert({ photo_date: dateKey, photo_path: testName, photo_url: signed?.data?.signedUrl ?? null, created_at: now }, { onConflict: 'photo_date' }).select().maybeSingle();
    console.log('[TEST] daily_photos upsert result:', { data, error });

    // 5) Try selecting rows
    const sel = await supabase.from('daily_photos').select('*').limit(5);
    console.log('[TEST] select daily_photos result:', sel);

    // 6) Cleanup: delete test file (attempt)
    try {
      await supabase.storage.from(bucket).remove([testName]);
      console.log('[TEST] removed test file');
    } catch (e) {
      console.warn('[TEST] cleanup failed', e);
    }

    process.exit(0);
  } catch (e) {
    console.error('[TEST] error', e);
    process.exit(2);
  }
}

run();
