-- Add employee_id to fin_cash_closing so each employee has their own cash closing
ALTER TABLE fin_cash_closing ADD COLUMN employee_id uuid REFERENCES fin_employees(id) ON DELETE SET NULL;
CREATE INDEX idx_fin_cash_closing_employee ON fin_cash_closing(employee_id);
