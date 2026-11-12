import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { compressAvatar } from '@/lib/image';

export type AuthUser = {
  id: string;
  username: string | null;
  email: string | null;
  country: string | null;
};

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const avatarUrl = ref<string | null>(null);
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
        avatarUrl.value = null;
      }
    });
  }

  async function loadAvatar(userId: string) {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', userId)
        .single();
      avatarUrl.value = data?.avatar_url ?? null;
    } catch {
      // Profile picture is optional
    }
  }

  async function uploadAvatar(file: File) {
    if (!supabase || !user.value) throw new Error('Authentication required');
    const blob = await compressAvatar(file);
    const path = `${user.value.id}/avatar.webp`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/webp' });
    if (uploadError) throw uploadError;
    const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('user_id', user.value.id);
    if (error) throw error;
    avatarUrl.value = url;
  }

  async function removeAvatar() {
    if (!supabase || !user.value) throw new Error('Authentication required');
    const { error: removeError } = await supabase.storage
      .from('avatars')
      .remove([`${user.value.id}/avatar.webp`]);
    if (removeError) throw removeError;
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('user_id', user.value.id);
    if (error) throw error;
    avatarUrl.value = null;
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
    avatarUrl.value = null;
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
    avatarUrl,
    initialized,
    isAuthenticated,
    init,
    uploadAvatar,
    removeAvatar,
    signIn,
    signUp,
    signOut,
    getAccessToken,
  };
});
