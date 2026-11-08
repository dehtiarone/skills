---
type: regex
target: {"source": "file", "path": "db/schema.sql"}
pattern: 'CREATE INDEX idx_users_tenant_email ON users ?\(tenant_id, ?email\)'
---
