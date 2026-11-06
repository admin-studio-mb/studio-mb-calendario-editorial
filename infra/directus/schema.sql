# ============================================================================
#  Studio mb · Calendario Editorial — Esquema Directus (referencia)
# ----------------------------------------------------------------------------
#  REFLECTE EL ESTADO REAL de `cms.studiomb.es` (verificado con la API).
#  Las 3 colecciones se crean desde la UI de Directus (Settings → Data Model);
#  este SQL es la referencia reproducible para entornos nuevos.
#
#  ⚠️ IMPORTANTE — zona horaria:
#  `fecha_publicacion` es `timestamp WITHOUT time zone` y SIEMPRE guarda
#  HORA DE PARED (hora local de la agencia, Europe/Madrid) en formato naive.
#  El front usa `src/lib/fecha.js` para escribir/leer (nunca `toISOString()`).
#  Ver AGENTS.md §6.8.
#
#  ⚠️ IMPORTANTE — permisos por cliente:
#  `comentarios.cliente_id` está DESNORMALIZADO a propósito: Directus 12 no
#  admite filtros relacionales en `validation` de permisos `create`, así que
#  el filtro de pertenencia se aplica sobre un campo plano. El endpoint
#  /api/comentarios lo hereda de la publicación. Ver AGENTS.md §6.10 y §6.13.
# ============================================================================

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  logo uuid,                                  -- FK a directus_files, SET NULL
  tipos_contenido_disponibles jsonb NOT NULL DEFAULT '[]'::jsonb,
  archivado boolean NOT NULL DEFAULT false,   -- archive_field de Directus
  creado_por uuid REFERENCES directus_users(id) ON DELETE NO ACTION,
  fecha_creacion timestamptz,
  actualizado_por uuid REFERENCES directus_users(id) ON DELETE NO ACTION,
  fecha_actualizacion timestamptz,
  status character varying(20) DEFAULT 'published',
  date_created timestamp with time zone DEFAULT now(),
  date_updated timestamp with time zone DEFAULT now()
);

-- Publicaciones
CREATE TABLE IF NOT EXISTS publicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  tipo_contenido text,
  formato text CHECK (formato IN ('post', 'reel', 'carrusel', 'story')),
  imagenes_fondo jsonb DEFAULT '[]'::jsonb,  -- array de URLs o de UUIDs de Directus
  textos_slides text,
  copywriting text,
  hashtags jsonb DEFAULT '[]'::jsonb,
  fecha_creacion timestamptz,
  fecha_publicacion timestamp,                -- SIN time zone → hora de pared
  diseno_final uuid REFERENCES directus_files(id) ON DELETE SET NULL,
  estado text CHECK (estado IN (
    'borrador',         -- redactado por el equipo
    'revision',         -- el cliente revisa los textos
    'en_diseno',        -- textos OK, el diseñador trabaja
    'revision_diseno',  -- el cliente revisa el diseño
    'aprobado',         -- listo para publicar
    'publicado'         -- ya subido a la red
  )) DEFAULT 'borrador',
  archivado boolean NOT NULL DEFAULT false,
  creado_por uuid REFERENCES directus_users(id) ON DELETE NO ACTION,
  actualizado_por uuid REFERENCES directus_users(id) ON DELETE NO ACTION,
  fecha_actualizacion timestamptz,
  status character varying(20) DEFAULT 'published',
  date_created timestamp with time zone DEFAULT now(),
  date_updated timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publicaciones_cliente
  ON publicaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_publicaciones_fecha
  ON publicaciones(fecha_publicacion);

-- Comentarios
CREATE TABLE IF NOT EXISTS comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publicacion_id uuid NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES directus_users(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,  -- desnormalizado (ver cabecera)
  texto text NOT NULL,
  fecha_creacion timestamptz,
  archivado boolean NOT NULL DEFAULT false,
  creado_por uuid REFERENCES directus_users(id) ON DELETE NO ACTION,
  actualizado_por uuid REFERENCES directus_users(id) ON DELETE NO ACTION,
  fecha_actualizacion timestamptz,
  status character varying(20) DEFAULT 'published',
  date_created timestamp with time zone DEFAULT now(),
  date_updated timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_publicacion
  ON comentarios(publicacion_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_cliente
  ON comentarios(cliente_id);

-- Usuarios de Directus: cada usuario puede pertenecer a un cliente.
-- Es lo que permite el filtro `cliente_id = $CURRENT_USER.cliente_id`.
ALTER TABLE directus_users
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL;
