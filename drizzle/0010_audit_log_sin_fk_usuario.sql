-- Permite el borrado real de usuarios.
--
-- audit_log es inmutable (trigger BEFORE UPDATE OR DELETE, migración 0005). Con la FK
-- `ON DELETE SET NULL`, borrar un usuario obligaba a PostgreSQL a hacer UPDATE sobre sus
-- filas de auditoría, y el trigger lo rechazaba: el DELETE fallaba.
--
-- Se quita la FK y la columna id_usuario queda como referencia histórica (el id de quien
-- actuó). El registro de actividad sigue íntegro y encadenado; solo deja de apuntar a una
-- fila que ya no existe.
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_id_usuario_usuarios_id_fk";
