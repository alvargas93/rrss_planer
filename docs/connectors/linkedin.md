# Conector de LinkedIn · ficha verificada

Verificado el **2026-11-09** contra Microsoft Learn (LinkedIn API: Share on LinkedIn, Posts API,
Images API, Videos API, OAuth de tres patas y Sign In with OpenID Connect).

## 1. Publicación

- Producto **"Share on LinkedIn"** (autoservicio, se añade en la pestaña _Products_ de la app):
  concede `w_member_social`, que permite crear publicaciones **como el propio miembro**. No hay
  aprobación manual.
- Endpoint actual: `POST https://api.linkedin.com/rest/posts` (sustituye a `ugcPosts`).
  Cabeceras obligatorias: `Authorization: Bearer`, `Linkedin-Version: AAAAMM` y
  `X-Restli-Protocol-Version: 2.0.0`. Respuesta `201`; el id va en la cabecera `x-restli-id`.
- Versión de API: se usa `202610`, la última listada hoy. La versión `202511` se retira el
  2026-11-16, así que la versión es una constante fácil de subir.
- Cuerpo de texto: `author` (`urn:li:person:{id}`), `commentary`, `visibility: PUBLIC`,
  `distribution.feedDistribution: MAIN_FEED`, `lifecycleState: PUBLISHED`,
  `isReshareDisabledByAuthor: false`.
- Imagen: `POST /rest/images?action=initializeUpload` (`owner` = persona) devuelve `uploadUrl` y
  `urn:li:image:…`; se suben los bytes a esa URL; el post lleva `content.media.id` y `altText`.
  Formatos JPG, PNG y GIF; menos de 36.152.320 píxeles.
- Vídeo: `POST /rest/videos?action=initializeUpload` con `fileSizeBytes` devuelve varias
  `uploadInstructions` (partes de 4 MB, `PUT` con `Content-Type: application/octet-stream`; cada
  respuesta trae un `ETag`). Luego `finalizeUpload` con `uploadToken` y los ETags en orden, y se
  espera a `status: AVAILABLE` (`GET /rest/videos/{urn}`; también existe `PROCESSING_FAILED`).
  Formato MP4, de 3 s a 30 min y de 75 KB a 500 MB. Las URLs de subida caducan hacia los 30 días.
- Los medios **se suben directamente desde el equipo**: no hace falta alojamiento público.
- Límite del texto **[no confirmado]**: la documentación solo cita el error
  `FIELD_LENGTH_TOO_LONG`. Se usa 3.000, el valor conocido de LinkedIn.
- Programación: la API no programa. Lo hace el planificador de la app o el modo manual.
- Límites de peticiones (Share API): 150 por miembro al día y 100.000 por aplicación al día (UTC).

## 2. Métricas

**No hay métricas por API en autoservicio.** Leer las publicaciones propias exige
`r_member_social`, que está **restringido a usuarios aprobados**. El conector declara
`metrics: false`.

## 3. Tipo de cuenta

Perfil personal. Publicar como página de empresa requiere `w_organization_social` y rol de
administrador; no se incluye en esta fase.

## 4. OAuth

- Código de autorización de tres patas. Autorización
  `https://www.linkedin.com/oauth/v2/authorization`, token
  `https://www.linkedin.com/oauth/v2/accessToken`. El canje exige `client_id` y `client_secret`;
  la documentación no menciona PKCE.
- **[no confirmado]** que acepte `http://localhost` como redirección: la documentación dice
  "via HTTPS". Por eso hay dos vías. La primera es el flujo con servidor local en
  `http://localhost:47822/callback`. La segunda es el **generador de tokens del Developer
  Portal**, herramienta oficial documentada, que es la vía fiable.
- Access token de **60 días**. Los refresh token programáticos son solo para socios. En
  autoservicio se renueva repitiendo la autorización, que se salta el consentimiento si el
  usuario sigue conectado a LinkedIn y el token no ha caducado. La app avisa con antelación.
- Scopes: `openid profile w_member_social`. Identidad: `GET https://api.linkedin.com/v2/userinfo`
  devuelve `sub`, `name` y `picture`; el URN es `urn:li:person:{sub}`. Requiere el producto
  "Sign In with LinkedIn using OpenID Connect". Si cambian los scopes hay que reautorizar.

## 5. Revisión de la app

Los dos productos son de autoservicio. Para crear la app en el portal hace falta asociarla a una
página de empresa de LinkedIn.

## 6. Coste

Gratis.

## 7. Errores que la app traduce

401: token caducado o revocado (reconectar). 403 `ACCESS_DENIED`: falta `w_member_social`.
429: límite diario. `MEDIA_ASSET_PROCESSING_FAILED`: vídeo no válido.
