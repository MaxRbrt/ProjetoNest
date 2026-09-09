-- ---------------------------------------------
-- Papéis que o Supabase cria sozinho
-- A migration EnableRls faz REVOKE ... FROM anon, authenticated. Esses dois
-- papéis existem por padrão em qualquer projeto Supabase, mas não num
-- Postgres limpo: sem criá-los aqui, a migration quebra com "role anon does
-- not exist" e a suíte de integração nunca chega a rodar.
--
-- Criar os papéis em vez de tornar a migration tolerante é deliberado: assim
-- o teste de integração executa exatamente a mesma migration que roda em
-- produção, incluindo o RLS, em vez de um caminho alternativo que só existe
-- no teste e esconderia um erro real de migration.
-- ---------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
