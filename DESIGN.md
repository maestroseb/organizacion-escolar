# Gestor de Horarios y Sustituciones — Documento de Diseño

> Sistema de gestión de horarios escolares para centros educativos andaluces (CEIP), con generación automática de vistas y módulo de sustituciones.
>
> **Estado**: documento de diseño previo a implementación.
> **Próximo paso**: implementación en Claude Code sobre repositorio GitHub.

---

## 1. Visión y filosofía

### Objetivo
Sustituir el sistema actual basado en una hoja de cálculo de Google Sheets con sábanas por tramo horario rellenadas a mano y fórmulas con `INDIRECT`/`QUERY` que dependen de intervalos con nombre fijos. El sistema actual funciona, pero es **inviable de portar a otros centros** sin retocar fórmulas a mano.

### Principios de diseño
1. **Una única fuente de verdad**: las ocupaciones atómicas `(docente, día, tramo) → actividad`. Todas las vistas (sábana, individual, por grupo, "ahora", sustituciones) se derivan de ahí.
2. **Democratización real**: cualquier coordi TDE de cualquier centro debe poder clonar el sistema y adaptarlo a su realidad en menos de 1 hora, sin tocar código ni fórmulas.
3. **Coste cero permanente** para el centro que lo usa. Sin tarjetas, sin planes, sin dependencias externas que puedan cambiar de política.
4. **Privacidad respetada**: datos del centro en su propio Drive, no en infraestructura de terceros.

### Patrón de uso real (define la arquitectura)
- **Una única persona** gestiona el sistema (típicamente coordi TDE o Jefatura). Sin concurrencia.
- **Configuración inicial** una vez al curso (1-2 horas): datos del centro + horarios.
- **Uso diario**: lectura. Módulo "Ahora" + módulo Sustituciones cuando hace falta.
- **Edición de horarios**: rarísima (alta o baja de un docente, cambio puntual).

Esto descarta la complejidad de una webapp multi-tenant con auth, BD relacional, etc. **Apps Script + Sheets es objetivamente la mejor opción.**

---

## 2. Stack y arquitectura

### Stack elegido
- **Almacenamiento**: Google Sheets (varias pestañas como tablas relacionales)
- **Lógica**: Google Apps Script (`.gs`)
- **UI interna**: HTMLService (sidebars, dialogs y web app interna)
- **UI pública** (módulo "Ahora"): Apps Script Web App con `doGet()` desplegada como "Anyone, even anonymous"
- **Versionado**: clasp + GitHub
- **Parser de imágenes/PDF**: Gem público de Gemini (externo a la app)

### Por qué Apps Script
- ✅ Cero fricción de despliegue ("Archivo → Hacer una copia")
- ✅ Gratuito sin límites para uso educativo
- ✅ Login automático con cuentas @g.educaand.es
- ✅ Datos en Workspace for Education (LOPD aprobada por la Junta)
- ✅ Sin CORS, sin proxies externos, sin dependencias frágiles
- ✅ Dominio probado (sistema de reservas, biblioteca, CGT)

### Distribución
1. Plantilla maestra pública en Drive con script vinculado
2. El coordi hace "Archivo → Hacer una copia" → instancia aislada
3. Primer arranque: wizard de setup (con opción de subir XML de Séneca)
4. Repo en GitHub solo para versionado y documentación

---

## 3. Modelo de datos

### Filosofía
- Cada entidad = una pestaña de Sheets
- Cada campo = una columna
- Cada FK = columna con el ID de la otra pestaña
- **Pestañas de datos** con prefijo `_` (ocultas o protegidas)
- **Pestañas de vistas** sin prefijo (visibles al usuario)

### Entidades

#### 3.1 `_Centro`
Datos generales del centro. Una sola fila.

| Campo | Tipo | Notas |
|---|---|---|
| id | string | UUID o "centro_1" |
| nombre | string | "CEIP Carlos III" |
| codigo | string? | Código Séneca |
| localidad | string? | "La Carlota" |
| provincia | string? | "Córdoba" |
| comunidad | string? | "Andalucía" |
| etapas | string | "INFANTIL,PRIMARIA" |
| curso_academico | string | "2025-2026" |
| fecha_inicio | date? | |
| fecha_fin | date? | |

