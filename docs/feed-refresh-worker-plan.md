# Plan: Feed Refresh Worker (nativo, Android-first)

Documento autocontenido para retomar el trabajo en una sesión nueva. Contiene el
contexto actual, los acuerdos/decisiones ya tomados, las fases de implementación y
las decisiones que faltan antes de ejecutar la fase 1. No hay que deducir nada de
otro sitio: todo lo acordado está aquí.

---

## 1. Contexto actual (estado del repo al momento de escribir este plan)

- Aplicación **Expo / React Native, Android-first**.
- **AsyncStorage es clave-valor, no SQL.** No ofrece consultas relacionales ni
  transacciones; hoy hace de único almacén persistente desde JS.
- Los **snapshots de feeds y la lista de feeds se guardan en AsyncStorage**.
- El **HTML de los artículos se cachea en filesystem vía `expo-file-system`**.
- `FeedService.fetchAndCacheAllFeedsRanked`:
  - hace **fetch y parseo de las feeds en JavaScript** (hilo de JS),
  - además **precarga los top 5 artículos** (precarga masiva actual).
- `ArticleService` funciona **on-demand** (descarga el artículo cuando el usuario
  lo abre).
- La ruta `app/shared/[article_url].tsx` **también descarga y cachea artículos**
  (URLs que no pertenecen a ninguna feed). Cualquier diseño nuevo debe respetar
  que un artículo puede existir fuera del contexto de una feed.

## 2. Meta del proyecto

1. El usuario **navega viendo la generación activa vieja sin esperar**: nunca se
   le bloquea la UI mientras hay un refresh en curso.
2. Existe un **toast persistente** cuando hay una **generación READY pendiente**
   (lista para aplicar).
3. **Únicamente el toque del toast activa/cambia la generación visible.** Nada más
   cambia lo que ve el usuario.
4. Un **módulo nativo de Android** realiza: fetch + parseo de feeds y, después,
   descarga de **todos** los artículos, extracción de metadata y guardado del HTML.
5. **Fuente única de verdad: SQLite** para estado de generaciones, feeds y
   metadata de artículos. El **HTML vive como archivos** en filesystem, referenciado
   desde SQLite.

## 3. Acuerdos y reglas ya cerradas

### 3.1 Reglas de generación

- **Foreground**: al pasar a primer plano, si hay una generación **READY pendiente**
  de aplicar, se muestra el toast.
- **Feeds vencidas (stale)**: si las feeds están vencidas, se crea una **generación
  nueva**.
- **Generación previa incompleta + feeds vencidas**: queda **obsoleta (superseded)**
  y **NO se reanuda**.
- **Generación previa incompleta + feeds NO vencidas**: se **reanuda con el mismo ID**
  de generación.
- Cuando la generación está vencida, la incompleta **no se reanuda**; sin embargo,
  los **archivos HTML ya completos pueden reutilizarse solo si la URL aparece en la
  nueva generación**.
- **Un solo worker a la vez.**
- **Puede coexistir** una generación READY pendiente de aplicar **y** otra generación
  siendo construida.
- Las feeds **descargadas correctamente y las fallidas quedan identificadas**
  (status por feed).
- **Sin retries automáticos por ahora** (ni de feeds ni de artículos).
- El **toast solo aplica la generación al ser tocado**; no se auto-aplica.

### 3.2 Aplicación de generación y GC (basura)

- Se **conservan siempre**:
  1. la **generación activa**,
  2. la(s) **futura(s) READY pendientes**,
  3. la **generación que se está construyendo**.
- **Solo al aplicar una nueva generación** se borran los **registros** de
  generaciones **anteriores a la activa**.
- Los **archivos HTML se borran únicamente si no tienen referencias** en la
  generación activa **ni en las futuras**.
- Se debe **distinguir generación activa de incompleta obsoleta** en el modelo de
  datos/estado.
- La **generación activa permanece visible hasta que se aplique otra** (el tap del
  toast es el único disparador).

### 3.3 Descarga de artículos

- **Deduplicar URLs en la cola** de trabajo (una URL solo se procesa una vez por
  corrida).
