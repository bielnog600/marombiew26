import { supabase } from '@/integrations/supabase/client';
import type { AppLanguage } from '@/i18n';

/**
 * Salva o idioma do aparelho no perfil do aluno (students_profile.app_language).
 * O servidor usa isso para traduzir dieta/treino logo após a publicação.
 * Nunca rejeita: offline ou erro apenas mantém o valor anterior.
 */
export const syncStudentAppLanguage = async (language: AppLanguage): Promise<void> => {
  try {
    const { error } = await supabase.rpc('set_my_app_language', { _language: language });
    if (error) console.warn('[app_language] não foi possível salvar', error.message);
  } catch {
    /* offline */
  }
};
