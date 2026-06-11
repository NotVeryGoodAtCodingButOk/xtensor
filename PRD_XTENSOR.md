# PRD — Sistema de Seguimiento de Producción de Fábrica

**Versión:** 1.0 (MVP)
**Idioma del producto:** Español (exclusivamente)
**Hosting:** Vercel
**Base de datos / Auth / Realtime:** Supabase
**Stack sugerido:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Supabase JS SDK

---

## 1. Resumen ejecutivo

Se construirá una aplicación web que reemplaza el actual flujo manual en Excel ("Plan de Producción") usado para coordinar la fabricación de máquinas de gimnasio en la planta. La aplicación tiene tres superficies independientes:

1. **Tablero de operarios (iPad de la fábrica).** Pantalla optimizada para tocar, donde los nueve operarios actualizan el avance de las máquinas que están construyendo. Se desbloquea una sola vez por la mañana con una contraseña de planta y queda disponible para todos los operarios durante el día.
2. **Panel de administración.** Pantalla web tradicional, accesible para Santiago, Nelly, Gina y Ana María. Replica visualmente la planilla "Plan de Producción" del Excel actual y permite crear órdenes, modificar catálogos, marcar máquinas como despachadas y ajustar parámetros (costo hora, factor de mano de obra, festivos, etc.).
3. **Portal del cliente.** Página de solo lectura accesible mediante un enlace único por cliente. Muestra todas las máquinas que el cliente tiene en producción, su avance, la fecha estimada de entrega (con buffer) y la información clave de cada máquina.

Toda la app funciona en **tiempo real** (cambios de un operario aparecen al instante en el panel de Santiago y en el portal del cliente).

---

## 2. Alcance del MVP

### Dentro del alcance

- Tablero de operarios para registrar avances de máquinas en sus 7 etapas, con avances parciales (0/25/50/75/100 %).
- Panel administrativo con vista tipo "Plan de Producción" replicando la planilla actual del Excel.
- Creación y edición manual de máquinas (cada SEÑAL = una fila).
- Catálogo de equipos importable y editable (con búsqueda y soporte para productos personalizados).
- Catálogo de colores administrable.
- Lista de operarios con su rol y costo hora.
- Calendario laboral con festivos colombianos auto-cargados (con override manual).
- Cálculo automático de horas estimadas, horas faltantes, días-hombre faltantes, acumulado de horas, y fecha estimada de entrega, replicando exactamente las fórmulas del Excel.
- Vista de "Despachados" (histórico) cuando un administrador marca una máquina como enviada.
- Portal de cliente por enlace único, con buffer de 3 días sobre la fecha estimada.
- Migración inicial de los datos actuales (la importación se hará posteriormente con Claude Code).

### Fuera del alcance (explícito)

- **Hoja "Previos"** del Excel.
- Sub-componentes (Torno A., Torno E., Láser, Carenaje, Señales, Tubos, Inox., Pintu., Zinc, Tornillos, Rodam., Cojines): no se trasladan al MVP.
- Login individual por operario, PIN, biometría, QR.
- Tiempo de inicio y fin por tarea (cronometraje real). Queda como mejora futura.
- Reportes de productividad por trabajador.
- Métricas analíticas por código de equipo.
- Alertas automáticas de retraso.
- Exportar a Excel desde la app.
- Inventario de materiales, facturación, logística de envío.
- Mensajería bidireccional con el cliente, fotos, archivos adjuntos.
- App móvil nativa (no se necesita ahora ni en el futuro previsible).
- Multi-idioma (solo español).
- Despacho parcial dentro del sistema (los administradores marcan la máquina como despachada manualmente después de hacerlo).

---

## 3. Glosario

| Término | Significado |
| --- | --- |
| **SEÑAL** | Identificador único por máquina (no por orden). Una misma compra de un cliente puede tener varias SEÑALES, una por cada máquina. |
| **Etapa** | Una de las 7 fases de producción: Material, Armar, Resoldar, Pulir, Pintar, Ensamblar, Empacar. |
| **Avance** | Porcentaje de avance total de una máquina (0–100 %), derivado de la combinación ponderada de las etapas. |
| **Operario** | Empleado de planta que ejecuta tareas. Hoy son nueve. |
| **Administrador** | Santiago, Nelly, Gina o Ana María. Tienen acceso completo al panel administrativo. |
| **Gerente de planta** | Persona que desbloquea el iPad por la mañana con la contraseña de planta. Puede ser cualquiera de los administradores. |
| **Cliente** | Persona o empresa que compra máquinas. Accede solo a su propio portal por enlace único. |
| **Catálogo** | Listado de productos disponibles, importado de la hoja "Precios y Materiales" del Excel. |
| **Factor de mano de obra** | Constante (por defecto 0,3) que se multiplica por el precio de venta para calcular las horas estimadas. |
| **Costo hora operario** | Costo promedio por hora trabajada en planta (por defecto 22.019,57 COP, derivado de "Mano de Obra"). |

