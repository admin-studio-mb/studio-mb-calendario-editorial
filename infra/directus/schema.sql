# ============================================================================
#  Studio mb · Calendario Editorial — Esquema Directus
# ----------------------------------------------------------------------------
#  Estas sentencias se ejecutan en la BBDD PostgreSQL global donde vive
#  Directus. Sirven como referencia reproducible — lo más cómodo es crear
#  las colecciones desde la UI de Directus y usar este archivo solo como
#  documentación para entornos nuevos.
#
#  Las tablas se crean automáticamente la primera vez que defines las
#  colecciones; este SQL es por si quieres recrearlas en una migración.
# ============================================================================

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  logo uuid,                                  -- FK a directus_files
  tipos_contenido_disponibles jsonb NOT NULL DEFAULT '[]'::jsonb,
  status character varying(20) DEFAULT 'published',
  date_created timestamp with time zone DEFAULT now(),
  date_updated timestamp with time zone DEFAULT now()
);

-- Publicaciones
CREATE TABLE IF NOT EXISTS publicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes(id) ON DELETE CASCADE,
  tipo_contenido text,
  formato text CHECK (formato IN ('Post','Reel','Carrusel','Story')),
  imagenes_fondo jsonb DEFAULT '[]'::jsonb,  -- o M2M a directus_files
  textos_slides text,
  copywriting text,
  hashtags jsonb DEFAULT '[]'::jsonb,
  fecha_creacion timestamp with time zone DEFAULT now(),
  fecha_publicacion timestamp with time zone,
  diseno_final uuid REFERENCES directus_files(id) ON DELETE SET NULL,
  estado text CHECK (estado IN ('Borrador','Revisión','Aprobado')) DEFAULT 'Borrador',
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
  texto text NOT NULL,
  fecha_creacion timestamp with time zone DEFAULT now(),
  status character varying(20) DEFAULT 'published',
  date_created timestamp with time zone DEFAULT now(),
  date_updated timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_publicacion
  ON comentarios(publicacion_id);
