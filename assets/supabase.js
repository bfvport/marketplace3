// assets/supabase.js
// Requiere que exista window.supabase (CDN) cargado en el HTML

const supabaseUrl = 'https://uriqltengefxiijgonih.supabase.co';
const supabaseKey = 'sb_publishable_lHmMGjQnXl0Bm4FOF5YV5w_jQN_lNRP';

window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
