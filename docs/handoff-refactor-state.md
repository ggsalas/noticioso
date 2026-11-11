# Handoff — estado del refactor de refresh de feeds/artículos (Android)

Documento de traspaso. Su objetivo: que otro agente (o persona) pueda entender
**dónde estamos**, **cómo está construido** y **qué sigue** sin tener que leer
todo el repo ni el plan histórico.

- **Fecha del traspaso:** 2026-11-10
- **Rama:** `expo-modules-api`
- **Último commit:** `7518cad` — *Fetch articles in the background* (working tree limpio)
- **Plan histórico completo (decisiones, fases, addenda):** `docs/feed-refresh-worker-plan.md`
- **Deuda técnica abierta:** `TODO.md`

---

## 1. Estado en una línea

El pipeline de refresh **ya es nativo en su mayor parte** (feed fetch/parseo +
descarga de artículos en Kotlin) y **Stage 3 está implementado y verificado en
automático**, pero **falta la validación manual del usuario en un dispositivo
real**. **Stage 4 (GC de huérfanos) está bloqueado** hasta esa aprobación.

**No arranques Stage 4 sin la aprobación explícita del usuario.**

---

## 2. Qué está hecho (Stages 0–3)

| Stage | Qué resuelve | Estado |
| --- | --- | --- |
| 0 | PoC de módulo nativo Android (guard anti-duplicado) | ✅ |
| 1 | Baseline SQLite (`infrastructure/`), cleanup one-time de caches legacy | ✅ (se descartó la migración desde AsyncStorage) |
| 2 | Fetch + parseo de feeds en **Kotlin**, apply transaccional al tocar el toast | ✅ |
| 3 | **Descargador nativo de artículos** (temp + rename atómico + metadata + jobs + reconciliación) | ✅ código listo, ⏳ falta prueba manual del usuario |
| 4 | GC de huérfanos consciente de referencias | 🚫 **bloqueado** |

### Reglas de negocio que YA están implementadas (no re-litigar)

- `@noticioso-feedList` (la lista de feeds del usuario) **permanece en AsyncStorage**. Nunca pasa a SQLite.
- **SQLite es la fuente canónica** para: generaciones de refresh, snapshots de feed, items por feed,
  metadata de artículos y estado de descarga. **El HTML de artículos vive en filesystem** (`Paths.cache/article-html/<slug>.html`).
- La **generación activa sigue visible** hasta que el usuario toca el toast; el toast es el **único**
  disparador del apply (transacción SQLite que conmuta `active_refresh`).
- **Un solo worker nativo** a la vez (guard en Kotlin). Cola interna serializa varios `refreshId`.
- **Freshness de feeds: 1 hora** (`last_fetch_completion`).
- **Precarga top-5 desactivada**; la lectura on-demand en JS sigue activa.
- **Sin retries automáticos** (ni feeds ni artículos). Fallidos quedan flageados.
- Una **feed fallida** arrastra (carry-forward) el snapshot de la generación activa anterior.
- **Race cross-runtime on-demand JS ↔ nativo**: aceptada explícitamente (riesgo bajo). No hay lock por URL.
- **Límite de 300 artículos y LRU: eliminados** en Stage 3 (el GC es trabajo de Stage 4).

---

## 3. Mapa del código

### 3.1 Capa de datos — `infrastructure/`

```
infrastructure/
├── database.ts            # conexión SQLite (expo-sqlite); carga diferida + inyección para tests
├── schema.ts              # schema v3 (SQL DDL)
├── migrate.ts             # migraciones v1→v2→v3, idempotentes
├── initializer.ts         # cleanup legacy → migrate() → listo
├── ActiveRefreshRepository.ts     # puntero a la generación activa (id=1)
├── PendingRefreshRepository.ts    # puntero a la generación READY pendiente (id=1)
├── RefreshRepository.ts           # filas `refreshes` (building|ready|applied|superseded)
├── FeedSnapshotRepository.ts      # `feed_snapshots` (payload por feed)
├── LastFetchCompletionRepository.ts  # throttle de 1h
├── ArticleCacheRepository.ts      # `article_metadata` (global por URL) + getMetadataPresentUrls()
├── ArticleDownloadEventSubscriber.ts  # suscripción a eventos nativos desde JS
├── legacy/LegacyCacheCleanup.ts   # cleanup destructivo one-time (preserva feedList)
├── testing/RealSqliteTestDatabase.ts  # adaptador de node:sqlite para Jest
└── migrate.test.ts        # tests de schema/migraciones contra SQLite real
```