#### 3.2 `_Tramos`
| Campo | Tipo | Notas |
|---|---|---|
| id | string | "tramo_1" |
| orden | int | 1, 2, 3… |
| hora_inicio | string | "09:00" |
| hora_fin | string | "09:30" |
| es_recreo | boolean | |
| etiqueta | string? | "Recreo Primaria" |

#### 3.3 `_Grupos`
| Campo | Tipo | Notas |
|---|---|---|
| id | string | "grupo_1" |
| nombre_corto | string | "1º", "INF 5A" |
| nombre_largo | string? | "1º de Primaria" |
| nivel | string | "INF3", "INF4", "1P"… "6P" |
| etapa | string | "INFANTIL" / "PRIMARIA" |
| orden | int | |
| tutor_id | FK → _Docentes? | |
| color | string? | |

#### 3.4 `_Docentes`
| Campo | Tipo | Notas |
|---|---|---|
| id | string | "doc_1" |
| nombre_corto | string | "Sebastián" (único en el centro) |
| nombre_completo | string? | |
| puesto | string? | "Educación Primaria-Bilingüe Inglés" |
| email | string? | |
| activo | boolean | |
| orden | int | |
| color | string? | |

#### 3.5 `_Localizaciones`
Espacios físicos / huecos que participan en horario de refuerzos/PT/AL/ATEDU.

| Campo | Tipo | Notas |
|---|---|---|
| id | string | "loc_1" |
| codigo | string | "#01", "Aula PT" |
| descripcion | string? | |
| orden | int | |

#### 3.6 `_Materias`
| Campo | Tipo | Notas |
|---|---|---|
| id | string | "mat_1" |
| nombre | string | "Lengua", "Matemáticas" |
| abreviatura | string? | |
| color | string? | |
| es_recreo | boolean | |

#### 3.7 `_RolesEspeciales`
Cargos/actividades no pegadas a un grupo: DIR, JE, TDE, Coordinaciones…

| Campo | Tipo | Notas |
|---|---|---|
| id | string | "rol_1" |
| nombre | string | "DIR", "TDE" |
| nombre_largo | string? | "Dirección" |
| color | string? | |

#### 3.8 `_Ocupaciones` ⭐
**La tabla central.** Una fila por cada `(docente, día, tramo)`.

| Campo | Tipo | Notas |
|---|---|---|
| id | string | |
| docente_id | FK → _Docentes | |
| dia | string | "L", "M", "X", "J", "V" |
| tramo_id | FK → _Tramos | |
| tipo | string | "GRUPO", "LOCALIZACION", "ESPECIAL" |
| grupo_id | FK → _Grupos? | si tipo=GRUPO |
| materia_id | FK → _Materias? | si tipo=GRUPO |
| localizacion_id | FK → _Localizaciones? | si tipo=LOCALIZACION |
| rol_loc_id | FK → _RolesEspeciales? | si tipo=LOCALIZACION (Refuerzo, PT, AL, ATEDU) |
| grupo_destino_id | FK → _Grupos? | si tipo=LOCALIZACION (grupo destino del refuerzo) |
| rol_especial_id | FK → _RolesEspeciales? | si tipo=ESPECIAL (DIR, TDE…) |
| notas | string? | |

**Restricción única**: `(docente_id, dia, tramo_id)`. Si no hay fila para un docente/día/tramo, está libre.

#### 3.9 `_Sustituciones`
| Campo | Tipo | Notas |
|---|---|---|
| id | string | |
| fecha | date | |
| docente_ausente_id | FK → _Docentes | |
| docente_sustituto_id | FK → _Docentes | |
| tramo_id | FK → _Tramos | |
| notas | string? | |

