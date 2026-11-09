# Conector de TikTok · ficha verificada (solo lectura)

Verificado el **2026-11-09** contra developers.tiktok.com (Display API overview, Get Started with
Display API, Get User Info, List Videos, Video Object, Add a sandbox). Solo cubre **leer datos de
la cuenta propia**. La app no publica en TikTok (ADR 0002).

## 1. Qué se puede leer

- `GET /v2/user/info/`: `display_name`, `username`, `bio_description`, `is_verified` y, con
  `user.info.stats`, `follower_count`, `following_count`, `likes_count` y `video_count`.
- `POST /v2/video/list/` (scope `video.list`): vídeos públicos del usuario, del más reciente al más
  antiguo, máximo 20 por página con cursor. Campos del objeto vídeo: `id`, `create_time`,
  `title`, `video_description` (máximo 150), `duration`, `width`, `height`, `share_url`,
  `cover_image_url` (caduca a las 6 h), `view_count`, `like_count`, `comment_count`,
  `share_count`, `is_aigc`.
- La documentación habla de los datos del usuario que autoriza. **[no confirmado]** que solo
  devuelva la cuenta propia, aunque así lo indica el flujo de autorización.

## 2. Acceso

- Cuenta en TikTok for Developers, app con **Login Kit** y el producto de Display API, y los
  scopes concedidos. La guía exige "approval" de ambos productos.
- **Sandbox:** entorno restringido sin revisión, con hasta 10 cuentas propias como usuarios de
  prueba. Permite Login Kit. **[no confirmado]** que incluya la Display API.
- **[no confirmado]** si Login Kit acepta una dirección de retorno local (`127.0.0.1`) para una
  app de escritorio. Se comprobará en la práctica.
- Coste: la documentación no menciona ninguno.

## 3. Plan

Empezar en **manual** (capturas). Probar la vía automática con el sandbox. Si no funciona sin
revisión o sin servidor web, TikTok se queda manual.