**Schema (v3):** `refreshes`, `refresh_feeds` (con `position`), `feed_snapshots`,
`active_refresh`, `pending_refresh`, `last_fetch_completion`, `article_metadata`,
`article_download_jobs` (PK compuesta `(refresh_id, url)`).
Diagrama y relaciones: `infrastructure/README.md`.

### 3.2 Módulo nativo — `modules/FeedRefreshModule/`

```
modules/FeedRefreshModule/
├── src/FeedRefreshModule.ts        # requireNativeModule + toNativeFeedInput()
├── src/FeedRefreshModule.types.ts  # tipos de eventos
├── src/FeedRefreshModule.web.ts    # stub web
└── android/src/main/java/com/ggsalas/noticiosoandroid/feedrefresh/
    ├── FeedRefreshModule.kt        # definición del módulo, worker slot, cola, eventos
    ├── ArticleDownloadWorker.kt    # cola de artículos, dedup por URL, jobs, reconciliación, eventos por feed
    ├── ArticleDownloader.kt        # descarga a temp + rename atómico + metadata
    └── ArticleMetadataExtractor.kt # extracción de metadata (paridad con JS)
```

**API nativa expuesta a JS:** `refreshFeeds(feeds)`, `reconcileArticleDownloads()`,
`clearArticleDownloadJobs()`.

**Eventos nativos:**
- `onArticleDownloadFeedStarted` → `{ refreshId, feedCount, articleCount }` (antes de procesar una feed).
- `onArticleDownloadFeedComplete` → `{ refreshId, feedUrl, feedIndex, feedCount, articleCount, articleSuccessCount, articleFailedCount }`.

Los eventos son **best-effort**: SQLite + filesystem son la fuente de verdad.

### 3.3 Servicios JS — `services/`

- `FeedService.ts` — lista de feeds en AsyncStorage; **el fetch de feeds ya no vive aquí** (lo hace Kotlin).
- `FeedRefreshService.ts` — orquesta refresh nativo + apply del toast.
- `FeedCacheService.ts` — lee snapshots de la generación **activa**.
- `ArticleCacheService.ts` — metadata + HTML; `getFullyCachedUrls()` (fila + archivo) para el indicador de completitud.
- `ArticleService.ts` — lectura **on-demand** de artículos.
- `StorageService.ts` — `clearCaches()` borra tablas SQL + archivos HTML; **nunca** toca `@noticioso-feedList`.

### 3.4 UI

- `providers/FeedsProvider.tsx` — estado compartido: `feeds`, `updating`,
  `articleDownloadProgress` (transitorio, `fetching|complete`), `feedArticleCounts`,
  `feedArticleCacheComplete`, `lastFullRefreshAt`, `shouldShowUpdateToast`,
  `refreshActiveFeedCacheState()`.
- `app/feeds/index.tsx` — pantalla de feeds:
  - El **control refresh del header** muestra `Updating feeds` o `Fetching articles X/Y` (spinner + texto);
    el subtítulo conserva `Last full update at ...`.
  - El loader del cuerpo **solo** aparece en la carga inicial sin feeds; la lista activa nunca se desmonta.
  - Círculo lleno (●) junto al nombre de la feed cuando **todos** los artículos del snapshot activo
    tienen fila de metadata **y** archivo HTML final. Se recalcula al enfocar la ruta (`useFocusEffect`)
    y tras cada evento por feed. **No se persiste ningún booleano.**
- `hooks/useFeedContent.ts` — refresca el contenido visible al recibir un evento por feed.
- `app/_layout.tsx` — reconciliación inicial al montar (tras `dbReady`) y al volver a foreground.

---

## 4. Cómo verificar un cambio

Requisitos: **Node 22.5+** (para `node:sqlite` en tests), **JDK/Android SDK** para el build nativo.

```bash
npx jest --runInBand          # 127 tests / 13 suites (warning experimental de node:sqlite es esperado)
npx tsc --noEmit
npm run lint
git diff --check

# build Android
source "$HOME/.config/zsh/env.zsh"
./android/gradlew -p android app:assembleDebug -x lint -x test \
  --configure-on-demand --build-cache -PreactNativeArchitectures=arm64-v8a,armeabi-v7a

# exportar bundle (verifica que el JS compila)
npx expo export --platform android --output-dir "$TMPDIR/noticioso-export"
```

**Instalar en un dispositivo:**
```bash
npm run android                       # debug en dispositivo
# o APK instalable:
npx eas-cli@latest build --platform android --profile preview   # profile `preview` => buildType apk
```

