import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type AuthUser = {
  id: string;
  username: string | null;
  email: string | null;
  country: string | null;
};

export type AuthAvatar = {
  color: string;
  shape: string;
};

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const avatar = ref<AuthAvatar | null>(null);
  const initialized = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  let initPromise: Promise<void> | null = null;

  function init(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = doInit();
    return initPromise;
  }

  async function doInit() {
    if (!supabase) {
      initialized.value = true;
      return;
    }

    try {
      // Load initial session
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const u = data.session.user;
        user.value = {
          id: u.id,
          username: u.user_metadata?.username ?? null,
          email: u.email ?? null,
          country: u.user_metadata?.country ?? null,
        };
        await loadAvatar(u.id);
      }
    } catch {
      // Session loading failed — continue as unauthenticated
    }
    initialized.value = true;

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const u = session.user;
        user.value = {
          id: u.id,
          username: u.user_metadata?.username ?? null,
          email: u.email ?? null,
          country: u.user_metadata?.country ?? null,
        };
        await loadAvatar(u.id);
      } else {
        user.value = null;
        avatar.value = null;
      }
    });
  }

  async function loadAvatar(userId: string) {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('user_avatars')
        .select('color, options')
        .eq('user_id', userId)
        .single();
      if (data) {
        avatar.value = {
          color: data.color ?? '',
          shape: data.options?.shape ?? '',
        };
      }
    } catch {
      // Avatar is optional
    }
  }

  async function signIn(email: string, password: string) {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(input: {
    email: string;
    password: string;
    username: string;
    country: string;
  }) {
    if (!supabase) throw new Error('Supabase is not configured');

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { username: input.username, country: input.country },
      },
    });
    if (error) throw error;

    // If no session returned, try to sign in
    if (!data.session) {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (loginError) throw loginError;
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    user.value = null;
    avatar.value = null;
  }

  async function getAccessToken(): Promise<string> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) throw new Error('Authentication required');
    return token;
  }

  return {
    user,
    avatar,
    initialized,
    isAuthenticated,
    init,
    signIn,
    signUp,
    signOut,
    getAccessToken,
  };
});