### Decisiones cerradas sobre el modelo
1. **Recreos** → `Materia` con flag `es_recreo=true`, tratado como tipo GRUPO.
2. **Ocupaciones compuestas** (`Ref. 4º`, `PT 3º`) → dos FKs (`rol_loc_id` + `grupo_destino_id`), nunca texto libre.
3. **Días libres** → omitidos (sin fila en `_Ocupaciones`).
4. **Jornadas multi-turno** → soportadas vía tramos adicionales (T11, T12…).
5. **Histórico anual** → el `_Centro` lleva `curso_academico`; al iniciar nuevo curso se duplica la plantilla.

---

## 4. Setup wizard

### Flujo: 8 pasos secuenciales

**Paso 0 — Bienvenida e import opcional**
- "¿Tienes el XML de Séneca? Súbelo para precargar datos."
- Si se sube, los pasos siguientes vienen con datos pre-rellenos como borrador editable.

**Paso 1 — Datos del centro**
- Nombre, código, localidad, provincia, comunidad
- Curso académico
- **3 preguntas clave** que afinan los defaults: etapas (Infantil/Primaria/ambas), líneas por curso (1, 2, mixto), bilingüe (No/Inglés/Francés)

**Paso 2 — Tramos horarios**
- Sin precargar por defecto (forzar revisión). Plantilla típica andaluza disponible como sugerencia.
- Si vino del XML de Séneca: precargados con sus horas reales.

**Paso 3 — Grupos**
- Auto-generados según etapas + líneas elegidas
- Editables: nombre corto, nombre largo, orden
- Tutoría se asigna en paso 5 (cuando ya están los docentes)

**Paso 4 — Docentes**
- Vacío salvo que venga del XML
- Nombre corto único (será el que aparece en todas las vistas)
- Datos opcionales: nombre completo, puesto, email

**Paso 5 — Tutorías**
- Asignar tutor a cada grupo (desplegable con docentes del paso 4)

**Paso 6 — Localizaciones**
- Defaults sugeridos: una "Aula" por grupo + Biblioteca + Gimnasio + Salón Actos + Aula PT + Aula AL + Aula TIC + Recreo Primaria + Recreo Infantil
- Si XML: filtradas las dependencias relevantes
- Editable y ampliable

**Paso 7 — Materias**
- Precargadas según etapas + bilingüismo:
  - *Infantil*: Crecimiento en Armonía, Descubrimiento del Entorno, Comunicación y Representación, Inglés, Religión, Atención Educativa
  - *Primaria*: Lengua, Matemáticas, Conocimiento del Medio, E. Artística (o Música + Plástica), E. Física, Inglés, Religión, Atención Educativa, Valores Cívicos (5º/6º)
  - *Si bilingüe inglés*: ANL (Natural Science, Social Science, Arts and Crafts)
  - *Si bilingüe francés*: Francés
- Editable

**Paso 8 — Cargos y roles especiales**
- Precargados (subset relevante de los 107 de Séneca): Dirección, Jefatura, Secretaría, TDE, Coordinaciones (Coeducación, Convivencia, Biblioteca, PRL, Plan de Salud, Ciclo), PT, AL, Refuerzo educativo, ATEDU, Tutoría, Recreo de guardia
- Editable

**Paso 9 — Confirmación**
- Resumen visual con números (X grupos, X docentes, X tramos…)
- Botón "Empezar a meter horarios"

---

## 5. Entrada de horarios

### Estrategia principal: rejilla por grupo

**Filosofía**: aprovechar el modelo mental del coordi ("el horario de 3º es..." en vez de "el horario de Mª Carmen es...").

- Pantalla por grupo: tabla días × tramos
- Cada celda: desplegables de materia + docente
- **Si el grupo tiene tutor asignado, pre-rellena al tutor en todas las celdas vacías**
- El coordi solo cambia las celdas con especialistas
- Al guardar, se generan las `_Ocupaciones` correspondientes
- **Validación en tiempo real**: un docente no puede estar en dos sitios a la vez (la BD lo garantiza con índice único)

### Estrategia complementaria: huecos de docentes

