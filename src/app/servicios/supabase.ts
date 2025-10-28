import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://tawymqnjgcgsljweinbh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhd3ltcW5qZ2Nnc2xqd2VpbmJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0ODk0MzEsImV4cCI6MjA3NzA2NTQzMX0.67H5CVloDJqGLECvW5Js0Gg0_MlXF85GuMSxKddcQQE'
);