---

## 4. Arquitectura técnica

### 4.1 Stack

- **Frontend / Backend:** Next.js 15 con App Router, desplegado en Vercel. Todas las rutas pueden ser Server Components con acceso directo a Supabase salvo donde se necesite interactividad cliente (formularios, taps en el iPad).
- **UI:** Tailwind CSS + shadcn/ui (Radix + Tailwind), tipografía limpia y botones grandes (≥ 60 px de alto) para el tablero del iPad.
- **Base de datos:** Supabase (PostgreSQL gestionado).
- **Autenticación:** Supabase Auth para los administradores (correo + contraseña). El acceso al iPad se controla con una contraseña de planta almacenada en `settings` (hash bcrypt). Los clientes acceden mediante un token de URL que mapea a su registro.
- **Tiempo real:** Supabase Realtime (canales de Postgres) suscrito a las tablas `machines`, `machine_stages` y `stage_logs`.
- **Almacenamiento de archivos:** no se requiere en el MVP.

### 4.2 Surfaces y rutas

| Surface | Ruta base | Acceso |
| --- | --- | --- |
| Tablero operarios | `/planta` | Bloqueado tras contraseña de planta |
| Panel administrativo | `/admin/*` | Supabase Auth (email + password) |
| Portal cliente | `/c/[token]` | Token público, solo lectura |
| Página pública / landing | `/` | Redirige a `/admin/login` si no hay sesión |

---

## 5. Roles, autenticación y permisos

### 5.1 Roles

1. **Gerente de planta** — pseudo-rol; cualquiera que tenga la contraseña del iPad. No tiene cuenta personal asociada. Su único privilegio es desbloquear el tablero de operarios.
2. **Operario** — registro en la tabla `workers`. No tiene credenciales. Su "sesión" empieza cuando toca su nombre en la pantalla de selección y termina cuando vuelve a la pantalla de selección.
3. **Administrador** — usuario en Supabase Auth, con un campo `role = 'admin'` en `profiles`. Inicialmente: Santiago, Nelly, Gina y Ana María. Acceso completo al panel administrativo.
4. **Cliente** — registro en la tabla `clients` con un `magic_link_token` único. No tiene contraseña. Solo accede al portal cliente por enlace.

### 5.2 Reglas de permisos

| Acción | Operario | Admin | Cliente |
| --- | --- | --- | --- |
| Ver lista de máquinas en producción | ✓ (todas) | ✓ (todas) | ✓ (solo las suyas) |
| Avanzar / retroceder etapa de una máquina | ✓ | ✓ | ✗ |
| Crear / editar máquinas | ✗ | ✓ | ✗ |
| Editar catálogo de equipos | ✗ | ✓ | ✗ |
| Editar lista de colores | ✗ | ✓ | ✗ |
| Editar operarios | ✗ | ✓ | ✗ |
| Marcar como despachada | ✗ | ✓ | ✗ |
| Editar parámetros (factor, costo hora, festivos) | ✗ | ✓ | ✗ |
| Ver costos / horas estimadas | ✗ (no se muestran en el tablero) | ✓ | ✗ |
| Ver fecha estimada de entrega | ✗ | ✓ (real) | ✓ (con buffer de 3 días) |

### 5.3 Política de Row Level Security (Supabase)

- Las tablas administrativas (`machines`, `machine_stages`, `equipment_catalog`, `clients`, `workers`, `colors`, `settings`, `holidays`, `stage_logs`) tienen RLS habilitado.
- Solo usuarios con `auth.jwt() ->> 'role' = 'admin'` pueden hacer SELECT, INSERT, UPDATE, DELETE.
- El acceso del iPad y del cliente se hace mediante **route handlers** en Next.js que validan la contraseña de planta o el token de cliente, y luego usan la **service role key** de Supabase para hacer las queries necesarias (con validación de scope en código).
- El service role key nunca llega al navegador del cliente; queda en el servidor de Vercel.

---

## 6. Modelo de datos

### 6.1 Tablas