- Ciclo por artículo:
  1. **Check `file exists`** del archivo final.
  2. Si **no existe**: descargar a un **archivo temporal** y luego **renombrar al
     nombre final en el mismo filesystem** (rename atómico; el archivo final solo es
     visible cuando está **completo**).
  3. **Leer el archivo final**, **extraer metadata** y **persistirla** en SQLite.
- **Crash entre final-file y metadata**: si el cierre ocurre **después** de crear el
  archivo final pero **antes** de persistir la metadata, se **reconcilia leyendo el
  archivo** (la metadata se reconstruye del HTML en disco).
- **Temporales huérfanos**: se **limpian y se reintenta** la descarga en la siguiente
  pasada (el temporal huérfano no invalida el artículo; se borra y vuelve a bajar).
- **Filename collision-proof**: se deja como **tech debt explícita** (por ahora el
  esquema de nombres no protege contra colisiones de URLs que generan el mismo
  nombre de archivo).
- **Sin retries automáticos.**
- Una **feed o artículo fallido queda con flag** de fallo visible en su registro.

### 3.4 Reglas de almacenamiento y concurrencia

- Para prevenir la carrera **check-then-download**: o **una tarea única por URL**, o
  **serialización** de las descargas. (Con un solo worker, la serialización natural
  del worker basta; queda registrado por si se introduce paralelismo.)
- **Un solo native worker**, protegido también ante **taps duplicados** y
  **eventos de foreground duplicados**.
- **Persistir estado/jobs** para poder **recuperar en un reinicio** de la app.
- Si una generación **expiró y fue sustituida**, **no se reanudan sus tareas**; solo
  se **reutilizan los archivos completos** que estén **referenciados por la nueva
  generación**.
- **Pendiente acordar la implementación concreta** del **lock de DB**, el
  **owner de SQLite** (JS vs nativo) y las **schema migrations al iniciar**: se
  resuelve **al iniciar la fase 1** (ver sección 8).
- **No se garantiza la continuación en background del SO.** El objetivo primario es
  **app abierta** y **recuperar en el siguiente foreground**.

### 3.5 Alcance y limitaciones registradas explícitamente

- **No se implementa iOS por ahora.** Todo el trabajo nativo es Android.
- **No se garantiza que los trabajos continúen tras la terminación de la app ni en
  background del SO.** Se **persiste estado** para **recuperar en el próximo
  foreground**.

## 4. Fases

Cada fase incluye pruebas automatizadas y manuales y **requiere aprobación del
usuario antes de pasar a la siguiente**. No se avanza de fase sin aprobación.

### Fase 0 — PoC de módulo nativo (Android solamente)

- **Objetivo**: demostrar que el fetch de todas las feeds puede correr en un módulo
  nativo de Android sin bloquear la UI y sin worker duplicado.
- **Alcance**:
  - Un **botón** inicia el **fetch de todas las feeds en el módulo nativo**.
  - El módulo **no devuelve bodies**: solo un **resultado corto**, del tipo
    `15 feeds descargadas correctamente, 2 fallaron`.
  - **El guard anti-duplicado vive en el módulo nativo**, no solo en la UI: varias
    pulsaciones del botón **no deben iniciar múltiples workers** aunque lleguen
    directo a la API nativa.
  - La PoC **no persiste resultados** (no toca SQLite ni AsyncStorage ni filesystem).
- **Criterios de aceptación**:
  - La UI permanece **responsiva** durante el fetch.
  - Con múltiples pulsaciones **solo hay una ejecución** activa.
  - El resultado nativo llega a JS con el resumen corto (éxitos/fallos por feed).
  - **Build de Android OK** (`expo run:android` o build equivalente de la app sin errores).
- **Pruebas**:
  - Manual: tocar el botón repetidas veces durante una corrida y verificar una sola
    ejecución + UI fluida.
  - Manual: verificar el mensaje resumen con feeds reales (incluida alguna fallida).
  - Build: compilación Android correcta.

### Fase 1 — SQLite + migración idempotente desde AsyncStorage

- **Objetivo**: introducir SQLite como almacén canónico sin cambiar el flujo de
  usuario actual.
