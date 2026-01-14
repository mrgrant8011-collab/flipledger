import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cgwwzithkdtunrpwctvb.supabase.co';
const supabaseAnonKey = 'sb_publishable_q3biAcBkFiSKEYrdUlkQwg_4a6SjiRy';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
