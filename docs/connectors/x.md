# Conector de X · ficha verificada

Verificado el **2026-11-09** contra docs.x.com (precios, `POST /2/tweets` y subida de medios).

## 1. Publicación

- `POST https://api.x.com/2/tweets` con JSON: `text` (obligatorio salvo que haya medios),
  `media.media_ids` y `reply.in_reply_to_tweet_id`. Respuesta `201` con `data.id`.
  Scopes OAuth 2.0: `tweet.read`, `tweet.write` y `users.read`; además `offline.access` para el
  refresh token y `media.write` para subir medios (este último **[no confirmado]** en la página
  del endpoint; lo cita una fuente secundaria).
- Medios: hasta **4 fotos**, **1 GIF** o **1 vídeo** por post. El esquema permite hasta 20 IDs,
  pero la descripción oficial dice 4, 1 y 1; se sigue la descripción.
- Subida v2 por fragmentos, bajo `https://api.x.com/2/media/upload`:
  1. `POST /initialize` con JSON: `media_type`, `total_bytes`, `media_category`.
  2. `POST /{id}/append` con multipart: `segment_index` y `media`; trozos de hasta 5 MB.
  3. `POST /{id}/finalize`.
  4. Si hay `processing_info`: `GET /2/media/upload?command=STATUS&media_id=…`, esperando
     `check_after_secs`, hasta `succeeded` o `failed`.
- Categorías y límites: `tweet_image` 5 MB; `tweet_gif` 15 MB; `tweet_video` 20 min y 8 GB
  (125 min y 16 GB con Premium). Si el vídeo excede la duración permitida, responde 403.
- Longitud del texto **[no confirmado]**: la página de `POST /2/tweets` no indica límite. Se usa
  280 (cuentas sin Premium). Las cuentas Premium admiten más, por lo que la app solo avisa.
- Hilos: se publican como respuestas encadenadas. Esta fase publica un único post.
- La API no programa: lo hace el planificador de la app.
- Límites de peticiones por usuario o aplicación **[no confirmado]**: la página no los incluye.

## 2. Métricas

La lectura de posts propios es de **pago por lectura** (unos 0,001 $ por recurso en datos propios
y 0,005 $ en lecturas generales). Para no generar gasto sin que el usuario lo sepa, **esta fase no
consulta métricas de X**: el conector declara `metrics: false`.

## 3. Tipo de cuenta

Cualquier cuenta de X. La app de desarrollador se crea en la Developer Console.

## 4. OAuth

OAuth 2.0 con código de autorización y **PKCE** (S256). Autorización
`https://x.com/i/oauth2/authorize`, token `https://api.x.com/2/oauth2/token`. App de tipo nativo
(cliente público) o confidencial (con secreto); la app acepta ambos. Redirección
`http://127.0.0.1:47823/callback`, que debe estar registrada tal cual en la app **[no confirmado]**
en la documentación leída hoy. El access token dura unas 2 horas; con `offline.access` hay refresh
token. **[no confirmado]**: la app asume que cada renovación devuelve un refresh token nuevo y lo
guarda siempre.

## 5. Revisión de la app

No hay revisión manual para publicar con tu propia cuenta.

## 6. Coste (importante)

X cobra **por uso, sin suscripción ni nivel gratuito** en la documentación de precios leída hoy.
Se compran créditos por adelantado en la Developer Console; con saldo negativo las peticiones se
bloquean.

| Acción                            | Precio  |
| --------------------------------- | ------- |
| Publicar un post                  | 0,015 $ |
| Publicar un post con enlace (URL) | 0,200 $ |
| Lectura de un post                | 0,005 $ |
| Lectura de datos propios          | 0,001 $ |

La app avisa en el compositor cuando un post de X lleva enlace, porque es unas 13 veces más caro.
Los precios pueden cambiar: la fuente vigente es la Developer Console.

## 7. Errores que la app traduce

401: reconectar. 402 o 403 por crédito agotado o límite de gasto: "sin saldo en la cuenta de
desarrollador". 429: límite de peticiones. 403 por duración del vídeo: mensaje claro.
