declare global {
    interface Window {
        supabase: any;
    }
}

const supabaseUrl = 'https://awdhzmyieafhfpjmzwsh.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3ZGh6bXlpZWFmaGZwam16d3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MTg0MjAsImV4cCI6MjA4Njk5NDQyMH0.6XB-Wy_5IMcmRDWXO5zsb6LQtyvOJpP1x3a8jMF2t3Q'

export const supabase = window.supabase.createClient(
    supabaseUrl,
    supabaseAnonKey
);