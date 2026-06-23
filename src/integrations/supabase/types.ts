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
      admin_notifications: {
        Row: {
          active: boolean
          created_at: string
          id: string
          message: string
          priority: string
          sender_id: string
          student_id: string
          title: string
          viewed_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          message: string
          priority?: string
          sender_id: string
          student_id: string
          title: string
          viewed_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          message?: string
          priority?: string
          sender_id?: string
          student_id?: string
          title?: string
          viewed_at?: string | null
        }
        Relationships: []
      }
      ai_plans: {
        Row: {
          conteudo: string
          conteudo_json: Json | null
          created_at: string
          cycle_days: number
          cycle_status: string
          diet_strategy: string | null
          draft_analysis_id: string | null
          draft_reason: string | null
          draft_source: string | null
          fase: string
          fase_inicio_data: string | null
          generation_intent: string | null
          has_new_checkin: boolean | null
          id: string
          is_draft: boolean
          last_analysis_at: string | null
          last_migration_attempt: string | null
          low_cost_last_review_at: string | null
          low_cost_next_review_at: string | null
          low_cost_review_interval_days: number
          main_exercises_count: number | null
          migration_error: string | null
          migration_status: string | null
          mobility_count: number | null
          parent_plan_id: string | null
          pending_checkin: boolean | null
          protocols: Json | null
          renewal_mode: string
          strategy_source: string | null
          student_id: string
          supplementation: Json | null
          tipo: string
          titulo: string
          version: number
          viability_breakdown: Json | null
          viability_score: number | null
          whatsapp_notified_at: string | null
          whatsapp_notified_count: number
        }
        Insert: {
          conteudo?: string
          conteudo_json?: Json | null
          created_at?: string
          cycle_days?: number
          cycle_status?: string
          diet_strategy?: string | null
          draft_analysis_id?: string | null
          draft_reason?: string | null
          draft_source?: string | null
          fase?: string
          fase_inicio_data?: string | null
          generation_intent?: string | null
          has_new_checkin?: boolean | null
          id?: string
          is_draft?: boolean
          last_analysis_at?: string | null
          last_migration_attempt?: string | null
          low_cost_last_review_at?: string | null
          low_cost_next_review_at?: string | null
          low_cost_review_interval_days?: number
          main_exercises_count?: number | null
          migration_error?: string | null
          migration_status?: string | null
          mobility_count?: number | null
          parent_plan_id?: string | null
          pending_checkin?: boolean | null
          protocols?: Json | null
          renewal_mode?: string
          strategy_source?: string | null
          student_id: string
          supplementation?: Json | null
          tipo?: string
          titulo?: string
          version?: number
          viability_breakdown?: Json | null
          viability_score?: number | null
          whatsapp_notified_at?: string | null
          whatsapp_notified_count?: number
        }
        Update: {
          conteudo?: string
          conteudo_json?: Json | null
          created_at?: string
          cycle_days?: number
          cycle_status?: string
          diet_strategy?: string | null
          draft_analysis_id?: string | null
          draft_reason?: string | null
          draft_source?: string | null
          fase?: string
          fase_inicio_data?: string | null
          generation_intent?: string | null
          has_new_checkin?: boolean | null
          id?: string
          is_draft?: boolean
          last_analysis_at?: string | null
          last_migration_attempt?: string | null
          low_cost_last_review_at?: string | null
          low_cost_next_review_at?: string | null
          low_cost_review_interval_days?: number
          main_exercises_count?: number | null
          migration_error?: string | null
          migration_status?: string | null
          mobility_count?: number | null
          parent_plan_id?: string | null
          pending_checkin?: boolean | null
          protocols?: Json | null
          renewal_mode?: string
          strategy_source?: string | null
          student_id?: string
          supplementation?: Json | null
          tipo?: string
          titulo?: string
          version?: number
          viability_breakdown?: Json | null
          viability_score?: number | null
          whatsapp_notified_at?: string | null
          whatsapp_notified_count?: number
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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
      behavioral_alerts: {
        Row: {
          alert_key: string
          category: string
          created_at: string
          description: string | null
          id: string
          priority: string
          resolved_at: string | null
          status: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_key: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_key?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_event_students: {
        Row: {
          attendance_status: Database["public"]["Enums"]["calendar_attendance_status"]
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          event_id: string
          id: string
          student_id: string
        }
        Insert: {
          attendance_status?: Database["public"]["Enums"]["calendar_attendance_status"]
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          student_id: string
        }
        Update: {
          attendance_status?: Database["public"]["Enums"]["calendar_attendance_status"]
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_students_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          admin_id: string
          created_at: string
          end_datetime: string
          event_type: Database["public"]["Enums"]["calendar_event_type"]
          id: string
          is_recurring: boolean
          location: string | null
          notes: string | null
          recurrence_group_id: string | null
          recurrence_rule: string | null
          start_datetime: string
          status: Database["public"]["Enums"]["calendar_event_status"]
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          end_datetime: string
          event_type?: Database["public"]["Enums"]["calendar_event_type"]
          id?: string
          is_recurring?: boolean
          location?: string | null
          notes?: string | null
          recurrence_group_id?: string | null
          recurrence_rule?: string | null
          start_datetime: string
          status?: Database["public"]["Enums"]["calendar_event_status"]
          timezone?: string
          title?: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          end_datetime?: string
          event_type?: Database["public"]["Enums"]["calendar_event_type"]
          id?: string
          is_recurring?: boolean
          location?: string | null
          notes?: string | null
          recurrence_group_id?: string | null
          recurrence_rule?: string | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["calendar_event_status"]
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_notification_settings: {
        Row: {
          admin_id: string
          created_at: string
          custom_admin_15min_message: string | null
          custom_admin_day_before_message: string | null
          custom_student_15min_message: string | null
          custom_student_day_before_message: string | null
          day_before_time: string
          enable_15min_before_admin: boolean
          enable_15min_before_student: boolean
          enable_day_before_admin: boolean
          enable_day_before_student: boolean
          enable_schedule_notifications: boolean
          id: string
          notify_on_student_cancel: boolean
          notify_on_student_confirm: boolean
          updated_at: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          custom_admin_15min_message?: string | null
          custom_admin_day_before_message?: string | null
          custom_student_15min_message?: string | null
          custom_student_day_before_message?: string | null
          day_before_time?: string
          enable_15min_before_admin?: boolean
          enable_15min_before_student?: boolean
          enable_day_before_admin?: boolean
          enable_day_before_student?: boolean
          enable_schedule_notifications?: boolean
          id?: string
          notify_on_student_cancel?: boolean
          notify_on_student_confirm?: boolean
          updated_at?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          custom_admin_15min_message?: string | null
          custom_admin_day_before_message?: string | null
          custom_student_15min_message?: string | null
          custom_student_day_before_message?: string | null
          day_before_time?: string
          enable_15min_before_admin?: boolean
          enable_15min_before_student?: boolean
          enable_day_before_admin?: boolean
          enable_day_before_student?: boolean
          enable_schedule_notifications?: boolean
          id?: string
          notify_on_student_cancel?: boolean
          notify_on_student_confirm?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      class_credits_log: {
        Row: {
          action_type: Database["public"]["Enums"]["credit_action_type"]
          balance_after: number
          balance_before: number
          calendar_event_id: string | null
          created_at: string
          created_by: string
          id: string
          package_id: string
          quantity: number
          reason: string | null
          student_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["credit_action_type"]
          balance_after?: number
          balance_before?: number
          calendar_event_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          package_id: string
          quantity?: number
          reason?: string | null
          student_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["credit_action_type"]
          balance_after?: number
          balance_before?: number
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          package_id?: string
          quantity?: number
          reason?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_credits_log_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "class_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      class_packages: {
        Row: {
          admin_id: string
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          package_name: string
          payment_date: string | null
          payment_id: string | null
          payment_method: string | null
          payment_status: string | null
          price_per_class: number | null
          remaining_classes: number
          start_date: string
          status: Database["public"]["Enums"]["package_status"]
          student_id: string
          total_amount: number
          total_classes: number
          updated_at: string
          used_classes: number
        }
        Insert: {
          admin_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          package_name?: string
          payment_date?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          price_per_class?: number | null
          remaining_classes?: number
          start_date?: string
          status?: Database["public"]["Enums"]["package_status"]
          student_id: string
          total_amount?: number
          total_classes?: number
          updated_at?: string
          used_classes?: number
        }
        Update: {
          admin_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          package_name?: string
          payment_date?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          price_per_class?: number | null
          remaining_classes?: number
          start_date?: string
          status?: Database["public"]["Enums"]["package_status"]
          student_id?: string
          total_amount?: number
          total_classes?: number
          updated_at?: string
          used_classes?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_packages_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
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
      diet_checkins: {
        Row: {
          adesao: string | null
          cintura_cm: number | null
          completed_at: string | null
          created_at: string
          decision_action: string | null
          decision_confidence: number | null
          decision_rationale: string | null
          decision_scenario: string | null
          diet_id: string | null
          digestao: string | null
          energia: string | null
          expires_at: string | null
          facilidade: string | null
          fome: string | null
          id: string
          observacoes: string | null
          performance: string | null
          peso_kg: number | null
          requested_at: string
          retencao: string | null
          saciedade: string | null
          sono: string | null
          status: string
          student_id: string
          trigger_source: string | null
          updated_at: string
        }
        Insert: {
          adesao?: string | null
          cintura_cm?: number | null
          completed_at?: string | null
          created_at?: string
          decision_action?: string | null
          decision_confidence?: number | null
          decision_rationale?: string | null
          decision_scenario?: string | null
          diet_id?: string | null
          digestao?: string | null
          energia?: string | null
          expires_at?: string | null
          facilidade?: string | null
          fome?: string | null
          id?: string
          observacoes?: string | null
          performance?: string | null
          peso_kg?: number | null
          requested_at?: string
          retencao?: string | null
          saciedade?: string | null
          sono?: string | null
          status?: string
          student_id: string
          trigger_source?: string | null
          updated_at?: string
        }
        Update: {
          adesao?: string | null
          cintura_cm?: number | null
          completed_at?: string | null
          created_at?: string
          decision_action?: string | null
          decision_confidence?: number | null
          decision_rationale?: string | null
          decision_scenario?: string | null
          diet_id?: string | null
          digestao?: string | null
          energia?: string | null
          expires_at?: string | null
          facilidade?: string | null
          fome?: string | null
          id?: string
          observacoes?: string | null
          performance?: string | null
          peso_kg?: number | null
          requested_at?: string
          retencao?: string | null
          saciedade?: string | null
          sono?: string | null
          status?: string
          student_id?: string
          trigger_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diet_checkins_diet_id_fkey"
            columns: ["diet_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_decision_applications: {
        Row: {
          applied_action: string
          applied_at: string
          applied_by: string | null
          checkin_id: string
          confidence: number | null
          created_at: string
          id: string
          notes: string | null
          rationale: string | null
          result_plan_id: string | null
          scenario: string
          student_id: string
          suggested_action: string
          target_plan_id: string | null
        }
        Insert: {
          applied_action: string
          applied_at?: string
          applied_by?: string | null
          checkin_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          rationale?: string | null
          result_plan_id?: string | null
          scenario: string
          student_id: string
          suggested_action: string
          target_plan_id?: string | null
        }
        Update: {
          applied_action?: string
          applied_at?: string
          applied_by?: string | null
          checkin_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          rationale?: string | null
          result_plan_id?: string | null
          scenario?: string
          student_id?: string
          suggested_action?: string
          target_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_decision_applications_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "diet_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_plan_versions: {
        Row: {
          archived_at: string | null
          conteudo: string
          created_at: string
          fase: string | null
          id: string
          plan_id: string
          source: string
          student_id: string
          titulo: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          conteudo: string
          created_at?: string
          fase?: string | null
          id?: string
          plan_id: string
          source?: string
          student_id: string
          titulo: string
          version: number
        }
        Update: {
          archived_at?: string | null
          conteudo?: string
          created_at?: string
          fase?: string | null
          id?: string
          plan_id?: string
          source?: string
          student_id?: string
          titulo?: string
          version?: number
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
      diet_renewal_analysis: {
        Row: {
          adherence_score: number | null
          applied: boolean
          applied_at: string | null
          confidence_score: number | null
          context_snapshot: Json
          created_at: string
          data_quality: string
          days_remaining: number
          decision_type: string | null
          draft_plan_id: string | null
          id: string
          meal_log_frequency: number | null
          plan_id: string
          priority: string | null
          rationale: string
          student_id: string
          suggested_action: string
          weight_trend: string | null
        }
        Insert: {
          adherence_score?: number | null
          applied?: boolean
          applied_at?: string | null
          confidence_score?: number | null
          context_snapshot?: Json
          created_at?: string
          data_quality?: string
          days_remaining: number
          decision_type?: string | null
          draft_plan_id?: string | null
          id?: string
          meal_log_frequency?: number | null
          plan_id: string
          priority?: string | null
          rationale: string
          student_id: string
          suggested_action: string
          weight_trend?: string | null
        }
        Update: {
          adherence_score?: number | null
          applied?: boolean
          applied_at?: string | null
          confidence_score?: number | null
          context_snapshot?: Json
          created_at?: string
          data_quality?: string
          days_remaining?: number
          decision_type?: string | null
          draft_plan_id?: string | null
          id?: string
          meal_log_frequency?: number | null
          plan_id?: string
          priority?: string | null
          rationale?: string
          student_id?: string
          suggested_action?: string
          weight_trend?: string | null
        }
        Relationships: []
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
      exercise_execution_videos: {
        Row: {
          admin_note: string | null
          cf_uid: string
          created_at: string
          duration_seconds: number | null
          exercise_id: string | null
          exercise_name: string
          id: string
          plan_id: string | null
          playback_url: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          student_id: string
          thumbnail_url: string | null
          updated_at: string
          workout_session_id: string | null
        }
        Insert: {
          admin_note?: string | null
          cf_uid: string
          created_at?: string
          duration_seconds?: number | null
          exercise_id?: string | null
          exercise_name: string
          id?: string
          plan_id?: string | null
          playback_url: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_id: string
          thumbnail_url?: string | null
          updated_at?: string
          workout_session_id?: string | null
        }
        Update: {
          admin_note?: string | null
          cf_uid?: string
          created_at?: string
          duration_seconds?: number | null
          exercise_id?: string | null
          exercise_name?: string
          id?: string
          plan_id?: string | null
          playback_url?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_id?: string
          thumbnail_url?: string | null
          updated_at?: string
          workout_session_id?: string | null
        }
        Relationships: []
      }
      exercise_set_logs: {
        Row: {
          created_at: string
          day_name: string | null
          exercise_name: string
          id: string
          muscle_group: string | null
          performed_at: string
          phase: string | null
          reps: number | null
          rpe: number | null
          session_id: string | null
          set_number: number
          source: string | null
          student_id: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          day_name?: string | null
          exercise_name: string
          id?: string
          muscle_group?: string | null
          performed_at?: string
          phase?: string | null
          reps?: number | null
          rpe?: number | null
          session_id?: string | null
          set_number: number
          source?: string | null
          student_id: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          day_name?: string | null
          exercise_name?: string
          id?: string
          muscle_group?: string | null
          performed_at?: string
          phase?: string | null
          reps?: number | null
          rpe?: number | null
          session_id?: string | null
          set_number?: number
          source?: string | null
          student_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      exercises: {
        Row: {
          ajustes: string[] | null
          created_at: string
          grupo_muscular: string
          id: string
          imagem_url: string | null
          nome: string
          requires_load_logging: boolean
          video_embed: string | null
        }
        Insert: {
          ajustes?: string[] | null
          created_at?: string
          grupo_muscular: string
          id?: string
          imagem_url?: string | null
          nome: string
          requires_load_logging?: boolean
          video_embed?: string | null
        }
        Update: {
          ajustes?: string[] | null
          created_at?: string
          grupo_muscular?: string
          id?: string
          imagem_url?: string | null
          nome?: string
          requires_load_logging?: boolean
          video_embed?: string | null
        }
        Relationships: []
      }
      financial_alerts: {
        Row: {
          admin_id: string
          alert_type: Database["public"]["Enums"]["financial_alert_type"]
          created_at: string
          due_date: string | null
          id: string
          message: string | null
          resolved_at: string | null
          status: string
          student_id: string
          title: string
        }
        Insert: {
          admin_id: string
          alert_type: Database["public"]["Enums"]["financial_alert_type"]
          created_at?: string
          due_date?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
          student_id: string
          title?: string
        }
        Update: {
          admin_id?: string
          alert_type?: Database["public"]["Enums"]["financial_alert_type"]
          created_at?: string
          due_date?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
          student_id?: string
          title?: string
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
      payments: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_url: string | null
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          type: Database["public"]["Enums"]["payment_type"]
          updated_at: string
        }
        Insert: {
          admin_id: string
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
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
      push_notification_log: {
        Row: {
          created_at: string
          data: Json | null
          error: string | null
          id: string
          message: string
          onesignal_id: string | null
          recipient_user_id: string | null
          sender_user_id: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          error?: string | null
          id?: string
          message: string
          onesignal_id?: string | null
          recipient_user_id?: string | null
          sender_user_id?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          error?: string | null
          id?: string
          message?: string
          onesignal_id?: string | null
          recipient_user_id?: string | null
          sender_user_id?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      push_reminder_runs: {
        Row: {
          created_at: string
          id: string
          reminder_key: string
          run_date: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reminder_key: string
          run_date?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reminder_key?: string
          run_date?: string
          user_id?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          platform: string
          player_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          platform?: string
          player_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          platform?: string
          player_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scheduled_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          id: string
          notification_type: Database["public"]["Enums"]["calendar_notification_type"]
          recipient_type: string
          recipient_user_id: string
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          id?: string
          notification_type: Database["public"]["Enums"]["calendar_notification_type"]
          recipient_type?: string
          recipient_user_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          id?: string
          notification_type?: Database["public"]["Enums"]["calendar_notification_type"]
          recipient_type?: string
          recipient_user_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      skinfolds: {
        Row: {
          abdominal: number | null
          assessment_id: string
          axilar_media: number | null
          biceps: number | null
          coxa: number | null
          id: string
          metodo: string | null
          panturrilha_medial: number | null
          peitoral: number | null
          subescapular: number | null
          suprailiaca: number | null
          triceps: number | null
        }
        Insert: {
          abdominal?: number | null
          assessment_id: string
          axilar_media?: number | null
          biceps?: number | null
          coxa?: number | null
          id?: string
          metodo?: string | null
          panturrilha_medial?: number | null
          peitoral?: number | null
          subescapular?: number | null
          suprailiaca?: number | null
          triceps?: number | null
        }
        Update: {
          abdominal?: number | null
          assessment_id?: string
          axilar_media?: number | null
          biceps?: number | null
          coxa?: number | null
          id?: string
          metodo?: string | null
          panturrilha_medial?: number | null
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
      student_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          student_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          student_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          student_id?: string
        }
        Relationships: []
      }
      student_exercise_adjustments: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          student_id: string
          updated_at: string
          valores: Json
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          student_id: string
          updated_at?: string
          valores?: Json
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          student_id?: string
          updated_at?: string
          valores?: Json
        }
        Relationships: [
          {
            foreignKeyName: "student_exercise_adjustments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      student_followups: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          last_contacted_at: string | null
          note: string | null
          snoozed_until: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          note?: string | null
          snoozed_until?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          note?: string | null
          snoozed_until?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: []
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
          low_cost: boolean
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
          low_cost?: boolean
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
          low_cost?: boolean
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
      weight_logs: {
        Row: {
          created_at: string
          data: string
          id: string
          observacao: string | null
          peso: number
          student_id: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          peso: number
          student_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          peso?: number
          student_id?: string
        }
        Relationships: []
      }
      workout_checkins: {
        Row: {
          completed_at: string | null
          created_at: string
          dores: string | null
          duracao_percebida: string | null
          energia: string | null
          exercicios_incomodo: string | null
          expires_at: string | null
          falta_tempo: boolean | null
          id: string
          intensidade_percebida: string | null
          motivacao: string | null
          observacoes: string | null
          recuperacao: string | null
          requested_at: string
          status: string
          student_id: string
          trigger_source: string | null
          updated_at: string
          workout_plan_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dores?: string | null
          duracao_percebida?: string | null
          energia?: string | null
          exercicios_incomodo?: string | null
          expires_at?: string | null
          falta_tempo?: boolean | null
          id?: string
          intensidade_percebida?: string | null
          motivacao?: string | null
          observacoes?: string | null
          recuperacao?: string | null
          requested_at?: string
          status?: string
          student_id: string
          trigger_source?: string | null
          updated_at?: string
          workout_plan_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dores?: string | null
          duracao_percebida?: string | null
          energia?: string | null
          exercicios_incomodo?: string | null
          expires_at?: string | null
          falta_tempo?: boolean | null
          id?: string
          intensidade_percebida?: string | null
          motivacao?: string | null
          observacoes?: string | null
          recuperacao?: string | null
          requested_at?: string
          status?: string
          student_id?: string
          trigger_source?: string | null
          updated_at?: string
          workout_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_checkins_workout_plan_id_fkey"
            columns: ["workout_plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plan_versions: {
        Row: {
          archived_at: string | null
          conteudo: string
          created_at: string
          fase: string | null
          generated_by: string
          id: string
          plan_id: string
          previous_version_id: string | null
          published_at: string | null
          reason_summary: string | null
          snapshot_json: Json
          status: string
          student_id: string
          titulo: string
          version_number: number
        }
        Insert: {
          archived_at?: string | null
          conteudo: string
          created_at?: string
          fase?: string | null
          generated_by?: string
          id?: string
          plan_id: string
          previous_version_id?: string | null
          published_at?: string | null
          reason_summary?: string | null
          snapshot_json?: Json
          status?: string
          student_id: string
          titulo: string
          version_number: number
        }
        Update: {
          archived_at?: string | null
          conteudo?: string
          created_at?: string
          fase?: string | null
          generated_by?: string
          id?: string
          plan_id?: string
          previous_version_id?: string | null
          published_at?: string | null
          reason_summary?: string | null
          snapshot_json?: Json
          status?: string
          student_id?: string
          titulo?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_versions_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_renewal_analysis: {
        Row: {
          adherence_score: number | null
          alternatives_considered: string[] | null
          applied: boolean
          applied_at: string | null
          avg_rpe: number | null
          completion_rate: number | null
          confidence_score: number | null
          context_snapshot: Json
          created_at: string
          data_quality: string
          days_remaining: number
          decision_type: string | null
          draft_plan_id: string | null
          fatigue_signal: string | null
          frequency_adjustment_data: Json | null
          id: string
          load_progression: string | null
          monotony_risk: string | null
          plan_id: string
          priority: string | null
          rationale: string
          registration_quality: string | null
          reps_progression: string | null
          session_frequency: number | null
          sessions_finished: number | null
          sessions_started: number | null
          student_id: string
          suggested_action: string
          summary_reason: string | null
          total_logs_count: number | null
          volume_analysis: Json | null
          volume_trend: string | null
        }
        Insert: {
          adherence_score?: number | null
          alternatives_considered?: string[] | null
          applied?: boolean
          applied_at?: string | null
          avg_rpe?: number | null
          completion_rate?: number | null
          confidence_score?: number | null
          context_snapshot?: Json
          created_at?: string
          data_quality?: string
          days_remaining: number
          decision_type?: string | null
          draft_plan_id?: string | null
          fatigue_signal?: string | null
          frequency_adjustment_data?: Json | null
          id?: string
          load_progression?: string | null
          monotony_risk?: string | null
          plan_id: string
          priority?: string | null
          rationale: string
          registration_quality?: string | null
          reps_progression?: string | null
          session_frequency?: number | null
          sessions_finished?: number | null
          sessions_started?: number | null
          student_id: string
          suggested_action: string
          summary_reason?: string | null
          total_logs_count?: number | null
          volume_analysis?: Json | null
          volume_trend?: string | null
        }
        Update: {
          adherence_score?: number | null
          alternatives_considered?: string[] | null
          applied?: boolean
          applied_at?: string | null
          avg_rpe?: number | null
          completion_rate?: number | null
          confidence_score?: number | null
          context_snapshot?: Json
          created_at?: string
          data_quality?: string
          days_remaining?: number
          decision_type?: string | null
          draft_plan_id?: string | null
          fatigue_signal?: string | null
          frequency_adjustment_data?: Json | null
          id?: string
          load_progression?: string | null
          monotony_risk?: string | null
          plan_id?: string
          priority?: string | null
          rationale?: string
          registration_quality?: string | null
          reps_progression?: string | null
          session_frequency?: number | null
          sessions_finished?: number | null
          sessions_started?: number | null
          student_id?: string
          suggested_action?: string
          summary_reason?: string | null
          total_logs_count?: number | null
          volume_analysis?: Json | null
          volume_trend?: string | null
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          avg_rpe: number | null
          calendar_event_id: string | null
          completed_at: string | null
          completed_at_real: string | null
          created_at: string
          day_name: string | null
          duration_minutes: number
          executed_by: string | null
          exercises_completed: number
          id: string
          last_active_at: string | null
          paired_student_id: string | null
          phase: string | null
          plan_id: string | null
          session_mode: string | null
          session_state: Json | null
          source: string | null
          started_at: string | null
          started_at_real: string | null
          status: string
          student_id: string
          total_exercises: number
          total_sets: number | null
          total_volume_kg: number | null
          updated_at: string
        }
        Insert: {
          avg_rpe?: number | null
          calendar_event_id?: string | null
          completed_at?: string | null
          completed_at_real?: string | null
          created_at?: string
          day_name?: string | null
          duration_minutes?: number
          executed_by?: string | null
          exercises_completed?: number
          id?: string
          last_active_at?: string | null
          paired_student_id?: string | null
          phase?: string | null
          plan_id?: string | null
          session_mode?: string | null
          session_state?: Json | null
          source?: string | null
          started_at?: string | null
          started_at_real?: string | null
          status?: string
          student_id: string
          total_exercises?: number
          total_sets?: number | null
          total_volume_kg?: number | null
          updated_at?: string
        }
        Update: {
          avg_rpe?: number | null
          calendar_event_id?: string | null
          completed_at?: string | null
          completed_at_real?: string | null
          created_at?: string
          day_name?: string | null
          duration_minutes?: number
          executed_by?: string | null
          exercises_completed?: number
          id?: string
          last_active_at?: string | null
          paired_student_id?: string | null
          phase?: string | null
          plan_id?: string | null
          session_mode?: string | null
          session_state?: Json | null
          source?: string | null
          started_at?: string | null
          started_at_real?: string | null
          status?: string
          student_id?: string
          total_exercises?: number
          total_sets?: number | null
          total_volume_kg?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_paired_student_id_fkey"
            columns: ["paired_student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
      calendar_attendance_status:
        | "pendente"
        | "confirmado"
        | "cancelado"
        | "falta"
        | "falta_justificada"
        | "presente"
        | "atrasado"
      calendar_event_status:
        | "confirmado"
        | "pendente"
        | "cancelado"
        | "reagendado"
        | "concluido"
        | "falta"
        | "falta_justificada"
      calendar_event_type:
        | "personal_presencial"
        | "aula_fixa_semanal"
        | "aula_avulsa"
        | "atendimento_ginasio"
        | "avaliacao_fisica"
        | "checkin"
        | "consultoria_online"
        | "aula_grupo"
        | "outro"
      calendar_notification_type:
        | "student_day_before"
        | "student_15min_before"
        | "admin_day_before"
        | "admin_15min_before"
        | "student_confirmed"
        | "student_cancelled"
        | "student_late"
      credit_action_type:
        | "add_credit"
        | "use_credit"
        | "refund_credit"
        | "manual_adjustment"
        | "expire_credit"
        | "package_created"
        | "class_used"
        | "class_refunded"
        | "package_expired"
        | "package_renewed"
      financial_alert_type:
        | "pagamento_vencido"
        | "pagamento_pendente"
        | "1_aula_restante"
        | "2_aulas_restantes"
        | "sem_pacote_ativo"
        | "pacote_vencido"
        | "mensalidade_vencer_3d"
        | "mensalidade_vencida"
      package_status:
        | "ativo"
        | "expirado"
        | "cancelado"
        | "renovado"
        | "pausado"
        | "esgotado"
      payment_method:
        | "mbway"
        | "transferencia"
        | "dinheiro"
        | "cartao"
        | "stripe"
        | "outro"
      payment_status:
        | "pago"
        | "pendente"
        | "vencido"
        | "parcial"
        | "cancelado"
        | "reembolsado"
      payment_type:
        | "consultoria_online"
        | "pacote_aulas"
        | "aula_avulsa"
        | "avaliacao_fisica"
        | "plano_hibrido"
        | "outro"
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
      calendar_attendance_status: [
        "pendente",
        "confirmado",
        "cancelado",
        "falta",
        "falta_justificada",
        "presente",
        "atrasado",
      ],
      calendar_event_status: [
        "confirmado",
        "pendente",
        "cancelado",
        "reagendado",
        "concluido",
        "falta",
        "falta_justificada",
      ],
      calendar_event_type: [
        "personal_presencial",
        "aula_fixa_semanal",
        "aula_avulsa",
        "atendimento_ginasio",
        "avaliacao_fisica",
        "checkin",
        "consultoria_online",
        "aula_grupo",
        "outro",
      ],
      calendar_notification_type: [
        "student_day_before",
        "student_15min_before",
        "admin_day_before",
        "admin_15min_before",
        "student_confirmed",
        "student_cancelled",
        "student_late",
      ],
      credit_action_type: [
        "add_credit",
        "use_credit",
        "refund_credit",
        "manual_adjustment",
        "expire_credit",
        "package_created",
        "class_used",
        "class_refunded",
        "package_expired",
        "package_renewed",
      ],
      financial_alert_type: [
        "pagamento_vencido",
        "pagamento_pendente",
        "1_aula_restante",
        "2_aulas_restantes",
        "sem_pacote_ativo",
        "pacote_vencido",
        "mensalidade_vencer_3d",
        "mensalidade_vencida",
      ],
      package_status: [
        "ativo",
        "expirado",
        "cancelado",
        "renovado",
        "pausado",
        "esgotado",
      ],
      payment_method: [
        "mbway",
        "transferencia",
        "dinheiro",
        "cartao",
        "stripe",
        "outro",
      ],
      payment_status: [
        "pago",
        "pendente",
        "vencido",
        "parcial",
        "cancelado",
        "reembolsado",
      ],
      payment_type: [
        "consultoria_online",
        "pacote_aulas",
        "aula_avulsa",
        "avaliacao_fisica",
        "plano_hibrido",
        "outro",
      ],
    },
  },
} as const