```sql
-- Catálogo de productos importado de "Precios y Materiales"
create table equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                      -- p.ej. XM161
  name text not null,                             -- "Rack Sentadilla"
  line text,                                      -- "musculación", "bioparques", etc.
  default_price_cop numeric,                      -- precio antes de IVA, puede ser null
  is_custom boolean default false,                -- true si fue creado al vuelo como "Proyecto Especial"
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table colors (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,                      -- "AZUL OSCURO", "MORADO NEGRO"...
  created_at timestamptz default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,                      -- "JHON - NICOLAS", "PETRA proyectos..."
  magic_link_token text unique not null default encode(gen_random_bytes(24), 'base64url'),
  created_at timestamptz default now()
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,                        -- "Juan Felipe Martinez Aristizabal"
  role text not null,                             -- "Armador", "Tornero", "Pintor", etc.
  hourly_cost_cop numeric,                        -- costo hora individual (de "Mano de Obra")
  is_active boolean default true,
  display_color text,                             -- HEX para diferenciar visualmente en el iPad
  created_at timestamptz default now()
);

-- Cada fila = una máquina (= una SEÑAL) en producción
create table machines (
  id uuid primary key default gen_random_uuid(),
  senal_number integer not null,                   -- 977, 988, 999, etc.
  client_id uuid not null references clients(id),
  equipment_id uuid references equipment_catalog(id), -- nullable solo si is_custom_overflow
  custom_equipment_name text,                     -- usado si equipment_id es null
  color_id uuid references colors(id),
  city text,                                      -- "Pereira", "Manizales"... texto libre
  line_override text,                             -- normalmente igual a equipment_catalog.line
  sale_price_cop numeric not null,                -- "VENTA Antes de IVA" — puede sobreescribir el catálogo
  assigned_to text,                               -- "Quien" — texto libre
  promised_date date not null,                    -- "Ofrecido"
  order_position integer not null,                -- posición en la cola, define el orden de cálculo acumulado
  status text not null default 'in_production',   -- 'in_production' | 'shipped'
  shipped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Etapas son una tabla de lookup fija
create table stages (
  id smallint primary key,                        -- 1..7
  name text not null,                             -- "Material", "Armar", "Resoldar"...
  completion_percentage smallint not null,        -- 20, 40, 50, 70, 80, 90, 100
  display_order smallint not null
);
-- Seed:
-- (1, 'Material',   20, 1)
-- (2, 'Armar',      40, 2)
-- (3, 'Resoldar',   50, 3)
-- (4, 'Pulir',      70, 4)
-- (5, 'Pintar',     80, 5)
-- (6, 'Ensamblar',  90, 6)
-- (7, 'Empacar',   100, 7)

-- Progreso de cada etapa de cada máquina
create table machine_stages (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  stage_id smallint not null references stages(id),
  completion smallint not null default 0,         -- 0, 25, 50, 75, 100
  last_worker_id uuid references workers(id),
  last_updated_at timestamptz,
  unique(machine_id, stage_id)
);

-- Bitácora de cada cambio — fuente de verdad para deshacer
create table stage_logs (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  stage_id smallint not null references stages(id),
  worker_id uuid not null references workers(id),
  previous_completion smallint not null,
  new_completion smallint not null,
  is_undone boolean default false,
  created_at timestamptz default now()
);

-- Festivos auto-cargados (Colombia) + manuales
create table holidays (
  date date primary key,
  name text not null,
  is_custom boolean default false                 -- false si vino del feed nacional, true si lo agregó admin
);

-- Configuración global — tabla con una sola fila (id = 1)
create table settings (
  id smallint primary key default 1,
  factory_password_hash text not null,            -- bcrypt
  hourly_cost_per_worker_cop numeric not null default 22019.57,
  labor_factor numeric not null default 0.3,
  daily_hours_mon_fri numeric not null default 9,
  daily_hours_sat numeric not null default 6,
  daily_hours_sun numeric not null default 0,
  active_workers_count smallint not null default 9,
  client_buffer_days smallint not null default 3,
  updated_at timestamptz default now(),
  check (id = 1)
);

-- Perfiles de admin enlazados a auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'admin'              -- por ahora solo 'admin'
);
```

### 6.2 Índices recomendados

```sql
create index on machines (status, order_position);
create index on machines (client_id);
create index on machine_stages (machine_id);
create index on stage_logs (worker_id, created_at desc);
create index on stage_logs (machine_id, created_at desc);
```

### 6.3 Realtime

Habilitar la publicación `supabase_realtime` para:
- `machines`
- `machine_stages`
- `stage_logs`

Esto permite que el panel de Santiago y el portal del cliente reciban cambios al instante cuando un operario toca una etapa.

---

## 7. Pantallas y experiencia de usuario

### 7.1 Pantalla de bloqueo del iPad (`/planta`)

**Cuándo aparece:** al abrir la app en el iPad por primera vez en el día, o tras cerrar sesión de planta manualmente.

**Elementos:**
- Logo de la fábrica centrado.
- Un único campo de contraseña grande.
- Botón **"Desbloquear tablero"** ancho, alto.
- Mensaje de error simple si la contraseña es incorrecta.

**Comportamiento:**
- La contraseña se valida contra `settings.factory_password_hash`.
- Al validar, se guarda un cookie HTTP-only de larga duración (24 h) que mantiene el iPad desbloqueado.
- Tras 24 h o tras un botón discreto "Bloquear" disponible en la esquina del tablero, la cookie expira.

### 7.2 Selección de operario (`/planta/operarios`)

**Cuándo aparece:** después de desbloquear, y cada vez que un operario termina de registrar lo suyo y vuelve atrás.