- **Alcance**:
  - Añadir SQLite (package y owner de DB/selección pendientes: ver sección 8).
  - **Migración idempotente desde AsyncStorage** hacia SQLite de **la lista de
    feeds**, los **snapshots**, la **metadata/índice de la cache de artículos** y el
    **estado de ranking/último refresh** (este último **solo si se decide que pasa a
    SQLite**; ver sección 8), manteniendo **el flujo actual funcionando en JS**.
    **No se migran settings ajenos a este flujo.**
  - **Conservar el origen (AsyncStorage) hasta validar** la migración; no borrarlo
    todavía.
  - **El HTML de artículos se queda en filesystem** (no cambia en esta fase).
- **Criterios de aceptación**:
  - Tras la migración, la app lee feeds/snapshots desde SQLite y se comporta igual
    que antes.
  - Ejecutar la migración **varias veces seguidas** o **interrumpida y reintentarla**
    no duplica ni corrompe datos (idempotencia).
  - AsyncStorage sigue intacto como origen de respaldo hasta validar.
- **Pruebas**:
  - Automatizadas: idempotencia de la migración (correr dos veces, datos idénticos);
    simulación de migración interrumpida + reanudación.
  - Manuales: la lista de feeds y snapshots se ven igual que antes en la app.

### Fase 2 — Generaciones sobre el flujo JS actual

- **Objetivo**: modelar generaciones (activa / construyéndose / READY pendiente /
  obsoleta) usando el `FeedService` JS existente, y medir el impacto de UI.
- **Alcance**:
  - Introducir el concepto de **generación** con sus estados, en SQLite, **usando
    FeedService en JS** (todavía sin worker nativo).
  - **Desactivar solo la precarga masiva de artículos** (top 5 de
    `fetchAndCacheAllFeedsRanked`) como **flag/config de test**.
  - **Mantener intactos** el artículo **on-demand** (`ArticleService`) y la **ruta
    `app/shared/[article_url].tsx`**.
  - **Medir fetch/parsing contra la UI** (cuánto se congela JS durante refresh).
- **Criterios de aceptación**:
  - El modelo de generaciones persiste en SQLite y sobrevive reinicios.
  - Con el flag de precarga apagado, la navegación sigue funcionando contra la
    generación activa sin waits.
  - Las métricas de duración de fetch/parse en JS quedan registradas (justifican el
    worker nativo).
  - On-demand y shared route sin cambios funcionales.
- **Pruebas**:
  - Automatizadas: transiciones de estado de generación (creada → construyéndose →
    READY / incompleta obsoleta) según las reglas de la sección 3.1.
  - Manuales: refresh con y sin flag de precarga; observar la UI durante el fetch.

### Fase 3 — Worker nativo de refresh + parseo de feeds

- **Objetivo**: mover el refresh y parseo de feeds al worker nativo persistiendo
  snapshots y status por feed en SQLite.
- **Alcance**:
  - El **worker nativo** hace **fetch + parseo de todas las feeds** y **escribe los
    snapshots y el status por feed directamente en SQLite**.
  - **Un solo worker a la vez**, con guard nativo (establecido en la fase 0),
    también ante foreground/taps duplicados.
  - JS pasa a **leer** los resultados; abandona gradualmente el parseo propio.
  - Feeds **fallidas quedan flagueadas**, sin retries automáticos.
- **Criterios de aceptación**:
  - Un refresh completo corre sin trabajo de red/parseo en el hilo de JS.
  - Los snapshots en SQLite son equivalentes a los que producía JS (misma info de
    lista).
  - La UI no se congela durante el refresh (medible frente a la fase 2).
  - Las reglas 3.1 (reanudar mismo ID si no vencidas; obsoleta si vencidas) se
    cumplen con el worker nativo.
- **Pruebas**:
  - Automatizadas: parseo de XML en nativo contra fixtures (casos: feed válida,
    malformed, parcial, vacía).
  - Manuales: doble tap / foreground duplicado → una sola ejecución; feeds parciales
    (alguna falla) → status correcto; la lista activa visible permanece vieja hasta
    aplicar.

### Fase 4 — Worker nativo de artículos (todos los de la generación)

- **Objetivo**: tras el parseo de feeds, el worker nativo descarga **todos** los
  artículos de la generación, con dedup, temporales+rename y metadata.