Una vez rellenados los grupos, queda por cubrir:
- Refuerzos
- PT / AL
- ATEDU
- Cargos (DIR, JE, TDE…)
- Recreos de guardia
- Tiempo libre

Pantalla "Huecos pendientes" que lista cada docente con sus celdas no asignadas y permite rellenarlas con tipo LOCALIZACION o ESPECIAL.

### Estrategia avanzada: pegado CSV

Para power users o para importar de un parser externo.

**Formato del CSV**:
```
Docente,Día,Tramo,Tipo,Campo1,Campo2
Sebastián,L,1,grupo,1º,Lectura
Sebastián,L,2,grupo,1º,Lengua
Sebastián,L,3,localizacion,#05,Ref. 4º
Sebastián,L,9,especial,TDE,
```

- El parser es tolerante: "Sebas" → "Sebastián", "Lun" → "L", "Mat" → "Matemáticas"
- Preview con errores destacados antes de guardar
- Validación contra el catálogo del centro

### Parser externo: Gem público de Gemini

Para convertir horarios en imagen/PDF al formato CSV.

**Arquitectura**:
1. El coordi clica botón "Generar CSV con IA" → se abre el Gem en pestaña nueva
2. El Gem es público, configurado con prompt maestro de parseo de horarios escolares
3. La app le ofrece un botón "Copiar catálogo del centro" → genera un Markdown estructurado con docentes, grupos, materias, tramos, localizaciones, roles
4. El coordi pega catálogo + imagen en el Gem
5. El Gem devuelve CSV en el formato exacto que la app espera
6. El coordi copia y pega en la pantalla de import

**Por qué Gemini**: gratis para docentes andaluces (cuentas @g.educaand.es), multimodal, sin coste de API para nadie.

**El Gem se construye una vez y es público para todos los centros que usen el sistema.**

---

## 6. Vistas y módulos

### 6.1 Sábana por tramo (vista derivada interna)
Reproducción de la sábana original como vista derivada, no como fuente.
- Pantalla con desplegable de día + tramo
- Renderizado: bloque izquierdo con `tipo=GRUPO`, bloque derecho con `tipo=LOCALIZACION`, ESPECIAL aparte
- Read-only (los cambios se hacen en la entrada por grupo)

### 6.2 Horario individual de docente (vista derivada interna)
Filtra `_Ocupaciones` por docente, pivota día × tramo. Read-only.

### 6.3 Horario por grupo (vista derivada interna)
Filtra `_Ocupaciones` por grupo, pivota día × tramo, incluye qué docente. Read-only.

### 6.4 Módulo "Ahora" — endpoint público ⭐
**El killer feature de uso diario.**

- URL pública sin autenticación, embebible en iframe en BlogsAverroes
- Mobile-first, instalable como acceso directo en móvil
- Auto-refresh con JS
- Caché de Apps Script (`CacheService`) para latencia
- **Sin filtrar contenido**: solo hay docentes y ubicaciones, no datos de alumnado

**Endpoints del MVP**:
- `/ahora` — tramo activo según `now()`
- `/antes` — tramo inmediatamente anterior (útil durante el cambio de clase, cuando el docente aún no se ha movido)

**Variantes para fase 2** (mismo motor, diferente filtro):
- `/siguiente` — próximo tramo (preparación 5 min antes)
- `/hoy/<docente>` — día completo de un docente, URL personal guardable como acceso directo
- `/dia/<grupo>` — día completo de un grupo, útil para tutor o publicación

### 6.5 Módulo Sustituciones — interno
**UX heredada del prototipo de Gemini** (con adaptaciones):

- Selección de fecha → calcula día de la semana automáticamente
- Selección **múltiple** de docentes ausentes (varios a la vez)
- Rejilla resultado: columnas = docentes ausentes, filas = tramos
- En cada celda: actividad del ausente + desplegable con disponibles, mostrando ocupación actual ("Ref. 4º", "Gua.")
- Detección de duplicados (mismo sustituto asignado dos veces en mismo tramo → marcado en rojo)
- Permite escribir nombre libre con icono de aviso si no está en disponibles
- **Persistencia**: al confirmar plan, se guarda en `_Sustituciones` para histórico

