-- Change fin_daily_control.worked from boolean to numeric value
-- "trabalhado no dia" is now a monetary value, not a yes/no checkbox

ALTER TABLE fin_daily_control DROP COLUMN IF EXISTS worked;
ALTER TABLE fin_daily_control ADD COLUMN worked_amount numeric(12,2) NOT NULL DEFAULT 0;
