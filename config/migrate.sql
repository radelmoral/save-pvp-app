-- ═══════════════════════════════════════════════════════════════════
--  SAVE PVP — Migración MÍNIMA sobre tu BBDD existente `Repuestos`
--
--  ✅ NO toca ninguna tabla existente (repuestos, usuarios, etc.)
--  ✅ Solo añade la tabla `solicitudes_pvp` que necesita la app
--
--  Ejecutar:
--    mysql -u tu_usuario -p Repuestos < app/config/migrate.sql
-- ═══════════════════════════════════════════════════════════════════

USE `Repuestos`;

-- ── Tabla solicitudes_pvp ───────────────────────────────────────────
--  Guarda las solicitudes de PVP enviadas por Carrefour/ECI
--  y las aprobaciones/rechazos del Admin.

CREATE TABLE IF NOT EXISTS `solicitudes_pvp` (
  `id`                  INT          NOT NULL AUTO_INCREMENT,
  `referencia`          VARCHAR(100) NOT NULL,
  `descripcion`         VARCHAR(255) DEFAULT NULL,
  `categoria`           VARCHAR(100) DEFAULT NULL,
  `coste`               DECIMAL(10,2) NOT NULL,
  `proveedor`           VARCHAR(100) DEFAULT NULL,
  `observaciones`       TEXT         DEFAULT NULL,
  `usuario_id`          INT          NOT NULL,
  `estado`              ENUM('pendiente','aprobado','rechazado') NOT NULL DEFAULT 'pendiente',
  `pvp_asignado`        DECIMAL(10,2) DEFAULT NULL,
  `pvp_club_asignado`   DECIMAL(10,2) DEFAULT NULL,
  `motivo_rechazo`      TEXT         DEFAULT NULL,
  `admin_id`            INT          DEFAULT NULL,
  `created_at`          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_usuario`  (`usuario_id`),
  KEY `idx_estado`   (`estado`),
  KEY `idx_referencia` (`referencia`),
  CONSTRAINT `fk_sol_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id_usuario`),
  CONSTRAINT `fk_sol_admin`   FOREIGN KEY (`admin_id`)   REFERENCES `usuarios` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