**Reemplazos respecto al prototipo de Gemini**:
- No usa CSV publicado ni corsproxy.io. Lee de `_Ocupaciones` vía `google.script.run`.
- Persiste las sustituciones en `_Sustituciones`.
- Resto de UX/UI: ~70% reutilizable del HTML original.

---

## 7. Estructura del repositorio

```
/
├── README.md                  # Cómo clonar y configurar
├── DESIGN.md                  # Este documento
├── .clasp.json                # Config clasp
├── appsscript.json            # Manifiesto Apps Script
├── src/
│   ├── 00_Constants.gs        # Constantes globales (nombres de pestañas, etc.)
│   ├── 01_Setup.gs            # Wizard de setup inicial
│   ├── 02_SenecaImport.gs     # Parseo del XML de Séneca
│   ├── 03_DataAccess.gs       # CRUD sobre las pestañas _*
│   ├── 04_OcupacionesAPI.gs   # API específica de ocupaciones (queries, validación)
│   ├── 05_Views.gs            # Generación de vistas (sábana, individual, grupo)
│   ├── 06_Ahora.gs            # Endpoint público "Ahora"
│   ├── 07_Sustituciones.gs    # Lógica de sustituciones
│   ├── 08_CSVImport.gs        # Parser de CSV de horarios
│   ├── 09_Web.gs              # doGet / doPost para web apps
│   └── ui/
│       ├── setup.html         # Wizard HTML
│       ├── entrada.html       # Rejilla por grupo
│       ├── huecos.html        # Pantalla de huecos
│       ├── csv.html           # Pantalla de import CSV
│       ├── ahora.html         # Widget público "Ahora"
│       ├── antes.html         # Widget público "Antes"
│       └── sustituciones.html # Módulo de sustituciones
├── docs/
│   ├── instalacion.md         # Pasos para clonar y configurar
│   ├── uso.md                 # Manual de uso
│   ├── gem-prompt.md          # Prompt maestro del Gem de Gemini
│   └── capturas/
└── plantilla/
    └── README.md              # Cómo crear la plantilla Drive
```

---

## 8. Fases de desarrollo sugeridas

### MVP (Fase 1)
1. Estructura básica: pestañas `_*` vacías con cabeceras
2. Capa `DataAccess` (CRUD genérico para cada pestaña)
3. Setup wizard sin import Séneca (manual)
4. Entrada de horarios por grupo (sin pre-rellenar tutor)
5. Vista sábana derivada
6. Vista horario individual
7. Vista horario por grupo
8. Módulo "Ahora" (endpoint público `/ahora`)
9. Módulo "Antes" (`/antes`)
10. Módulo Sustituciones (sin persistencia)

### Fase 2
- Import XML de Séneca
- Pre-relleno de tutor en entrada por grupo
- Pantalla de "huecos pendientes"
- Import CSV con validación
- Gem público de Gemini con prompt maestro y documentación
- Persistencia de sustituciones en `_Sustituciones`
- Histórico de sustituciones consultable

### Fase 3
- Variantes públicas: `/siguiente`, `/hoy/<docente>`, `/dia/<grupo>`
- Estadísticas de sustituciones (cuántas ha cubierto cada docente)
- Exportación a PDF de horarios
- Notificaciones por email al docente sustituto

### Fase 4 (opcional, lejana)
- Migración a web (Vercel + Turso) si algún centro lo demanda. El modelo de datos es portable: exportar `_*` a JSON e importar a la nueva BD.

---

## 9. Decisiones cerradas