**Elementos:**
- Título: "¿Quién eres?"
- Cuadrícula con los **9 operarios** representados como tarjetas grandes (tipo botón cuadrado de ~200×200 px) con:
  - El nombre completo del operario.
  - El rol debajo (Armador, Pintor, etc.).
  - Color de fondo distintivo (`display_color`) para reconocimiento rápido.
- Sin búsqueda. Sin filtros. Una sola pantalla, todo a la vista.

**Comportamiento:**
- Tocar una tarjeta lleva directamente a la lista de máquinas con el operario activo en la sesión (guardado en cookie de sesión que dura mientras el operario navegue dentro del tablero).
- Botón discreto "Bloquear tablero" en una esquina (para fin de jornada).

### 7.3 Lista de máquinas para el operario (`/planta/maquinas`)

**Elementos:**
- En la parte superior, una franja con el nombre del operario activo y un botón **"Cambiar de operario"** (vuelve a 7.2).
- Lista vertical de todas las máquinas con `status = 'in_production'`, ordenadas por `order_position`.
- Cada fila muestra:
  - **SEÑAL** y **código del equipo** (p.ej. `#977 · XM165`).
  - **Nombre del equipo** (p.ej. "Sentadilla Búlgara").
  - **Cliente** y **color**.
  - **Avance total** como una barra de progreso (0–100 %).
  - Una fila compacta con los **7 íconos de etapa**, cada uno con un check, una fracción (¼, ½, ¾) o vacío según `completion`.
- Búsqueda rápida por SEÑAL o por nombre en la parte superior (opcional).
- Filtro de "Mostrar solo en curso" / "Mostrar todas" (opcional).

**Comportamiento:**
- Las máquinas con avance total = 100 % siguen visibles hasta que un administrador las marque como despachadas.
- Toda actualización de otro operario aparece en vivo (subscripción Realtime).

### 7.4 Detalle de máquina y etapas (`/planta/maquinas/[id]`)

**Elementos:**
- Encabezado con: SEÑAL, código, nombre del equipo, cliente, ciudad, color, fecha prometida y avance total.
- 7 tarjetas grandes apiladas verticalmente, una por etapa, en el orden Material → Empacar. Cada tarjeta muestra:
  - Nombre de la etapa.
  - Estado actual de avance como una barra segmentada en 4 partes (25/50/75/100).
  - Quién hizo el último cambio y a qué hora (nombre + "hace 12 min").
- Tocar una tarjeta abre un mini-modal con cinco botones grandes: **0 %, 25 %, 50 %, 75 %, 100 %**. Al tocar uno, el modal se cierra inmediatamente y la barra de la etapa se actualiza al instante.
- En la parte inferior, un botón **"Volver a la lista"**.

**Comportamiento:**
- Cualquier cambio queda registrado en `stage_logs` con `worker_id = sesión actual`, `previous_completion` y `new_completion`.
- Se actualiza `machine_stages.last_worker_id`, `machine_stages.last_updated_at` y `machine_stages.completion`.
- El avance total de la máquina se recalcula automáticamente (ver Sección 8.2) y se refleja en todas las pantallas conectadas vía Realtime.

### 7.5 Mecanismo de deshacer (siempre visible para el operario activo)

El operario puede equivocarse fácilmente y necesita corregir sin fricción. Se implementa con dos niveles:

**Nivel 1 — Snackbar de deshacer inmediato.**
- Tras cualquier toque que cambie una etapa, aparece en la parte inferior de la pantalla una franja oscura con texto: *"Pulir → 75 % en XM165. Deshacer (30 s)"*.
- Tiene un único botón **Deshacer**.
- Permanece visible 30 segundos o hasta que el operario haga otra acción (en cuyo caso es reemplazada por la franja de la nueva acción).
- Al tocar Deshacer, el `stage_logs` correspondiente se marca con `is_undone = true` y el `machine_stages` vuelve al `previous_completion`.

**Nivel 2 — "Mis últimas acciones".**
- En la cabecera de cualquier pantalla del operario aparece un botón pequeño con el ícono ⟲ y un contador: **"Mis acciones (3)"**.
- Al tocarlo, se despliega un panel con las **últimas 10 acciones del operario en su sesión actual**, en orden cronológico inverso. Cada item muestra:
  - Etapa + máquina (p.ej. "Pulir en XM165").
  - Cambio (p.ej. "50 % → 75 %").
  - Hora relativa.
  - Botón **"Deshacer"** al lado, deshabilitado si la acción ya fue revertida o si una acción posterior sobre la misma etapa la deja sin efecto.

Ambos mecanismos son independientes: el snackbar es para el caso del 95 % (acabo de tocar mal), el panel es para los olvidos.

### 7.6 Login administrativo (`/admin/login`)

- Pantalla estándar con email + contraseña.
- Supabase Auth.
- Tras login exitoso, redirige a `/admin` (el dashboard principal).

### 7.7 Dashboard administrativo (`/admin` — la pantalla principal)

