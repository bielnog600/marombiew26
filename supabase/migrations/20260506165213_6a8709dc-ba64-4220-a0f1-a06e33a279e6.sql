
-- Add 'esgotado' to package_status enum
ALTER TYPE public.package_status ADD VALUE IF NOT EXISTS 'esgotado';

-- Add new columns to class_packages
ALTER TABLE public.class_packages
  ADD COLUMN IF NOT EXISTS price_per_class numeric GENERATED ALWAYS AS (
    CASE WHEN total_classes > 0 THEN total_amount / total_classes ELSE 0 END
  ) STORED,
  ADD COLUMN IF NOT EXISTS payment_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pago';

-- Add new action types to credit_action_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'package_created' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_action_type')) THEN
    ALTER TYPE public.credit_action_type ADD VALUE 'package_created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'class_used' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_action_type')) THEN
    ALTER TYPE public.credit_action_type ADD VALUE 'class_used';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'class_refunded' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_action_type')) THEN
    ALTER TYPE public.credit_action_type ADD VALUE 'class_refunded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'package_expired' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_action_type')) THEN
    ALTER TYPE public.credit_action_type ADD VALUE 'package_expired';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'package_renewed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_action_type')) THEN
    ALTER TYPE public.credit_action_type ADD VALUE 'package_renewed';
  END IF;
END$$;
