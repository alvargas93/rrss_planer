# Conector de YouTube · ficha verificada

Verificado el **2026-11-09** contra la documentación oficial de Google (YouTube Data API v3,
YouTube Analytics API y OAuth 2.0 para apps de escritorio). Lo marcado **[no confirmado]** o
**[contradictorio]** no se pudo comprobar en la documentación y se trata con cautela en el código.

## 1. Publicación

- Método: `videos.insert`, subida **reanudable**
  (`POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`).
  1. Se abre la sesión con las cabeceras `X-Upload-Content-Length` y `X-Upload-Content-Type` y el
     recurso `video` en JSON.
  2. La respuesta `200` trae la cabecera `Location` (URI de sesión, de vida limitada).
  3. `PUT` de los bytes a esa URI. Éxito: `201` con el vídeo. Si se corta la conexión o hay
     500/502/503/504: se consulta el estado con un `PUT` vacío y `Content-Range: bytes */TOTAL`;
     un `308` con cabecera `Range` indica lo recibido. Un `404` obliga a empezar de nuevo.
  4. Subida por trozos: tamaño múltiplo de 256 KB (salvo el último).
- Tamaño máximo: 256 GB. Tipos MIME aceptados: `video/*` y `application/octet-stream`.
- **Cuota** **[contradictorio]**: la página de `videos.insert` leída hoy habla de "1 unidad" y
  "100 llamadas al día" en el cubo de subidas; la tabla general de cuota de la API cuesta la
  subida en unidades mucho mayores. La app asume el peor caso y no se apoya en una cifra.
- **Programar**: `status.publishAt` (ISO 8601) junto con `privacyStatus: "private"`; YouTube lo
  publica solo a esa hora. Es la única red de las cuatro con programación nativa, así que la app
  puede subirlo con antelación y no depende de estar abierta. **[no confirmado]** en la página
  leída: la condición de que deba ser `private` viene del comportamiento conocido de la API; la
  página solo cita el error `invalidPublishAt`.
- Sin `privacyStatus`, el vídeo es **público** por defecto. La app lo envía siempre explícito.
- Campos: `snippet.title` (obligatorio; la app limita a 100), `snippet.description` (la app limita
  a 5.000), `status.selfDeclaredMadeForKids` (la app lo envía siempre como "no").
- Shorts: no hay endpoint propio. Es un vídeo vertical corto; YouTube lo clasifica solo.
  **[no confirmado]** en documentación oficial el límite de duración vigente, por eso la app no
  lo valida.
- **Restricción de proyectos no verificados** **[contradictorio]**: fuentes secundarias dicen que
  los vídeos subidos con `videos.insert` desde proyectos de API no auditados creados después del
  28-07-2020 quedan bloqueados en privado. La página oficial leída hoy afirma lo contrario
  ("not restricted to private viewing mode"). Decisión: tras subir, la app lee
  `status.privacyStatus`; si no coincide con lo pedido, avisa de que YouTube ha restringido el
  vídeo y de que haría falta la auditoría de cumplimiento de la API.

## 2. Métricas

- YouTube Analytics API: `GET https://youtubeanalytics.googleapis.com/v2/reports` con
  `ids=channel==MINE`, `startDate`, `endDate`, `metrics`, `dimensions=day`. La respuesta trae
  `columnHeaders` y `rows`; las dimensiones van primero. Los últimos días pueden no tener datos.
- Métricas de canal usadas: `views`, `estimatedMinutesWatched`, `likes`, `comments`, `shares`,
  `subscribersGained`, `subscribersLost`.
- Scopes: `yt-analytics.readonly` y `youtube.readonly` (la página de referencia menciona el
  segundo para este endpoint).
- Seguidores: `channels.list?part=snippet,statistics&mine=true` (1 unidad de cuota).
  **[no confirmado]** los detalles de `statistics` en la página leída; YouTube redondea el número
  de suscriptores de canales grandes.

## 3. Tipo de cuenta

Cualquier canal de YouTube. El usuario autoriza con su cuenta de Google y elige el canal.

## 4. OAuth

- App de escritorio: redirección **loopback** (`http://127.0.0.1:puerto`, puerto libre) y
  **PKCE** (S256, verifier de 43 a 128 caracteres). Endpoints: autorización
  `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`,
  revocación `https://oauth2.googleapis.com/revoke`.
- Las apps de escritorio son clientes públicos; `client_secret` figura como opcional en la
  documentación del endpoint de token. La app acepta ambos casos.
- Refresh token siempre devuelto en apps instaladas. El access token dura unos 60 minutos; la
  app lo renueva antes de cada uso.
- **[no confirmado]** en la página leída: con la pantalla de consentimiento en estado "Testing",
  el refresh token caduca a los 7 días. Mitigación: pasar la app a "En producción" (uso personal,
  con el aviso de app no verificada).
- Scopes: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`.

## 5. Revisión de la app

Para uso personal no hace falta revisión; aparece el aviso "Google no ha verificado esta
aplicación" y el usuario continúa. Ver §1 para la auditoría que podría exigirse.

## 6. Coste y límites

Gratis. Hay una cuota diaria por proyecto; la app trata `quotaExceeded` como "cupo agotado".

## 7. Errores que la app traduce

Token revocado o caducado (`invalid_grant`, 401): pedir reconectar. `quotaExceeded` (403): cupo
diario agotado. Formato no válido: mensaje claro. Cortes de red: reanudar la subida.

## 8. Programación nativa (conectada el 2026-11-09)

Si el destino sale en las próximas 24 h (y con al menos 15 minutos de margen), la app sube el vídeo como privado con status.publishAt y YouTube lo publica a su hora. No cuesta más cuota que una subida normal. Si falla la subida anticipada, se reintenta y, en último caso, se publica a la hora prevista como en las demás redes.