- **Alcance**:
  - Cola de artículos de la generación con **deduplicación por URL**.
  - Ciclo completo de la sección 3.3: `file exists` → temporal → **rename al final
    en el mismo filesystem** → leer final → **extraer metadata → persistir en
    SQLite**.
  - **Reconciliación** tras cierre entre final-file y metadata (leer archivo y
    regenerar metadata).
  - **Limpieza de temporales huérfanos** con reintento.
  - **Soportar URLs compartidas fuera de feeds como artículo global** (el mismo
    mecanismo sirve a la ruta `shared/[article_url]`; un artículo puede existir sin
    feed).
  - Artículos fallidos quedan flagueados, sin retries automáticos.
- **Criterios de aceptación**:
  - Una generación pasa a READY solo cuando su corrida terminó; los artículos
    incompletos/fallidos quedan marcados.
  - Interrupciones en cada punto del ciclo (ver 3.3) recuperan correctamente en el
    siguiente foreground.
  - La URL duplicada en varias feeds se descarga una sola vez y las referencias
    quedan correctas.
  - `shared/[article_url]` y on-demand siguen funcionando con el nuevo almacén.
- **Pruebas**:
  - Automatizadas: ciclo temporal→rename; interrupción antes de temporal, durante
    descarga, tras final-file y antes de metadata; reconciliación; dedup de URLs.
  - Manuales: matar la app a mitad de la corrida de artículos y reabrir → foreground
    reanuda según reglas 3.1/3.4 (misma ID si no vencida; obsoleta si vencida,
    reutilizando solo archivos completos referenciados por la nueva generación).

### Fase 5 — Apply-to-toast transaccional + GC

- **Objetivo**: cerrar el flujo de usuario: el tap del toast aplica la generación de
  forma transaccional y se recolecta la basura respetando referencias.
- **Alcance**:
  - **Aplicación transaccional** al tocar el toast: cambia el puntero de generación
    activa en una transacción SQLite.
  - **GC de generaciones/artículos** ejecutada **solo al aplicar**, según la
    sección 3.2:
    - borrar **registros** de generaciones **anteriores a la activa**;
    - borrar **archivos HTML solo si no tienen referencias** en activa o futuras.
  - Se **puede diseñar/implementar GC feed-only antes** (p. ej. durante fase 3) por
    conveniencia, **pero nunca borrando generaciones activas ni futuras**.
  - **El status de aplicación y los deletes deben poder recuperarse si el proceso
    termina a mitad**: la transacción de apply deja el sistema en estado consistente
    (activa nueva, o activa vieja intacta) y los archivos sin referencia se
    re-colectan en la siguiente oportunidad; nada de esto puede dejar registros
    apuntando a HTML borrado.
  - Toast persistente con generación READY pendiente, que sobrevive restart de la
    app.
- **Criterios de aceptación**:
  - Tap del toast → la nueva generación queda activa al instante; la anterior se
    limpia según reglas; el toast desaparece.
  - Muerte del proceso durante apply/GC → al reabrir, el estado es consistente y la
    GC se completa sin borrar referencias vivas.
  - Generación READY + generación construyéndose pueden coexistir sin que la GC
    toque a ninguna de las dos.
- **Pruebas**:
  - Automatizadas: apply transaccional (éxito y rollback); GC no borra archivos con
    referencia en activa/futuras; GC solo elimina archivos huérfanos; interrupción
    entre apply y deletes → recuperación.
  - Manuales: flujo completo real — refresh → READY → toast visible tras restart →
    tap → generación nueva activa; la lista activa permanece visible durante todo el
    proceso.

## 5. Casos de prueba transversales (aplicar en cada fase donde apliquen)

- **Doble tap / llamadas duplicadas** al worker → una sola ejecución (guard nativo).
- **UI responsive** durante fetch/parse/download.
- **Feeds parciales** (algunas fallan) → éxitos y fallos quedan identificados.
- **La lista activa permanece** visible e inmutable hasta el apply.
- **Toast persistente tras restart** de la app.
- **Incomplete resume solo si las feeds no están vencidas** (mismo ID de generación).
- **Stale incomplete superseded**: URLs nuevas **y mismas URLs** se reutilizan solo
  si están completas y referenciadas por la nueva generación.
