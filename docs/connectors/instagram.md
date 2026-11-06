# Conector · Instagram

Verificado el 2026-11-06 contra la documentación oficial de Meta
(developers.facebook.com/docs/instagram-platform). Todo lo marcado **[no confirmado]**
se comprobará en la práctica al conectar la cuenta.

## 1. Dos formas de acceso

|                                                     | Instagram API **con Instagram Login**                                                                                                                | Instagram API **con Facebook Login**                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Host                                                | `graph.instagram.com`                                                                                                                                | `graph.facebook.com` + `rupload.facebook.com`                                                        |
| Exige página de Facebook                            | No                                                                                                                                                   | Sí, vinculada a la cuenta                                                                            |
| Permisos                                            | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`, `..._manage_comments`, `..._manage_messages` | `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_read_engagement` |
| Subida de **vídeo desde archivo local** (resumable) | No documentada                                                                                                                                       | Sí ("available only for apps that have implemented Facebook Login for Business")                     |
| Imágenes desde archivo local                        | No: siempre por URL pública                                                                                                                          | No: siempre por URL pública                                                                          |

**Elegido: Instagram Login.** No obliga a tener página de Facebook y cubre publicar, insights y
comentarios. El precio es que **todo medio (imagen y vídeo) debe estar en una URL pública** en el
momento de publicar: Meta lo descarga con cURL ("must be hosted on a publicly accessible server
at the time of the attempt"). Ver §6.

## 2. Tipo de cuenta y acceso

- Cuenta **profesional** (Business o Creator). Para añadirla como cuenta de prueba debe ser **pública**.
- **Standard Access** basta para "Instagram professional accounts you own or manage" añadidas a la
  app en el App Dashboard. No hace falta App Review.
- **Advanced Access** (otras cuentas, uso comercial) exige **App Review y Business Verification**.
  Es el requisito de la v2.
- La app en Meta debe ser de tipo **Business** con el producto **Instagram → "API setup with
  Instagram business login"**.

## 3. Inicio de sesión y tokens

Dos caminos, ambos documentados:

**A. Token desde el App Dashboard (el que usamos en v1).** En "API setup with Instagram business
login" se añade la cuenta y se pulsa **Generate token**. "Access tokens from the App Dashboard
are long-lived and are valid for 60 days." Se pega en la app, que lo guarda cifrado. Ventaja:
sin servidores ni redirecciones. Inconveniente: hay que repetirlo si caduca sin refrescar.

**B. Business Login for Instagram (OAuth).** `https://www.instagram.com/oauth/authorize` con
`client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`. El código dura 1 hora y se
canjea en `POST https://api.instagram.com/oauth/access_token` (necesita `client_secret`).
El token corto dura 1 hora; se cambia por uno **largo de 60 días** en
`GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token`.
**[no confirmado]** si Meta acepta `http://localhost` como redirect URI (hay informes
contradictorios de terceros; la documentación no lo dice). Se implementa como opción
"experimental" con servidor local; si Meta la rechaza, se usa el camino A.

**Refresco.** `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`.
Condiciones: token con más de 24 h, no caducado y permiso `instagram_business_basic`.
"Tokens that have not been refreshed in 60 days will expire and can no longer be refreshed."
La app refresca automáticamente cuando queden menos de 10 días y avisa si falla.

## 4. Qué se puede publicar

Flujo siempre en dos pasos: `POST /<IG_ID>/media` (crea un contenedor) y
`POST /<IG_ID>/media_publish?creation_id=…`. Para vídeo, consultar `GET /<CONTAINER>?fields=status_code`
una vez por minuto, máximo 5 minutos (`IN_PROGRESS` → `FINISHED` → publicar). Un contenedor caduca a las 24 h.

| Formato  | Parámetros                                                                      | Requisitos del medio                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imagen   | `image_url`, `caption`, `alt_text`                                              | **Solo JPEG**, ≤ 8 MB, proporción **4:5 a 1.91:1**, ancho 320–1440 px, sRGB                                                                                                                       |
| Carrusel | hijos con `is_carousel_item=true` + contenedor `media_type=CAROUSEL&children=…` | Hasta **20** elementos según la referencia (otra sección dice 10) **[no confirmado]**; todas las imágenes se recortan como la primera (por defecto 1:1); sin `caption` ni `alt_text` en los hijos |
| Reel     | `media_type=REELS`, `video_url`, `cover_url` o `thumb_offset`, `share_to_feed`  | MP4/MOV, H.264 o HEVC, AAC, 23–60 fps, ≤ 1920 px de ancho, **3 s a 15 min**, ≤ 300 MB, 9:16 recomendado                                                                                           |
| Historia | `media_type=STORIES` + `image_url` o `video_url`                                | Imagen JPEG ≤ 8 MB; vídeo **3–60 s**, ≤ 100 MB, 9:16 recomendado. Sin `alt_text`                                                                                                                  |