Esta es la pantalla más importante del panel administrativo y debe **replicar la vista de "Plan de Producción"** del Excel para que Santiago pueda trabajar al primer vistazo.

**Estructura:**
- Una sola tabla densa, con scroll horizontal si hace falta. Filas zebra. Hover destaca la fila.
- **Columnas**, de izquierda a derecha:
  1. `↕` (handle de arrastre para reordenar la cola de producción)
  2. **Avance %** (calculado, con barra de progreso compacta)
  3. **SEÑAL**
  4. **Cliente**
  5. **Cód. equipo**
  6. **Equipo** (nombre)
  7. **Color**
  8. **Ciudad**
  9. **Línea**
  10. **Venta antes de IVA** (formato moneda COP)
  11. **Horas totales** (calculado)
  12. **Horas faltantes** (calculado)
  13. **Días-hombre faltantes** (calculado)
  14. **Acumulado** (calculado, horas acumuladas hasta esta máquina)
  15. **Quién** (responsable, texto libre)
  16. **Ofrecido** (fecha prometida)
  17. **Estimado** (fecha estimada de entrega, calculada)
  18. **7 celdas de etapas**, una por cada una (Material → Empacar), con:
       - Una `X` o nombre/emoji si la etapa está incompleta.
       - Color verde si la etapa está al 100 %.
       - Color amarillo/naranja si está parcial (25/50/75 %).
       - Tooltip con el último operario y la hora del último cambio.
  19. **Acciones** (ícono de tres puntos: Editar, Marcar despachada, Eliminar).

**Comportamiento:**
- Cada fila es clickeable y abre el detalle de la máquina (modal o pantalla aparte) con todo editable.
- Reordenar filas (drag-and-drop) actualiza `order_position` de las máquinas y recalcula el acumulado y las fechas estimadas de todas las filas afectadas, en vivo.
- La tabla se suscribe a Realtime: cualquier actualización hecha por un operario actualiza la fila en vivo (avance total, etapas, "última actualización").
- Filtros y búsqueda en la cabecera: por cliente, por ciudad, por línea, por estado (en producción / despachada).
- Botón prominente **"Agregar máquina"** arriba a la derecha.

**Resaltados visuales (cuando aporten claridad sin meter alertas):**
- Si la fecha estimada > fecha prometida → la celda "Estimado" se pinta de rojo claro.
- Si el avance es 100 % y aún está `in_production` → fondo azul claro (lista para despachar).

### 7.8 Crear / editar máquina (`/admin/maquinas/nueva`, `/admin/maquinas/[id]`)

Formulario modal o pantalla con los siguientes campos:

- **SEÑAL** (numérico, requerido, único)
- **Cliente** (combo con búsqueda; si no existe, opción "+ Crear cliente nuevo")
- **Equipo** (combo con búsqueda por código o nombre sobre `equipment_catalog`; al final del listado, opción "+ Crear producto personalizado")
  - Si se elige existente: se pre-llenan `default_price_cop`, `line`.
  - Si se elige personalizado: se solicita nombre del equipo (queda como `custom_equipment_name`), precio, línea.
- **Color** (combo desplegable sobre `colors`; admin puede gestionar la lista desde otra pantalla)
- **Ciudad** (texto libre)
- **Venta antes de IVA** (numérico, COP; pre-llena con el catálogo pero editable)
- **Quién** (texto libre; quién es el responsable comercial o de seguimiento)
- **Fecha prometida** (date picker)
- **Posición en la cola** (numérico; opcional, por defecto al final)

Al guardar, se crean automáticamente las 7 filas en `machine_stages` con `completion = 0`.

### 7.9 Catálogo de equipos (`/admin/catalogo`)

- Tabla con: código, nombre, línea, precio, activo, acciones.
- Búsqueda y filtros.
- Botón "Agregar equipo".
- Modal de edición.
- Soft-delete con `is_active = false` (no se elimina para no romper máquinas históricas).

### 7.10 Colores (`/admin/colores`)

- Lista plana con nombre del color.
- Agregar / renombrar / eliminar.
- No se permite eliminar un color asociado a máquinas activas.

### 7.11 Operarios (`/admin/operarios`)

- Tabla con: nombre, rol, costo hora, color de visualización, activo, acciones.
- Crear / editar / desactivar.

### 7.12 Despachados (`/admin/despachados`)

- Misma tabla que el dashboard principal pero filtrada por `status = 'shipped'` y ordenada por `shipped_at` descendente.
- Solo lectura desde aquí; si hay que corregir algo, abrir la máquina y desmarcarla como despachada (vuelve a `in_production`).

### 7.13 Clientes y enlaces (`/admin/clientes`)

- Tabla con: nombre del cliente, número de máquinas en producción, número de máquinas despachadas, último enlace generado, fecha de creación.
- Acciones por cliente:
  - **Copiar enlace** (al portapapeles).
  - **Regenerar enlace** (invalida el anterior).
  - **Renombrar**.
  - **Combinar con otro cliente** (mover todas sus máquinas a otro registro de cliente).