- **DB migration repetida e interrumpida** → idempotencia y recuperación.
- **Interrupciones en file temp/final** de artículos → reconciliación correcta.
- **Metadata recovery** leyendo el archivo final cuando falta la fila de metadata.
- **Shared route** (`app/shared/[article_url].tsx`) sigue funcionando como artículo
  global.
- **GC no borra referencias** de generaciones activas ni futuras.

## 6. Fuera de alcance (por ahora)

- **iOS**: no se implementa. Todo lo nativo es Android.
- **Continuación garantizada en background/tras termination del SO**: no se
  garantiza; solo se persiste estado para recuperar en el próximo foreground.
- **Retries automáticos** de feeds o artículos: no.
- **Filename collision-proof**: tech debt explícita, no se resuelve ahora.

## 7. Notas de operación

- **Trabajar fase a fase**: implementar, probar (automatizado + manual) y **esperar
  la aprobación explícita del usuario antes de pasar a la siguiente fase**.
- El **AGENTS.md del repositorio prohíbe al agente hacer commits o cualquier
  modificación de estado de Git** (no `git add`, no `git commit`, no `git push`).
  Solo se permiten comandos Git de lectura. **El usuario comitea.**
- Mantener este documento actualizado si un acuerdo cambia o si se resuelve alguna
  decisión de la sección 8 (registrar la decisión y su fecha, no reescribir
  historia).

## 8. Decisiones pendientes antes de ejecutar fase 1

Ninguna de estas está cerrada. **No inventar decisiones; acordarlas con el usuario
al iniciar la fase 1.**

1. **SQLite package / DB owner**: qué librería usar (p. ej. expo-sqlite vs un
   driver propio del módulo nativo) y **quién es el dueño de la base de datos**,
   dado que tanto JS como el worker nativo necesitarán acceso.
2. **Cómo nativo y JS comparten la DB y las migrations**: esquema de migrations
   (quién las corre al iniciar, versionado, y qué pasa si nativo y JS abren la misma
   DB), incluyendo el mecanismo de lock para escrituras concurrentes.
3. **Freshness timestamps**: idealmente **a nivel de feed** (última descarga
   correcta / último intento), pero **por ahora solo con flags de fallo y sin retries
   automáticos**. Falta acordar el formato exacto y qué define "vencidas".
4. **Snapshot a mostrar para feeds fallidas**: política de qué contenido se muestra
   cuando una feed falla en la nueva generación (mantener snapshot anterior de esa
   feed, mostrarla vacía, u otra) — pendiente, solo si hace falta decidirlo para
   fase 3.

---

## 9. Addendum (2026-10-04) — Arquitectura cerrada y etapas con aprobación manual

**Alcance de este addendum:** a partir de hoy **sustituye las fases técnicas de la
sección 4 y las decisiones pendientes de la sección 8**. El texto original se
conserva íntegro y no se reescribe historia: queda como referencia del proceso. Lo
que sigue es el plan de ejecución vigente. Cualquier punto de la sección 8 no
resuelto aquí se acuerda con el usuario al llegar la etapa correspondiente; **no se
inventa**.

### 9.1 Arquitectura acordada

- `@noticioso-feedList` (`FEEDS_LIST_KEY`, `services/FeedService.ts`) **se queda en
  AsyncStorage**: no pasa a SQLite y ninguna etapa lo migra.
- **SQLite es la fuente canónica** para: estado del refresh, **snapshots de feeds**,
  **items por feed**, **metadata de artículos** y **estado de descarga**.
- El **HTML de artículos permanece en filesystem** (`expo-file-system`, como hoy).
  No pasa a SQLite.
- El **article ranking NO forma parte del esquema final** (hoy vive en
  `@noticioso-article-ranking`, `services/ArticleRankingService.ts`): el esquema
  final de SQLite no le añade tabla ni columna.
- Nuevo directorio **`infrastructure/`**: apertura de la DB, migraciones,
  repositories y **adaptadores de storage/filesystem/nativo**. Los **services**
  (`services/`) quedan para **orquestar la lógica de negocio**.