**Reglas del repo (`AGENTS.md`):**
- **Nunca** hacer `git add`, `commit`, `push`, `rebase`, `reset`. Solo comandos de lectura. El usuario comitea.
- Los servicios son clases con **singleton exportado** y **dependencias inyectadas por constructor sin defaults**.
- Tests: se instancia la clase directamente con dependencias mockeadas, **no** `jest.mock()` del módulo.

---

## 5. Qué falta ahora mismo (prioridad)

### 5.1 Bloqueante: aprobación manual de Stage 3 (usuario)

El usuario debe correr la app en un Android real y validar:

1. Refresh manual → aparece `Updating feeds` en el header → luego `Fetching articles X/Y`.
2. Los artículos se descargan y **abren al instante** desde caché (con metadata: hero image, título, excerpt).
3. Al volver a `/feeds`, las feeds ya completas muestran el **círculo lleno**.
4. **Matar la app** a mitad de la descarga y reabrir → la reconciliación retoma lo pendiente.
5. Artículos **on-demand** (no predescargados) y rutas **shared** (`app/shared/[article_url].tsx`) siguen funcionando.
6. Con **más de 300 artículos** todo persiste (ya no hay tope ni LRU).
7. Feed con **URL inválida** → queda flageada como fallida y arrastra el snapshot anterior.

Checklist detallado y esperado por caso: `docs/feed-refresh-worker-plan.md` §11.4.

### 5.2 Stage 4 — GC consciente de referencias (solo tras aprobación)

- Borrar filas de generaciones **anteriores a la activa** (y `feed_snapshots` / `refresh_feeds` huérfanos).
- Borrar **metadata + HTML** solo si la URL no está referenciada por snapshots activos/pendientes ni por jobs activos.
- Ejecutar el GC **después del apply** del toast, dentro de la misma transacción o de forma recuperable.
- La app debe sobrevivir a una muerte de proceso en mitad del GC (re-ejecutarlo al próximo foreground).
- Recordar: los artículos cacheados **sin referencia** (p. ej. de la ruta `shared/`) **no se retienen**;
  se vuelven a descargar on-demand.
- Atención al comportamiento de **foreign keys** en SQLite (CASCADE) — ver `TODO.md`.

### 5.3 Deuda técnica known (ver `TODO.md` para el detalle completo)

- `FeedRefreshModule.kt` (~670 líneas) mezcla definición de módulo, HTTP, parseo XML y escrituras SQLite → conviene partirlo
  (`FeedFetcher.kt`, `FeedParser.kt`, `FeedSnapshotWriter.kt`).
- `FeedPullParserHandler` no tiene **tests unitarios** (requiere fixtures RSS/Atom/RDF/CDATA/malformed).
- `FeedCacheService.delete()` es un **no-op** (deja filas de snapshot huérfanas).
- `FeedService.fetchFeedBasic/fetchAllFeeds/fetchAndCacheAllFeedsRanked` están **muertos** (Kotlin hace el fetch).
- `FeedCacheService.setLastFullRefresh()` es un no-op deprecado.
- Falta un test que **fije la ruta del archivo SQLite** (`filesDir/SQLite/noticioso.db`): renombrarla rompe el worker nativo en silencio.
- Los tests de instrumentación Kotlin (downloader/parser) **no existen**; hoy se cubre con pruebas manuales.

---

## 6. Trampas conocidas para quien siga

1. **El path de la DB es compartido JS↔Kotlin.** Si `DATABASE_NAME` cambia, el nativo abre otra base y falla **en silencio**.
2. **`article_metadata` es global por URL**, sin FK a refreshes; `article_download_jobs` sí es por refresh y se borra explícitamente en `clearCaches()`.
3. **Los jobs fallidos NO se reintentan** (semántica de "sin retries"). Si se cambia esto, hay que actualizar la reconciliación.
4. **El nombre del archivo HTML** es `encodeURIComponent(url.replace(/[^a-zA-Z0-9]/g, "_"))` en **ambos** runtimes; cambiarlo en uno solo rompe la cache compartida.
5. **La cola de artículos se serializa** por `refreshId` a nivel de módulo; no paralelizar sin volver a revisar el check-then-download.
6. **Eventos best-effort**: si JS no está montado, los eventos se pierden. La UI recalcula al enfocar la ruta — no confíes en los eventos como estado.
7. **`node:sqlite` es experimental**: el warning en los tests es normal; requiere Node ≥ 22.5.
8. **No reintroducir el mock manual de SQL en `jest.setup.js`**: los tests de DB usan SQLite real.

---

## 7. Comandos Git seguros (solo lectura)

```bash
git status
git log --oneline -10
git show --stat HEAD
git diff
```