### 7.14 Configuración (`/admin/configuracion`)

Una sola pantalla con varias secciones:

- **Económicos:** `hourly_cost_per_worker_cop` (editable), `labor_factor` (editable).
- **Capacidad de planta:** `active_workers_count` (editable), `daily_hours_mon_fri`, `daily_hours_sat`, `daily_hours_sun`.
- **Cliente:** `client_buffer_days` (editable, por defecto 3).
- **Seguridad:** botón **"Cambiar contraseña de planta"** (input + confirmación; recalcula el hash).
- **Festivos:** lista de festivos del año actual con su origen (`auto` o `manual`). Botón para agregar uno personalizado, botón para recargar festivos colombianos (idempotente).

Cambiar `hourly_cost_per_worker_cop`, `labor_factor` o `active_workers_count` recalcula automáticamente las horas estimadas y las fechas estimadas de todas las máquinas en producción.

### 7.15 Portal del cliente (`/c/[token]`)

**Acceso:** sin login, solo el enlace.

**Estructura:**
- Encabezado: nombre del cliente ("Hola, PETRA proyectos y construcciones").
- Subtítulo: total de máquinas en producción.
- Lista de máquinas (en producción y despachadas en los últimos 60 días) como tarjetas, cada una con:
  - **Código + nombre del equipo** (p.ej. *XB449 — Halón de espalda con discos*).
  - **Color**.
  - **Ciudad de destino**.
  - **Barra de avance** grande (0–100 %).
  - **Checklist visual** de las 7 etapas: cada etapa es un ícono o badge con su nombre; etapas completas en verde, parciales en amarillo, pendientes en gris.
  - **Fecha estimada de entrega**, calculada como `fecha estimada interna + 3 días`. Si la máquina ya fue despachada: muestra "Despachada el [fecha]".
- **Sin** información de precios, horas, costos, ni datos internos.
- Página totalmente responsive (cliente puede entrar desde su celular).
- Tiempo real: si un operario avanza una etapa mientras el cliente tiene la página abierta, se actualiza en vivo.

---

## 8. Lógica de negocio y fórmulas

Todas estas fórmulas replican el comportamiento de la planilla "Plan de Producción" del Excel. Si el comportamiento del Excel difiere de la descripción literal, **prevalece el Excel**: durante la implementación, contrastar los valores producidos por la app contra los del Excel en al menos 20 filas representativas.

### 8.1 Horas totales estimadas por máquina

```
horas_totales = (sale_price_cop * labor_factor) / hourly_cost_per_worker_cop
```

Con los valores por defecto (`labor_factor = 0.3`, `hourly_cost = 22019.57`):
- Una máquina de COP 1.990.000 → `(1.990.000 × 0,3) / 22.019,57 ≈ 27,11` horas.
- Una máquina de COP 4.000.000 → `(4.000.000 × 0,3) / 22.019,57 ≈ 54,50` horas.

### 8.2 Avance % de la máquina

```
avance_pct = sum_por_etapa( etapa.completion_percentage * (machine_stages.completion / 100) ) / 700
```

Donde 700 es la suma de las 7 ponderaciones (20+40+50+70+80+90+100 = 450 — **corregir según comportamiento real del Excel; ver nota a Claude Code**).

> **Nota crítica para la implementación.** La interpretación del Excel sobre la ponderación de etapas debe verificarse contra los valores reales: en el Excel, "Avance %" para una máquina con todas las etapas marcadas con `x` (completas) es 1.0 (100 %). El sistema debe producir exactamente el mismo número que aparece en la columna "Avance %" del Excel para cada fila. Si la fórmula anterior no coincide, ajustar el algoritmo (puede ser un simple promedio simple sobre la última etapa alcanzada con marca `x`).

### 8.3 Horas faltantes por máquina

```
horas_faltantes = horas_totales * (1 - avance_pct)
```

### 8.4 Días-hombre faltantes por máquina

```
dias_hombre_faltantes = horas_faltantes / (active_workers_count * daily_hours_mon_fri)
```

(Con los defaults: `9 trabajadores × 9 horas = 81 horas/día`.)

> **Nota.** Verificar con el Excel cuál es exactamente el divisor; en algunas filas parece ser un valor diferente. La regla de oro: la app debe producir el mismo número que el Excel.

### 8.5 Acumulado de horas

Para cada máquina, ordenando por `order_position` ascendente:

```
acumulado(n) = horas_faltantes(n) + acumulado(n - 1)
acumulado(1) = horas_faltantes(1)
```

### 8.6 Fecha estimada de entrega

Algoritmo:

1. Partir del día actual.
2. Crear el calendario laboral de los próximos N días (suficiente, p.ej. 180):
   - Lunes–viernes: `daily_hours_mon_fri` por trabajador (= 9).
   - Sábado: `daily_hours_sat` (= 6).
   - Domingos: 0.
   - Festivos (de la tabla `holidays`): 0.