- Orden al iniciar: **las migraciones JS corren antes que los consumidores de la
  app y antes que el worker nativo**; el nativo, más tarde, **abre el mismo archivo
  SQLite**.

### 9.2 Etapas (cada una gateada por pruebas y aprobación manual del usuario)

Regla transversal: no se pasa a la siguiente etapa sin **pruebas (automatizadas
donde apliquen + manuales) y aprobación explícita del usuario**.

#### Etapa 1 — AHORA: infraestructura SQLite + migración idempotente, flujo intacto

- Crear `infrastructure/` (DB, apertura, migraciones, repositories) y migrar a
  SQLite de forma **idempotente**: los **snapshots del feed cache**
  (`@noticioso-feedCache-*`), el **timestamp del último refresh**
  (`@noticioso-lastFullRefresh`) y la **metadata/índice de artículos**
  (`@noticioso-articleHtmlCache-index`).
- **La clave `@noticioso-feedList` queda intocada.**
- Las **claves originales de AsyncStorage** de lo migrado se **conservan como
  respaldo** hasta que el **usuario valide manualmente**.
- **El flujo visible al usuario es exactamente el actual**, incluida la
  **precarga automática de los top 5**, que se mantiene igual por paridad.
- **Ningún cambio de worker de artículos** en esta etapa.
- **Puerta de salida:** pruebas + **aprobación manual del usuario** antes de la
  Etapa 2.

#### Etapa 2 — Fetch + parseo nativo (Kotlin), apply transaccional por toast

- **Solo fetch + parseo de feeds en Kotlin** (nativo, Android).
- Se guardan en SQLite el **estado de refresh pendiente** y los **status de
  éxito/fallo por feed**.
- El **refresh activo permanece visible hasta que el toast existente es tocado**;
  entonces **una transacción SQLite conmuta el puntero activo**.
- En esta etapa se **desactiva la precarga automática de los top 5**, y se
  **preserva la carga on-demand de artículos en JS** (`ArticleService`).
- **Freshness de feeds: una hora** (una feed está vencida pasado 1 h).
- **Puerta de salida:** prueba manual + **aprobación del usuario** antes de la
  Etapa 3.

#### Etapa 3 — Descargador nativo de artículos

- El descargador nativo de artículos **arranca después del refresh de feeds,
  independientemente del toast** (no espera al apply).
- Nativo y JS **comparten** la **metadata en SQLite y el HTML en filesystem**: el
  nativo **verifica fila + archivo** antes de descargar; escribe con **temporal +
  rename atómico**; y **notifica la finalización feed a feed**.
- El **on-demand de JS comparte** esa caché y **se deduplica por URL** con el
  trabajo nativo.
- **Todavía no hay UI ni clave de estado de completitud** del caché.
- **Puerta de salida:** prueba manual + **aprobación del usuario** antes de la
  Etapa 4.

#### Etapa 4 — GC consciente de referencias; fuera límite de 300 y LRU

- **GC de huérfanos consciente de referencias, después del apply.**
- Se **elimina el límite actual de 300 artículos y su LRU** (`MAX_ARTICLES`,
  `services/ArticleCacheService.ts`).
- Se **borran metadata y HTML solo si la URL no está referenciada** por los
  **snapshots de feed actuales o retenidos**, ni por **trabajos activos**.
- **Confirmado por el usuario:** los artículos cacheados **sin referencia** (p. ej.
  los de la ruta `shared/[article_url]`) **no requieren retención**; **se vuelven a
  descargar on-demand** cuando el usuario los abra.
- **Puerta de salida:** prueba manual + **aprobación del usuario**.

### 9.3 Aplazados y cleanup

- El **status de completitud del feed cache queda aplazado**: podrá **derivarse más
  adelante** a partir de los datos ya guardados.
- Los **fallos de fetch por feed se almacenan desde ya** (Etapa 2) en SQLite, pero
  **sin UI todavía**.
- Los **orígenes de caché en AsyncStorage** migrados en la Etapa 1 **se conservan
  durante la validación de esa etapa**; la **limpieza ocurre solo con aprobación
  explícita del usuario**.