1. ✅ Stack: Apps Script + Sheets, no web con Vercel
2. ✅ Una persona gestora, sin concurrencia
3. ✅ Datos del centro en su propio Drive
4. ✅ Modelo atómico: `_Ocupaciones` como única fuente
5. ✅ Recreos como `Materia` con flag
6. ✅ Ocupaciones compuestas con dos FKs (rol + grupo destino)
7. ✅ Días libres omitidos (sin fila)
8. ✅ Parser de imágenes vía Gem público de Gemini (no integrado en app)
9. ✅ Módulo "Ahora" como endpoint público sin filtrar contenido
10. ✅ MVP incluye `/ahora` y `/antes`
11. ✅ Sustituciones reutilizan UX del prototipo Gemini, persisten en `_Sustituciones`
12. ✅ Entrada principal por grupo (no por docente)

---

## 10. Decisiones pendientes / a revisar durante implementación

- **IDs**: ¿UUIDs o autoincrement legible (`tramo_1`, `grupo_1`)? → Decidir al implementar; UUIDs más robustos, autoincrement más legibles para depurar.
- **Colores**: ¿paleta predefinida que el usuario elige o picker libre? → Probablemente paleta predefinida para coherencia visual.
- **Permisos del Sheets**: ¿pestañas `_*` ocultas, protegidas, o ambas? → Probar; idealmente ocultas + protegidas con script bypass.
- **Caché de "Ahora"**: TTL óptimo. Empezar con 5 min, ajustar.
- **Manejo de festivos en Sustituciones**: ¿cómo se marca un día sin clases? → Probablemente bandera manual + lectura de calendario del centro (fase 2).

---

## 11. Referencias del sistema actual

### Cómo funciona ahora (a sustituir)
- Una pestaña por (día × tramo): `LUNES01`, `LUNES02`… `VIERNES10`
- Cada pestaña tiene la "sábana" del tramo con dos bloques paralelos (curso/docente/ocupación + localización/docente/ocupación)
- Las vistas individuales y por grupo usan fórmulas tipo `=QUERY(INDIRECT("LUNES01"); "SELECT G WHERE F='"&$B$3&"'")`
- Los intervalos con nombre están hardcodeados → portar a otro centro requiere tocar cada fórmula

### Cómo cambia
- Una sola pestaña `_Ocupaciones` con todas las ocupaciones atómicas
- Las vistas se generan con `getRange + getValues + filter + render` en Apps Script, o con fórmulas dinámicas que leen de `_Ocupaciones`
- Portar a otro centro = clonar plantilla y ejecutar wizard

---

## 12. Anexo: prompt maestro del Gem de Gemini

```
Eres un parser especializado en horarios escolares de centros andaluces (CEIP).
Recibes una imagen, PDF o captura de un horario y debes devolver un CSV con las
ocupaciones de cada docente.

CONTEXTO DEL CENTRO (se proporciona al inicio de la conversación):
- Docentes válidos: [lista del centro]
- Grupos válidos: [lista del centro]
- Materias válidas: [lista del centro]
- Localizaciones válidas: [lista del centro]
- Cargos/Roles válidos: [lista del centro]
- Tramos: [con horas inicio-fin]

TAREA: Por cada celda del horario, generar UNA fila CSV con formato:

Docente,Día,Tramo,Tipo,Campo1,Campo2

Donde:
- Docente: nombre exacto del catálogo
- Día: L | M | X | J | V
- Tramo: número (1, 2, 3...)
- Tipo: grupo | localizacion | especial
- Si Tipo=grupo: Campo1=Grupo, Campo2=Materia
- Si Tipo=localizacion: Campo1=Localización, Campo2=Ocupación (formato "Rol Grupo", ej "Ref. 4º")
- Si Tipo=especial: Campo1=Rol (ej "TDE", "DIR"), Campo2=vacío

REGLAS:
- Solo usar valores del catálogo. Mapea aproximaciones: "Mat" → "Matemáticas".
- Si algo no encaja, ponlo en Campo1 con prefijo "??" para revisión manual.
- Devuelve SOLO el CSV, sin texto adicional, sin Markdown, sin explicaciones.
- Primera línea: encabezado.
- Codificación: UTF-8.
- Días libres del docente: NO incluir filas.
```

---

*Documento de diseño v1.0 — listo para arrancar implementación en Claude Code.*
