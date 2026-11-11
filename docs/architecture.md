# Arquitectura — Noticioso (Android)

Descripción vigente de cómo está construida la app. Los planes y reportes
originales de cada etapa están en `docs/history/`; los pendientes, en `TODO.md`.

## 1. La idea en una línea

**Una sola app con una frontera:** el módulo nativo (Kotlin) es el pipeline de
datos y el **único que escribe**; JS es interfaz, lecturas y configuración del
usuario.

```
┌──────────────── JS (UI + lecturas + configuración) ────────────────┐
│ app/  components/  providers/  hooks/                               │
│ services/  FeedService            lista de feeds (AsyncStorage)     │
│            FeedDiscoveryService   buscar feeds al agregar uno       │
│            FeedContentService     lee la generación activa          │
│            ArticleService         lee artículos; si falta → nativo  │
│            FeedRefreshService     dispara refresh / aplica / 1h     │
│ db/        schema + migraciones + repositorios de SOLO LECTURA      │
└───────────────────────────────┬─────────────────────────────────────┘
      API nativa (la única puerta de escritura)
      refreshFeeds · applyPendingRefresh · downloadArticle(url)
      reconcileArticleDownloads · collectGarbage · clearCaches
      isWorkerBusy  +  eventos de progreso
┌───────────────────────────────┴─────────────────────────────────────┐
│ Kotlin  modules/FeedRefreshModule/android/src/main/java/            │
│   FeedRefreshModule.kt   solo define funciones y eventos            │
│   worker/   un hilo que ejecuta todo en orden                       │
│   feeds/    bajar + parsear feeds → nueva generación                │
│   articles/ bajar artículos, limpieza (GC)                          │
│   db/       todo el SQL                                             │
└─────────────────────────────────────────────────────────────────────┘
   SQLite noticioso.db (generaciones, snapshots, jobs, metadata)
   + HTML de artículos en <cache>/article-html/
```

Regla práctica: **si algo ya lo hace el nativo, no se reimplementa en JS** (bajar
feeds, bajar artículos, extraer metadata, escribir tablas). Se agrega o se
extiende una función nativa.

## 2. Dónde vive cada dato

| Dónde | Qué | Quién escribe |
| --- | --- | --- |
| AsyncStorage `@noticioso-feedList` | La lista de feeds del usuario | JS |
| SQLite `noticioso.db` | Generaciones, snapshots de feeds, estado por feed, punteros activo/pendiente, último fetch, metadata de artículos, jobs de descarga | Nativo |
| Archivos `<cache>/article-html/` | HTML de cada artículo | Nativo |

El schema y las migraciones son de JS (`db/schema.ts`, `db/migrate.ts`) y corren
al iniciar, antes de usar el nativo. Tablas y relaciones: `db/README.md`.

## 3. Conceptos

- **Generación**: una pasada completa por todos los feeds (fila en `refreshes`).
  Estados: `building` → `ready` → `applied` → `superseded`.
- **Activa**: la generación que el usuario ve. **Pendiente**: una generación
  lista (`ready`) que espera que el usuario toque el toast.
- El usuario **sigue viendo la activa** hasta tocar el toast "Load new available
  articles"; nunca ve una generación a medio armar.

## 4. Flujos

### Refresh
1. Se dispara al abrir la app y al volver a primer plano **si el último fetch
   tiene más de 1 hora**, o a mano con el botón ⟳. Una pendiente sin aplicar
   **no** lo bloquea: las noticias viejas no sirven.
2. Nativo crea una generación, baja y parsea cada feed y guarda su snapshot.
   Un feed que falla queda marcado como fallido y **arrastra** su último
   snapshot bueno. No hay reintentos automáticos.
3. La generación pasa a `ready` y queda como pendiente (si había otra pendiente
   sin aplicar, pasa a `superseded`). JS muestra el toast.
4. A continuación nativo baja los artículos de esa generación, uno por uno.

Si el worker está ocupado cuando se pide un refresh, el pedido **se encola**
(nunca se descarta) y corre al terminar lo que estaba en curso.

### Aplicar (toque del toast)
`applyPendingRefresh` hace un intercambio atómico de punteros (pendiente →
activa, la activa anterior → `superseded`). Corre de inmediato, sin esperar una
descarga en curso. Después encola la limpieza.

### Descarga de artículos
- **Masiva**: tras cada pasada de feeds. Un job por URL en
  `article_download_jobs`; una URL que aparece en varios feeds se baja una vez.
  Descarga a archivo temporal + rename atómico, y metadata (imagen, autor,
  título, resumen) a SQLite.
- **Si la app muere a mitad de descarga**: al abrir o volver a primer plano,
  `reconcileArticleDownloads` retoma los jobs sin terminar.
- **A demanda** (`downloadArticle`): cuando el usuario abre un artículo que no
  está en caché (incluida la ruta `shared/`). Usa el mismo código de descarga,
  pero fuera del worker serial para que el lector no espere detrás de una
  descarga masiva.
- Un artículo cuenta como cacheado cuando tiene **metadata y archivo**.
- El indicador junto a un feed aparece cuando **ya se intentó bajar cada
  artículo** de ese feed en la generación activa (cada job terminó en
  `completed` o `failed`): **●** si se bajó al menos uno, **○** si fallaron
  todos (por ejemplo un sitio que rechaza la descarga). Al aplicar una
  generación nueva ningún feed lo tiene hasta que sus descargas se intentan. Se
  calcula al momento desde `article_download_jobs`, no se guarda.

