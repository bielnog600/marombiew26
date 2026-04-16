export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_plans: {
        Row: {
          conteudo: string
          created_at: string
          fase: string
          fase_inicio_data: string | null
          id: string
          student_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          fase?: string
          fase_inicio_data?: string | null
          id?: string
          student_id: string
          tipo?: string
          titulo?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          fase?: string
          fase_inicio_data?: string | null
          id?: string
          student_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      anamnese: {
        Row: {
          alcool: string | null
          assessment_id: string
          cirurgias: string | null
          dores: string | null
          historico_saude: string | null
          id: string
          medicacao: string | null
          rotina: string | null
          sono: string | null
          stress: string | null
          suplementos: string | null
          tabagismo: boolean | null
          treino_atual: string | null
        }
        Insert: {
          alcool?: string | null
          assessment_id: string
          cirurgias?: string | null
          dores?: string | null
          historico_saude?: string | null
          id?: string
          medicacao?: string | null
          rotina?: string | null
          sono?: string | null
          stress?: string | null
          suplementos?: string | null
          tabagismo?: boolean | null
          treino_atual?: string | null
        }
        Update: {
          alcool?: string | null
          assessment_id?: string
          cirurgias?: string | null
          dores?: string | null
          historico_saude?: string | null
          id?: string
          medicacao?: string | null
          rotina?: string | null
          sono?: string | null
          stress?: string | null
          suplementos?: string | null
          tabagismo?: boolean | null
          treino_atual?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      anthropometrics: {
        Row: {
          abdomen: number | null
          altura: number | null
          antebraco: number | null
          antebraco_esquerdo: number | null
          assessment_id: string
          biceps_contraido_direito: number | null
          biceps_contraido_esquerdo: number | null
          braco_direito: number | null
          braco_esquerdo: number | null
          cintura: number | null
          coxa_direita: number | null
          coxa_esquerda: number | null
          id: string
          imc: number | null
          ombro: number | null
          panturrilha_direita: number | null
          panturrilha_esquerda: number | null
          pescoco: number | null
          peso: number | null
          quadril: number | null
          rcq: number | null
          torax: number | null
        }
        Insert: {
          abdomen?: number | null
          altura?: number | null
          antebraco?: number | null
          antebraco_esquerdo?: number | null
          assessment_id: string
          biceps_contraido_direito?: number | null
          biceps_contraido_esquerdo?: number | null
          braco_direito?: number | null
          braco_esquerdo?: number | null
          cintura?: number | null
          coxa_direita?: number | null
          coxa_esquerda?: number | null
          id?: string
          imc?: number | null
          ombro?: number | null
          panturrilha_direita?: number | null
          panturrilha_esquerda?: number | null
          pescoco?: number | null
          peso?: number | null
          quadril?: number | null
          rcq?: number | null
          torax?: number | null
        }
        Update: {
          abdomen?: number | null
          altura?: number | null
          antebraco?: number | null
          antebraco_esquerdo?: number | null
          assessment_id?: string
          biceps_contraido_direito?: number | null
          biceps_contraido_esquerdo?: number | null
          braco_direito?: number | null
          braco_esquerdo?: number | null
          cintura?: number | null
          coxa_direita?: number | null
          coxa_esquerda?: number | null
          id?: string
          imc?: number | null
          ombro?: number | null
          panturrilha_direita?: number | null
          panturrilha_esquerda?: number | null
          pescoco?: number | null
          peso?: number | null
          quadril?: number | null
          rcq?: number | null
          torax?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anthropometrics_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_photos: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          tipo: string | null
          url: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          tipo?: string | null
          url: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          tipo?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_photos_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          avaliador_id: string
          created_at: string
          id: string
          notas_gerais: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          avaliador_id: string
          created_at?: string
          id?: string
          notas_gerais?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          avaliador_id?: string
          created_at?: string
          id?: string
          notas_gerais?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      composition: {
        Row: {
          assessment_id: string
          id: string
          massa_gorda: number | null
          massa_magra: number | null
          observacoes: string | null
          percentual_gordura: number | null
        }
        Insert: {
          assessment_id: string
          id?: string
          massa_gorda?: number | null
          massa_magra?: number | null
          observacoes?: string | null
          percentual_gordura?: number | null
        }
        Update: {
          assessment_id?: string
          id?: string
          massa_gorda?: number | null
          massa_magra?: number | null
          observacoes?: string | null
          percentual_gordura?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "composition_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tracking: {
        Row: {
          created_at: string
          date: string
          id: string
          meals_completed: Json
          student_id: string
          updated_at: string
          water_glasses: number
          workout_completed: boolean
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          meals_completed?: Json
          student_id: string
          updated_at?: string
          water_glasses?: number
          workout_completed?: boolean
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          meals_completed?: Json
          student_id?: string
          updated_at?: string
          water_glasses?: number
          workout_completed?: boolean
        }
        Relationships: []
      }
      diet_questionnaires: {
        Row: {
          alimentos_por_refeicao: Json | null
          baixa_energia: boolean | null
          como_se_sente: string | null
          created_at: string
          dias_treino: string | null
          dor_cabeca: boolean | null
          estilo_dieta: string | null
          fase_atual: string | null
          fome_excessiva: boolean | null
          fraqueza: boolean | null
          horario_treino: string | null
          id: string
          insonia: boolean | null
          irritabilidade: boolean | null
          num_refeicoes: number | null
          observacoes: string | null
          pele_fina: boolean | null
          preferencias_alimentares: string | null
          reduziu_peso: boolean | null
          responded_at: string | null
          restricoes_alimentares: string | null
          status: string
          student_id: string
          token: string
          usa_hormonios: string | null
        }
        Insert: {
          alimentos_por_refeicao?: Json | null
          baixa_energia?: boolean | null
          como_se_sente?: string | null
          created_at?: string
          dias_treino?: string | null
          dor_cabeca?: boolean | null
          estilo_dieta?: string | null
          fase_atual?: string | null
          fome_excessiva?: boolean | null
          fraqueza?: boolean | null
          horario_treino?: string | null
          id?: string
          insonia?: boolean | null
          irritabilidade?: boolean | null
          num_refeicoes?: number | null
          observacoes?: string | null
          pele_fina?: boolean | null
          preferencias_alimentares?: string | null
          reduziu_peso?: boolean | null
          responded_at?: string | null
          restricoes_alimentares?: string | null
          status?: string
          student_id: string
          token?: string
          usa_hormonios?: string | null
        }
        Update: {
          alimentos_por_refeicao?: Json | null
          baixa_energia?: boolean | null
          como_se_sente?: string | null
          created_at?: string
          dias_treino?: string | null
          dor_cabeca?: boolean | null
          estilo_dieta?: string | null
          fase_atual?: string | null
          fome_excessiva?: boolean | null
          fraqueza?: boolean | null
          horario_treino?: string | null
          id?: string
          insonia?: boolean | null
          irritabilidade?: boolean | null
          num_refeicoes?: number | null
          observacoes?: string | null
          pele_fina?: boolean | null
          preferencias_alimentares?: string | null
          reduziu_peso?: boolean | null
          responded_at?: string | null
          restricoes_alimentares?: string | null
          status?: string
          student_id?: string
          token?: string
          usa_hormonios?: string | null
        }
        Relationships: []
      }
      diet_readjustments: {
        Row: {
          created_at: string
          energia_ok: boolean | null
          fome_excessiva: boolean | null
          ganhou_massa: boolean | null
          humor_ok: boolean | null
          id: string
          insonia: boolean | null
          intestino_ok: boolean | null
          observacoes: string | null
          perdeu_peso: boolean | null
          peso_atual: number | null
          plan_id: string
          rendimento_treino: string | null
          satisfacao: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          energia_ok?: boolean | null
          fome_excessiva?: boolean | null
          ganhou_massa?: boolean | null
          humor_ok?: boolean | null
          id?: string
          insonia?: boolean | null
          intestino_ok?: boolean | null
          observacoes?: string | null
          perdeu_peso?: boolean | null
          peso_atual?: number | null
          plan_id: string
          rendimento_treino?: string | null
          satisfacao?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          energia_ok?: boolean | null
          fome_excessiva?: boolean | null
          ganhou_massa?: boolean | null
          humor_ok?: boolean | null
          id?: string
          insonia?: boolean | null
          intestino_ok?: boolean | null
          observacoes?: string | null
          perdeu_peso?: boolean | null
          peso_atual?: number | null
          plan_id?: string
          rendimento_treino?: string | null
          satisfacao?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diet_readjustments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_notifications: {
        Row: {
          created_at: string
          dismissed_month: string
          id: string
          notification_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_month: string
          id?: string
          notification_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_month?: string
          id?: string
          notification_key?: string
          user_id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          created_at: string
          grupo_muscular: string
          id: string
          imagem_url: string | null
          nome: string
          video_embed: string | null
        }
        Insert: {
          created_at?: string
          grupo_muscular: string
          id?: string
          imagem_url?: string | null
          nome: string
          video_embed?: string | null
        }
        Update: {
          created_at?: string
          grupo_muscular?: string
          id?: string
          imagem_url?: string | null
          nome?: string
          video_embed?: string | null
        }
        Relationships: []
      }
      foods: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          fats: number
          id: string
          name: string
          portion: string
          portion_size: number
          protein: number
        }
        Insert: {
          calories?: number
          carbs?: number
          created_at?: string
          fats?: number
          id?: string
          name: string
          portion?: string
          portion_size?: number
          protein?: number
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          fats?: number
          id?: string
          name?: string
          portion?: string
          portion_size?: number
          protein?: number
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          id: string
          meta_gordura: number | null
          meta_medidas: string | null
          meta_peso: number | null
          observacoes: string | null
          prazo: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta_gordura?: number | null
          meta_medidas?: string | null
          meta_peso?: number | null
          observacoes?: string | null
          prazo?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meta_gordura?: number | null
          meta_medidas?: string | null
          meta_peso?: number | null
          observacoes?: string | null
          prazo?: string | null
          student_id?: string
        }
        Relationships: []
      }
      hr_zones: {
        Row: {
          created_at: string
          data_calculo: string
          fc_repouso: number
          fcmax_estimada: number
          fcmax_formula: string
          hrr: number
          id: string
          student_id: string
          updated_at: string
          zonas_karvonen: Json
        }
        Insert: {
          created_at?: string
          data_calculo?: string
          fc_repouso: number
          fcmax_estimada: number
          fcmax_formula?: string
          hrr: number
          id?: string
          student_id: string
          updated_at?: string
          zonas_karvonen?: Json
        }
        Update: {
          created_at?: string
          data_calculo?: string
          fc_repouso?: number
          fcmax_estimada?: number
          fcmax_formula?: string
          hrr?: number
          id?: string
          student_id?: string
          updated_at?: string
          zonas_karvonen?: Json
        }
        Relationships: []
      }
      performance_tests: {
        Row: {
          agachamento_score: number | null
          assessment_id: string
          cooper_12min: number | null
          id: string
          mobilidade_ombro: string | null
          mobilidade_quadril: string | null
          mobilidade_tornozelo: string | null
          observacoes: string | null
          plank: number | null
          pushup: number | null
          salto_vertical: number | null
        }
        Insert: {
          agachamento_score?: number | null
          assessment_id: string
          cooper_12min?: number | null
          id?: string
          mobilidade_ombro?: string | null
          mobilidade_quadril?: string | null
          mobilidade_tornozelo?: string | null
          observacoes?: string | null
          plank?: number | null
          pushup?: number | null
          salto_vertical?: number | null
        }
        Update: {
          agachamento_score?: number | null
          assessment_id?: string
          cooper_12min?: number | null
          id?: string
          mobilidade_ombro?: string | null
          mobilidade_quadril?: string | null
          mobilidade_tornozelo?: string | null
          observacoes?: string | null
          plank?: number | null
          pushup?: number | null
          salto_vertical?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_tests_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      posture: {
        Row: {
          assessment_id: string
          id: string
          observacoes: string | null
          vista_anterior: Json | null
          vista_lateral: Json | null
          vista_posterior: Json | null
        }
        Insert: {
          assessment_id: string
          id?: string
          observacoes?: string | null
          vista_anterior?: Json | null
          vista_lateral?: Json | null
          vista_posterior?: Json | null
        }
        Update: {
          assessment_id?: string
          id?: string
          observacoes?: string | null
          vista_anterior?: Json | null
          vista_lateral?: Json | null
          vista_posterior?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "posture_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      posture_scans: {
        Row: {
          angles_json: Json | null
          assessment_id: string | null
          attention_points_json: Json | null
          back_depth_url: string | null
          back_photo_url: string | null
          created_at: string
          device_has_lidar: boolean | null
          front_depth_url: string | null
          front_photo_url: string | null
          height_cm: number | null
          id: string
          mode: string | null
          notes: string | null
          overrides_json: Json | null
          pose_keypoints_json: Json | null
          region_scores_json: Json | null
          sex: string | null
          shoulder_tests_json: Json | null
          side_depth_url: string | null
          side_photo_url: string | null
          student_id: string
        }
        Insert: {
          angles_json?: Json | null
          assessment_id?: string | null
          attention_points_json?: Json | null
          back_depth_url?: string | null
          back_photo_url?: string | null
          created_at?: string
          device_has_lidar?: boolean | null
          front_depth_url?: string | null
          front_photo_url?: string | null
          height_cm?: number | null
          id?: string
          mode?: string | null
          notes?: string | null
          overrides_json?: Json | null
          pose_keypoints_json?: Json | null
          region_scores_json?: Json | null
          sex?: string | null
          shoulder_tests_json?: Json | null
          side_depth_url?: string | null
          side_photo_url?: string | null
          student_id: string
        }
        Update: {
          angles_json?: Json | null
          assessment_id?: string | null
          attention_points_json?: Json | null
          back_depth_url?: string | null
          back_photo_url?: string | null
          created_at?: string
          device_has_lidar?: boolean | null
          front_depth_url?: string | null
          front_photo_url?: string | null
          height_cm?: number | null
          id?: string
          mode?: string | null
          notes?: string | null
          overrides_json?: Json | null
          pose_keypoints_json?: Json | null
          region_scores_json?: Json | null
          sex?: string | null
          shoulder_tests_json?: Json | null
          side_depth_url?: string | null
          side_photo_url?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posture_scans_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      progress_notes: {
        Row: {
          created_at: string
          data: string
          id: string
          nota: string
          student_id: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          nota: string
          student_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          nota?: string
          student_id?: string
        }
        Relationships: []
      }
      skinfolds: {
        Row: {
          abdominal: number | null
          assessment_id: string
          axilar_media: number | null
          coxa: number | null
          id: string
          metodo: string | null
          peitoral: number | null
          subescapular: number | null
          suprailiaca: number | null
          triceps: number | null
        }
        Insert: {
          abdominal?: number | null
          assessment_id: string
          axilar_media?: number | null
          coxa?: number | null
          id?: string
          metodo?: string | null
          peitoral?: number | null
          subescapular?: number | null
          suprailiaca?: number | null
          triceps?: number | null
        }
        Update: {
          abdominal?: number | null
          assessment_id?: string
          axilar_media?: number | null
          coxa?: number | null
          id?: string
          metodo?: string | null
          peitoral?: number | null
          subescapular?: number | null
          suprailiaca?: number | null
          triceps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "skinfolds_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      students_profile: {
        Row: {
          altura: number | null
          ativo: boolean
          created_at: string
          data_nascimento: string | null
          fotos: string[] | null
          id: string
          lesoes: string | null
          objetivo: string | null
          observacoes: string | null
          raca: string | null
          restricoes: string | null
          sexo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          altura?: number | null
          ativo?: boolean
          created_at?: string
          data_nascimento?: string | null
          fotos?: string[] | null
          id?: string
          lesoes?: string | null
          objetivo?: string | null
          observacoes?: string | null
          raca?: string | null
          restricoes?: string | null
          sexo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          altura?: number | null
          ativo?: boolean
          created_at?: string
          data_nascimento?: string | null
          fotos?: string[] | null
          id?: string
          lesoes?: string | null
          objetivo?: string | null
          observacoes?: string | null
          raca?: string | null
          restricoes?: string | null
          sexo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vitals: {
        Row: {
          assessment_id: string
          fc_repouso: number | null
          glicemia: number | null
          id: string
          observacoes: string | null
          pressao: string | null
          spo2: number | null
        }
        Insert: {
          assessment_id: string
          fc_repouso?: number | null
          glicemia?: number | null
          id?: string
          observacoes?: string | null
          pressao?: string | null
          spo2?: number | null
        }
        Update: {
          assessment_id?: string
          fc_repouso?: number | null
          glicemia?: number | null
          id?: string
          observacoes?: string | null
          pressao?: string | null
          spo2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "aluno"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "aluno"],
    },
  },
} as const
