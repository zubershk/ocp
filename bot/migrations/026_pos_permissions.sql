-- ============================================================
-- 026_pos_permissions.sql — PR 5 hardening (6/6)
--
-- POS permission coverage: every POS route is guarded by a
-- pos.* permission (see main.go), and each system role holds
-- exactly the grants in services.POSRoleGrants:
--
--   owner    full access (all pos.*)
--   manager  operational access (all pos.*)
--   cashier  create / update / pay (no refund, discount, tables)
--   kitchen  read-only (no payment, no refund)
--   viewer   read-only
--
-- Granted per organization so new tenants inherit the same
-- boundary. IDEMPOTENT and safe to run repeatedly.
-- ============================================================

INSERT INTO permissions (key, description) VALUES
  ('pos.read', 'View POS menu, orders, tables, discounts, prices'),
  ('pos.create_order', 'Create POS draft orders'),
  ('pos.update_order', 'Update, hold, resume, complete, cancel POS orders'),
  ('pos.apply_discount', 'Apply or remove POS discounts'),
  ('pos.take_payment', 'Record POS payments'),
  ('pos.refund', 'Record POS refunds'),
  ('pos.manage_tables', 'Assign and manage POS tables')
ON CONFLICT (key) DO NOTHING;

-- owner + manager: full POS access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key LIKE 'pos.%'
WHERE r.is_system AND r.name IN ('owner', 'manager')
ON CONFLICT DO NOTHING;

-- cashier: create / update / pay only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('pos.read', 'pos.create_order', 'pos.update_order', 'pos.take_payment')
WHERE r.is_system AND r.name = 'cashier'
ON CONFLICT DO NOTHING;

-- kitchen: read-only (no payment, no refund)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('pos.read')
WHERE r.is_system AND r.name = 'kitchen'
ON CONFLICT DO NOTHING;

-- viewer: read-only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN ('pos.read')
WHERE r.is_system AND r.name = 'viewer'
ON CONFLICT DO NOTHING;
