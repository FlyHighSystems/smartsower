# Testes do banco (Church2all)

Confere que quem entra pelo Church2all fica separado da equipe de sempre (e de outras igrejas):

```bash
sudo -u postgres psql -q -f tests/stub.sql                      # banco descartável "sstest" com auth/storage simulados
sudo -u postgres psql -q -d sstest -f src/supabase.sql           # o script de verdade (rode 2x: é idempotente)
sudo -u postgres psql -q -d sstest -c "grant select, insert, update, delete on all tables in schema public to authenticated;"
sudo -u postgres psql -q -d sstest -f tests/church2all.sql       # cada linha "ok" é uma regra conferida
```