3. Multiplicar las horas diarias por persona por `active_workers_count` para obtener la **capacidad de planta** de cada día.
4. Avanzar día por día consumiendo `acumulado(n)` horas hasta agotarlo. El día en que se agote es la **fecha estimada de entrega**.

Es importante notar que este modelo trata a toda la planta como un único recurso paralelo. No diferencia por rol del operario. Esto coincide con el modelo actual del Excel.

### 8.7 Fecha mostrada al cliente

```
fecha_cliente = fecha_estimada_interna + client_buffer_days
```

Por defecto, `client_buffer_days = 3`. Configurable por administrador.

### 8.8 Recalculo automático

Toda actualización que afecte estos valores debe disparar un recalculo automático de todas las máquinas en producción:

- Cambio de `sale_price_cop`, `order_position`, o `status` de una máquina.
- Cambio de `completion` de una etapa.
- Cambio de `hourly_cost_per_worker_cop`, `labor_factor`, `active_workers_count`, `daily_hours_*`, o `client_buffer_days` en `settings`.
- Agregar / quitar un festivo.
- Crear / borrar / despachar una máquina.

Para mantener consistencia, los campos calculados (`horas_totales`, `horas_faltantes`, etc.) **no se almacenan** en la base de datos sino que se calculan al vuelo en una capa de servicio en el servidor (Server Action o RPC de Postgres). Esto evita inconsistencias.

---

## 9. Tiempo real

Suscripciones que la app debe abrir vía Supabase Realtime:

| Pantalla | Tablas suscritas | Comportamiento |
| --- | --- | --- |
| `/planta/maquinas` (lista) | `machine_stages`, `machines` | Recalcula avance de las filas afectadas en vivo. |
| `/planta/maquinas/[id]` (detalle) | `machine_stages` (filtrado por la máquina) | Refleja cambios hechos por otro operario al instante. |
| `/admin` (dashboard) | `machines`, `machine_stages`, `stage_logs` | Refleja avances y reordenamientos. |
| `/c/[token]` (portal cliente) | `machines`, `machine_stages` filtrados por `client_id` | Refleja el avance en vivo para el cliente. |

---

## 10. Migración inicial de datos

> Esta sección se ejecutará posteriormente con Claude Code; en este PRD solo se especifica el contrato.

Se ejecutará un script de seed que carga:

1. **Catálogo de equipos** desde la hoja `Precios y materiales` del Excel.
2. **Colores** únicos extraídos de la columna `color` de `plan de producción` y `despachados`.
3. **Clientes** únicos extraídos de la columna `CLIENTE`.
4. **Operarios** desde la hoja `Mano de obra`.
5. **Máquinas en producción** desde la hoja `plan de producción`, una fila por cada SEÑAL, preservando el orden actual como `order_position`. El estado actual de avance de cada etapa se infiere de las celdas marcadas con `x` o con texto:
   - Si la celda contiene `x` → la etapa está **al 100 %**.
   - Si contiene el nombre de la etapa (p.ej. `Armar`, `Pulir`) → esa etapa está **pendiente o en curso**; las anteriores se asumen al 100 %.
6. **Máquinas históricas** desde la hoja `despachados` con `status = 'shipped'`.
7. **Configuración** se inicializa con los valores observados en el Excel (`labor_factor = 0.3`, `hourly_cost = 22019.57`, `daily_hours_mon_fri = 9`, `daily_hours_sat = 6`, `active_workers_count = 9`, `client_buffer_days = 3`).
8. **Festivos colombianos** del año en curso se cargan desde un dataset local (lista hardcodeada o paquete `date-holidays`).

---

## 11. Capas y endpoints (alto nivel)

No se requiere un API REST público. Se usan Server Actions de Next.js y RLS de Supabase. Las capas relevantes son:

### 11.1 Capa de servicio (servidor)

- `services/machines.ts` — CRUD, recálculo de fechas y horas.
- `services/stages.ts` — actualizar avance de una etapa, generar log, manejar undo.
- `services/schedule.ts` — calcular calendario laboral y fechas estimadas.
- `services/clients.ts` — gestión de tokens.
- `services/settings.ts` — config y password de planta.

### 11.2 Server Actions principales

| Acción | Llamada desde | Validación |
| --- | --- | --- |
| `updateStage(machineId, stageId, completion, workerId)` | iPad | Cookie de planta válida; `workerId` activo. |
| `undoLastAction(workerId, logId)` | iPad | Cookie de planta válida; el log pertenece al operario. |
| `unlockFactory(password)` | Pantalla bloqueo iPad | bcrypt compare. |
| `createMachine(input)` | Admin | Supabase Auth + rol admin. |
| `updateMachine(id, patch)` | Admin | Idem. |
| `reorderMachines(orderedIds[])` | Admin | Idem. |
| `markShipped(machineId)` | Admin | Idem. |
| `updateSettings(patch)` | Admin | Idem. |
| `regenerateClientToken(clientId)` | Admin | Idem. |

