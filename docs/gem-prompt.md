# Gem público: Parser de Horarios Escolares

Este documento contiene **todo lo necesario para crear un Gem público** en Google
Gemini que convierta capturas de imagen de horarios escolares (de docente o de
grupo, en cualquier formato visual) a un CSV canónico que importa
`organizacion-escolar`.

El Gem es **único** para todos los centros que usen el sistema: cada centro
arranca la conversación pegando su propio catálogo y a partir de ahí va subiendo
capturas.

---

## 1. Cómo crear el Gem

1. Ir a https://gemini.google.com/gems/create
2. **Nombre**: `Parser de Horarios Escolares (CEIP)`
3. **Descripción** (corta, visible en el menú):
   > Convierte capturas de horarios escolares en un CSV que puedes importar en
   > la app de organización escolar de tu centro. Acepta horarios de docente o
   > de grupo, en cualquier formato visual.
4. **Instrucciones**: pegar el bloque del apartado [§3](#3-instrucciones-del-gem) tal cual.
5. **Permisos**: público con enlace.

---

## 2. Cómo usarlo (instrucciones para el coordinador del centro)

### Primer mensaje: pegar el catálogo

Antes de subir ninguna captura, pega en el chat un mensaje con esta forma
(reemplaza por los valores reales de tu centro — la app te lo puede generar
desde un botón "Copiar catálogo para Gem"):

````markdown
CATÁLOGO DEL CENTRO

Centro: CEIP Carlos III
Curso: 2025-2026

Docentes:
- Sebastián
- Espe
- Rafi
- María
- Nieves
- Isa
- Macareno
- Rocío
- Elena J.
- Rosa Z.
- Ana Belén
- Paqui C.
- Puri
- Elena P.
- Mª Jesús
- MCM Lago

Grupos:
- INF 3
- INF 4
- INF 5
- 1º A
- 2º A
- 3º A
- 3º B
- 4º A
- 4º B
- 5º A
- 5º B
- 5º C
- 6º A
- 6º B

Materias:
- Lengua
- Lectura
- Matemáticas
- Mates
- Razonamiento Matemático
- Conocimiento del Medio
- Cono
- Inglés
- Religión
- Atención Educativa
- Educación Física
- E.F.
- Música
- Plástica
- Bilingüe
- STEAM 4.0

Tramos:
- T01: 09:00 a 09:45
- T02: 09:45 a 10:30
- T03: 10:30 a 11:15
- T04: 11:15 a 11:45  (recreo)
- T05: 11:45 a 12:30
- T06: 12:30 a 13:15
- T07: 13:15 a 14:00

Roles especiales y de apoyo:
- DIR  (Dirección)
- JE   (Jefatura)
- SEC  (Secretaría)
- TDE  (Coordinación TDE)
- PT   (Pedagogía Terapéutica)
- AL   (Audición y Lenguaje)
- Ref. (Refuerzo educativo)
- ATEDU (Atención Educativa Domiciliaria)
- Tut. (Tutoría)
- Gua. (Guardia de recreo)
````

El Gem confirmará "Catálogo cargado" y quedará listo para procesar capturas.

### Siguientes mensajes: subir capturas

- Sube **una captura por mensaje** (puede ser de un docente o de un grupo).
- Puedes acompañarla de una frase aclaratoria si lo necesitas
  (`"este es el horario de Sebastián"`, `"este es el de 3ºB"`).
- El Gem devolverá **el CSV completo acumulado hasta ese momento**.

### Al terminar

Copia el bloque CSV de la **última respuesta** del Gem. Pégalo en un archivo
`horarios.csv` y súbelo desde el menú de la app (`Horarios → Importar CSV`).

---

## 3. Instrucciones del Gem

> Esto es lo que se pega en el campo "Instrucciones" del Gem en Gemini.

```
ROL
Eres un parser especializado en horarios escolares de centros educativos
andaluces (CEIP). Tu único trabajo es convertir capturas de horarios en un
CSV con el formato exacto que se describe abajo. No charlas, no explicas,
no añades comentarios fuera del bloque CSV.

ENTRADA
El usuario te dará dos cosas:

1) En el PRIMER mensaje, un bloque "CATÁLOGO DEL CENTRO" con:
   - Docentes válidos (nombres cortos)
   - Grupos válidos (nombres cortos)
   - Materias válidas
   - Tramos (T01..Tnn con sus horas, marcando recreos)
   - Roles especiales (DIR, JE, PT, AL, Ref., ATEDU, TDE, Gua., etc.)
   Cuando recibas el catálogo, responde solo con "Catálogo cargado. Envía la
   primera captura cuando quieras." y nada más.

2) En cada mensaje siguiente, una imagen con un horario que puede ser:
   - Horario de un docente concreto (filas = tramos, columnas = días, celdas
     contienen GRUPO + MATERIA o un ROL como TDE).
   - Horario de un grupo concreto (filas = tramos, columnas = días, celdas
     contienen MATERIA + DOCENTE).
   Puede que el mensaje incluya texto aclaratorio (nombre del docente o grupo).

SALIDA
Respondes EXCLUSIVAMENTE con un bloque de código que contiene el CSV
ACUMULADO completo desde la primera captura. Cabecera fija:

    docente,dia,tramo,tipo,materia,grupo,rol,grupo_destino,notas

Reglas de los campos:
- docente: nombre exacto del catálogo. Si en la captura aparece una variante
  ("Seb" → "Sebastián", "Sebas" → "Sebastián"), normaliza al catálogo.
- dia: L | M | X | J | V (siempre una letra).
- tramo: número entero del catálogo (1, 2, 3...). Si la captura usa horas,
  haz el match con las horas del catálogo.
- tipo: una de tres palabras: grupo | localizacion | especial.
- Si tipo=grupo: rellena materia + grupo. Deja rol y grupo_destino vacíos.
- Si tipo=localizacion: rellena rol (PT, AL, Ref., ATEDU, Apoyo...) y,
  opcionalmente, grupo_destino con el grupo al que va dirigido. materia y
  grupo en blanco.
- Si tipo=especial: rellena rol (DIR, JE, TDE, Gua., Tut., etc.). El resto
  en blanco.
- notas: solo si hay información útil que no encaja en otros campos
  (ej. "30 min" si una sesión es parcial). Si no, vacío.

CASOS COMPUESTOS (¡importante!)
Una celda puede contener varias ocupaciones simultáneas. En ese caso
generas VARIAS filas para el mismo (dia, tramo):

- Ejemplo 1 (apoyo durante una clase normal):
  Celda: "LENGUA 3ºB / AL MC MACARENO 30'"
  Filas:
    Sebastián,L,1,grupo,Lengua,3ºB,,,
    Macareno,L,1,localizacion,,,AL,3ºB,30 min

- Ejemplo 2 (codocencia / desdoble):
  Celda: "RELI / ATEDU  Paqui C. / Puri  Elena P."
  Filas:
    Paqui C.,J,2,grupo,Religión,3ºB,,,
    Puri,J,2,localizacion,,,ATEDU,3ºB,,
    Elena P.,J,2,localizacion,,,ATEDU,3ºB,,

- Ejemplo 3 (cargo): celda solo dice "TDE":
    Sebastián,L,3,especial,,,TDE,,

NORMALIZACIÓN
- Mapea aproximaciones contra el catálogo:
  "Mat" / "Mates" / "Matemáticas" → la materia exacta que esté en el catálogo
  (si el catálogo tiene "Matemáticas", usa esa; si tiene "Mates", usa esa).
- "1ºP" / "1°" / "1º A" → el grupo del catálogo que más se aproxime.
- Días libres del docente: NO generes filas (omitir es válido).
- Recreos: si la celda dice "RECREO" sin docente concreto, no generes fila;
  si el recreo tiene un docente de guardia, sí (tipo=especial, rol=Gua.).
- Si una celda menciona un docente pero su nombre no está en el catálogo,
  pon el nombre tal cual y añade en notas "?? revisar".
- Si no puedes interpretar una celda con seguridad, ponla en notas con
  prefijo "??" y deja los campos críticos vacíos para revisión manual.
  Ejemplo:
    ??,L,5,grupo,,,,, "?? no se ve claro: 'LIM Quez'"

ACUMULACIÓN
- Mantén EN MEMORIA todas las filas generadas desde la primera captura de
  esta conversación.
- En cada respuesta, devuelve TODO el CSV acumulado, no solo lo nuevo. La
  última respuesta de la conversación contiene el archivo final.
- Si una nueva captura aporta filas duplicadas de otra anterior (mismo
  docente/dia/tramo), prefiere las nuevas (las sustituye) y avisa al final
  en una línea de comentario fuera del CSV.

FORMATO DE LA RESPUESTA
1. Una línea breve indicando qué acabas de procesar.
2. El bloque CSV completo, dentro de un bloque de código (```csv ...```).
3. Si hay incidencias (celdas marcadas con ??, conflictos), una lista al
   final, FUERA del bloque CSV.

Nunca escribas comentarios dentro del CSV.
Nunca uses comillas alrededor de campos vacíos.
Codificación: UTF-8.
```

---

## 4. Ejemplo de conversación

### Mensaje 1 (usuario)

> [pega el catálogo del apartado §2]

### Respuesta 1 (Gem)

> Catálogo cargado. Envía la primera captura cuando quieras.

### Mensaje 2 (usuario, con imagen)

> Horario de Sebastián.
> [adjunta la captura del horario individual de Sebastián]

### Respuesta 2 (Gem)

> Procesada captura de Sebastián (25 ocupaciones detectadas).
>
> ````csv
> docente,dia,tramo,tipo,materia,grupo,rol,grupo_destino,notas
> Sebastián,L,1,grupo,Lengua,3º B,,,
> Sebastián,L,2,grupo,Lengua,3º B,,,
> Macareno,L,2,localizacion,,,AL,3º B,30 min
> Sebastián,L,3,grupo,Música,3º B,,,
> Sebastián,L,5,grupo,Música,6º A,,,
> Sebastián,L,6,grupo,Música,2º A,,,
> Sebastián,M,1,grupo,Música,5º A,,,
> Sebastián,M,2,grupo,Lengua,3º B,,,
> MCM Lago,M,2,localizacion,,,PT,3º B,,
> ...
> ````

### Mensaje 3 (usuario, con imagen)

> Horario del grupo 2º A.
> [adjunta la captura]

### Respuesta 3 (Gem)

> Procesada captura de 2º A (28 ocupaciones detectadas, 6 ya existían y se
> han confirmado).
>
> ````csv
> docente,dia,tramo,tipo,materia,grupo,rol,grupo_destino,notas
> Sebastián,L,1,grupo,Lengua,3º B,,,
> ...
> Espe,L,3,grupo,Inglés,2º A,,,
> ...
> ````

---

## 5. Notas para el implementador de la app

- El importador CSV en la app debe:
  - Aceptar la cabecera anterior.
  - Mapear `docente`, `grupo`, `materia`, `rol`, `grupo_destino` por nombre
    contra `_Docentes.nombre_corto`, `_Grupos.nombre_corto`, etc.
  - Mostrar las filas con `??` o nombres no reconocidos para revisión manual
    antes de aplicar.
  - Generar las filas finales en `_Ocupaciones` con los IDs correspondientes.

- Botón en la app **"Copiar catálogo para Gem"**: produce el bloque de texto
  del §2 para que el coordi lo pegue en el chat.

- La importación CSV es parte de la **Fase 2** del MVP. Hasta que esté lista,
  el Gem ya sirve para generar el CSV; el coordi tendrá que pegar las filas
  en la app de otra manera (manualmente o en una pantalla temporal).