### Limpieza (GC)
Corre después de cada aplicar y una vez al abrir la app (por si una limpieza
anterior quedó interrumpida; se puede repetir sin efectos). Conserva solo la
generación activa y la pendiente, y los artículos que ellas referencian; borra
el resto: generaciones viejas con sus filas hijas, metadata y archivos HTML
huérfanos, y temporales de descargas interrumpidas.
- Primero las filas (una transacción) y después los archivos.
- Si no puede leer el snapshot de algún feed, no borra artículos.
- Un artículo abierto a demanda que no está en ningún feed se conserva durante
  la sesión en curso y se borra en una sesión posterior.

### Borrar cachés (Settings)
`clearCaches` borra las tablas de inmediato (una descarga en curso lo detecta y
se detiene en el siguiente artículo) y, ya en el worker, borra los archivos. La
lista de feeds no se toca.

## 5. El worker nativo

`worker/SerialWorker.kt`: **un solo hilo** ejecuta refresh de feeds, descargas
masivas, reconciliación y limpieza, de a una tarea por vez, en orden de llegada.
- Pedidos repetidos del mismo tipo no se acumulan en la cola.
- Cuando la cola se vacía emite `onArticleWorkerIdle`. Es el evento final
  garantizado: la UI lo usa para apagar indicadores de progreso aunque se haya
  perdido algún evento intermedio.
- Los eventos son avisos; la fuente de verdad son SQLite y los archivos. La UI
  recalcula al enfocar la pantalla.

Quedan fuera del worker, a propósito: `applyPendingRefresh` (inmediato),
`downloadArticle` (a demanda) y el primer paso de `clearCaches`. La descarga a
demanda y la limpieza se coordinan en `articles/OnDemandDownloads.kt`.

## 6. Contratos entre JS y Kotlin

Los dos lados comparten una base y una carpeta de archivos. Lo que deben
calcular igual está fijado en `modules/FeedRefreshModule/contract/` y lo leen un
test de Jest **y** un test de Kotlin, así que cambiar un solo lado rompe un test
en vez de romper la app en silencio:

| Archivo | Qué fija |
| --- | --- |
| `database.json` | Carpeta y nombre de la base (`SQLite/noticioso.db`) |
| `article-file-names.json` | Carpeta de artículos y nombre de archivo para cada URL |
| `feed-snapshot.json` | El JSON que nativo guarda en `feed_snapshots.data` y JS lee |

## 7. Mapa de carpetas

```
app/          rutas (expo-router)                __tests__/   tests de pantallas
components/   providers/   theme/   types/
hooks/        useRefreshLifecycle (ciclo de refresh, progreso, toast)
              useFeedCacheStatus (conteos e indicador ●), useFeedContent, ...
services/     lógica JS (una clase + singleton por archivo, dependencias por constructor)
db/           SQLite desde JS: schema, migraciones, repositorios de solo lectura
lib/          helpers puros; lib/webview/ = scripts que corren DENTRO del WebView
modules/FeedRefreshModule/
  src/                       bindings JS, tipos, events.ts, stub web
  contract/                  contratos compartidos
  android/src/main/java/     Kotlin (worker/ db/ feeds/ articles/)
  android/src/test/java/     tests unitarios Kotlin
scripts/android-test/        scripts para manejar la app en un emulador
docs/                        este documento; history/ = planes y reportes viejos
```

## 8. Cómo verificar un cambio

```bash
npx jest --runInBand        # tests JS (Node 22.5+; el warning de node:sqlite es esperado)
npx tsc --noEmit
npm run lint
./android/gradlew -p android :feed-refresh-module:testDebugUnitTest   # tests Kotlin (JVM)
```

En un emulador (detalle en `AGENTS.md`, sección "Emulator Testing"):
`scripts/android-test/at.sh` permite abrir, mandar a background o matar la app,
ver el estado de la base (`state`), simular que pasó tiempo (`stale 2`) y tomar
capturas. Los cambios de Kotlin requieren reinstalar
(`./android/gradlew -p android app:installDebug`); los de JS recargan con Metro.

Lo que **no** tiene tests automáticos y se verifica en el emulador: el código
Kotlin que usa SQLite (stores, worker de descarga, limpieza, aplicar, borrar
cachés).

## 9. Trampas conocidas

1. **Cambiar un contrato de un solo lado** (nombre de la base, nombre de archivo
   de artículo, formato del snapshot): hay que cambiar ambos lados y el archivo
   en `contract/`.
2. **`article_metadata` es global por URL**, sin relación con generaciones; por
   eso la limpieza decide por referencias desde los snapshots, no por
   generación.
3. **Los jobs fallidos no se reintentan.** Si se cambia, hay que revisar la
   reconciliación.
4. **No confiar en los eventos como estado**: si JS no estaba escuchando, se
   pierden.
5. **El nativo no usa `ON DELETE CASCADE`**: borra las filas hijas de forma
   explícita.
6. **Sitios que rechazan la descarga** (por ejemplo Ars Technica, HTTP 405): sus
   artículos quedan fallidos. No se intenta saltear esa protección (ver
   `TODO.md`).