---

## 12. Convenciones de UI

- **Idioma:** todos los textos visibles, sin excepción, están en español.
- **Tipografía:** Inter o similar; tamaños generosos en el iPad (botones con texto ≥ 18 px).
- **Colores funcionales:** verde para 100 %, amarillo/naranja para parcial, gris para 0 %.
- **Densidad:**
  - iPad: muy baja densidad, botones grandes, abundante espacio entre tarjetas.
  - Admin: densidad alta, tablas compactas, columnas alineadas a la derecha cuando son numéricas.
- **Iconografía:** `lucide-react` (incluido en shadcn/ui).
- **Formato de moneda:** `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`.
- **Formato de fechas:** `dd MMM yyyy` (p.ej. `27 may 2026`) en `es-CO`.

---

## 13. Stack y dependencias sugeridas

```jsonc
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "@supabase/supabase-js": "^2",
    "@supabase/ssr": "^0.5",
    "tailwindcss": "^4",
    "@radix-ui/react-*": "via shadcn/ui",
    "lucide-react": "latest",
    "date-fns": "^4",
    "date-fns-tz": "^3",
    "date-holidays": "^3",     // festivos colombianos
    "zod": "^3",                // validación de inputs
    "bcrypt-ts": "^5",          // hash de la contraseña de planta
    "@dnd-kit/core": "^6"       // drag and drop para reordenar máquinas
  }
}
```

---

## 14. Plan de implementación recomendado (en fases)

> Esto es una guía para Claude Code; no es contractual.

**Fase 1 — Cimientos.**
- Setup Next.js + Supabase + Vercel.
- Tablas, RLS, seeds vacíos.
- Auth admin.
- Login del iPad y selección de operario (sin lógica de producción todavía).

**Fase 2 — Dashboard admin estático.**
- Crear máquinas, editar, eliminar.
- Catálogo, colores, operarios, festivos, configuración.
- Vista tabla "Plan de Producción" sin cálculos todavía.

**Fase 3 — Motor de cálculo.**
- Fórmulas de horas, avance, acumulado, fechas.
- Recalculo automático.
- Reordenamiento drag-and-drop.

**Fase 4 — Tablero de operarios funcional.**
- Lista de máquinas con realtime.
- Detalle de máquina con tarjetas de etapas.
- Snackbar de deshacer + panel "Mis acciones".

**Fase 5 — Portal del cliente.**
- `/c/[token]` con realtime y buffer de 3 días.
- Gestión de tokens desde admin.

**Fase 6 — Migración.**
- Importador de Excel.
- Pruebas comparativas: la app produce los mismos números que el Excel en N filas.

**Fase 7 — Pulido.**
- QA en iPad real.
- Endurecer RLS, revisar tokens, rate limiting.
- Documentación de uso para Santiago, Nelly, Gina, Ana María y los operarios.

---

## 15. Criterios de aceptación del MVP

- Un operario puede, desde un iPad bloqueado, llegar a registrar un avance de etapa en **≤ 5 toques**: desbloquear (1) → nombre (2) → máquina (3) → etapa (4) → porcentaje (5).
- Deshacer un error está disponible en **≤ 2 toques**.
- El dashboard de Santiago carga toda la planilla en menos de 2 segundos y refleja los cambios de los operarios al instante.
- Para una máquina dada del Excel actual, las fórmulas del sistema producen los mismos valores que aparecen en las columnas de "Avance %", "Horas faltantes", "Acumulado" y "Estimado", con tolerancia ≤ 1 %.
- El portal del cliente muestra la misma información que el dashboard pero con la fecha desplazada 3 días.
- Solo administradores pueden modificar el catálogo, la configuración y las máquinas.
- Solo administradores pueden marcar máquinas como despachadas.

---

## 16. Riesgos y aclaraciones pendientes

1. **Fórmula exacta de "Avance %" del Excel.** Verificar contra varias filas que la ponderación (450 vs 700, etc.) replica el comportamiento original.
2. **Fórmula exacta del divisor en "Días-hombre faltantes".** Confirmar con el Excel.
3. **Festivos colombianos:** el paquete `date-holidays` cubre la mayoría, pero los puentes (festivos trasladados al lunes según la Ley Emiliani) requieren verificación manual cada inicio de año.
4. **Cambio de la contraseña de planta:** quién la cambia, cómo se comunica al resto. Recomendación: que solo Santiago la conozca y la cambie cada 6 meses.
5. **Borrado de operarios con historial:** soft-delete (`is_active = false`) en lugar de delete físico, para que `stage_logs` conserve la referencia.
6. **Cliente con muchas máquinas históricas:** considerar paginar el portal cliente si supera 30 tarjetas.

---

*Fin del PRD.*