- `caption`: ≤ 2200 caracteres, ≤ 30 hashtags, ≤ 20 menciones.
- `alt_text`: ≤ 1000 caracteres, solo imágenes (no reels ni historias).
- Sin filtros ni etiquetas de compra. Sin PNG: la app **convertirá a JPEG** antes de publicar (Fase 6, con FFmpeg; mientras tanto avisa).
- Cuota: "100 API-published posts within a 24-hour moving period" (otra sección dice 50)
  **[no confirmado]**; se consulta en `GET /<IG_ID>/content_publishing_limit` y la app lo muestra.
- **No hay programación nativa**: el contenedor se publica cuando la app llama a `media_publish`.
  Por tanto, la publicación programada depende de que la app esté abierta (ver §7).

## 5. Métricas (para la Fase 5)

Permiso `instagram_business_manage_insights`. Host `graph.instagram.com`.

- **Por publicación** `GET /<MEDIA_ID>/insights?metric=…`: `reach`, `likes`, `comments`, `saved`,
  `shares`, `reposts`, `total_interactions`, `views` ("in development"), `follows`,
  `profile_visits`, `profile_activity`; reels además `ig_reels_avg_watch_time`; historias
  `navigation`, `replies`, `link_clicks`. `impressions` está **deprecada** para medios creados
  después del 2 de julio de 2024. **Los carruseles no devuelven insights** ("Insights data is
  not available for any media within an album").
- **Por cuenta** `GET /<IG_ID>/insights?metric=…&period=day&metric_type=total_value`: `reach`,
  `views`, `likes`, `comments`, `saves`, `shares`, `total_interactions`, `follows_and_unfollows`,
  `profile_links_taps`, `accounts_engaged`; demografías con `period=lifetime` y `timeframe`.
  `follower_count` y demografías **no disponibles con menos de 100 seguidores**. Los datos pueden
  llegar con 48 h de retraso; se guardan 90 días.
- Límite de uso: "Calls within 24 hours = 4800 × Number of Impressions" por par app-usuario.

## 6. Decisión: alojamiento temporal de medios

Como Meta exige URL pública y no hay subida de archivos con Instagram Login, la app necesita un
sitio donde dejar el archivo unos minutos. Se define una interfaz `MediaHost` con tres
implementaciones posibles:

1. **Cloudinary (v1, recomendado).** Cuenta gratuita, tres datos (cloud name, API key, API secret)
   guardados cifrados. La app sube el archivo, publica en Instagram y **lo borra** de Cloudinary.
   Imágenes y vídeos (el plan gratuito limita el tamaño de vídeo; se verifica al implementar).
2. **S3 compatible (R2, S3, B2).** Más barato a escala, pero exige configurar bucket, permisos
   públicos y claves: lo dejamos para la v2 o para quien lo pida.
3. **Modo manual.** Si no hay alojamiento configurado o el formato no se admite, la app avisa a la
   hora programada con el texto copiado y los archivos a mano para publicar desde el móvil.

En la v2 comercial el servidor propio alojará los medios y esta pieza desaparece.

## 7. Programación y limitaciones

- La app comprueba cada minuto si hay publicaciones pendientes. Si estaba cerrada, al abrirse
  publica las atrasadas (avisando) o las marca para revisión si llevan más de 24 h.
- Para que funcione con la ventana cerrada, la app se queda en la bandeja del sistema
  (ajuste "Seguir en la bandeja al cerrar").
- Errores previstos: token caducado (reconectar), cuota agotada (reintentar al día siguiente),
  formato no admitido (convertir o manual), archivo demasiado grande (recomprimir o manual),
  URL no accesible (reintento con espera creciente, máximo 3).

## 8. Coste

Gratis. Solo cuesta el alojamiento temporal si se supera el plan gratuito de Cloudinary.

## 9. Lo que tienes que preparar

1. Cuenta de Instagram **profesional y pública**.
2. En https://developers.facebook.com: crear app → caso de uso "Other" → tipo **Business**.
3. Añadir el producto **Instagram** → "API setup with Instagram business login".
4. Añadir tu cuenta de Instagram como cuenta de prueba y aceptar la invitación en la app de Instagram.
5. Pulsar **Generate token** junto a tu cuenta y pegarlo en RRSS Planner → Cuentas.
6. (Opcional, para OAuth) apuntar el Instagram App ID y App Secret y añadir
   `http://localhost:47821/callback` en "OAuth redirect URIs".
7. Cuenta gratuita en https://cloudinary.com y copiar cloud name, API key y API secret en
   RRSS Planner → Ajustes → Alojamiento de medios.
