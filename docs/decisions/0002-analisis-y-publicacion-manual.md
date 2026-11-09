# ADR 0002 · De publicar por API a analizar, planificar y publicar a mano

- Fecha: 2026-11-09
- Estado: aceptado por el propietario (pendiente de confirmar el inicio de la Fase 9)

## Contexto

Tras la Fase 8 el propietario replantea el uso de la app. No quiere conectar cuentas para
publicar. Quiere indicar una cuenta (sobre todo la suya) de Instagram, YouTube, X, LinkedIn o
TikTok, obtener un análisis, un calendario de publicaciones (reels, historias, carruseles,
vídeos, posts) y montar las piezas en la app. La publicación la hace él a mano en cada red.

## Decisiones del propietario

1. La cuenta principal a analizar es **la suya**. Analizar otras cuentas es secundario.
2. Basta con **capturas de pantalla y nombre de usuario** como fuente de datos.
3. **X en manual**: su API de lectura es de pago.
4. **Automático solo lo gratuito**. Si una red no tiene vía gratuita, se hace a mano.

## Qué es gratuito y oficial (verificado el 2026-11-09)

| Red       | Cuenta propia                                                                                                                                                           | Otras cuentas                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Instagram | Automático: métricas de la Fase 5 con la conexión actual (Instagram Login)                                                                                              | Manual. Business Discovery existe, pero solo con Facebook Login, que no usamos                                              |
| YouTube   | Automático: Analytics (Fase 7) y datos públicos                                                                                                                         | Automático: datos públicos con clave de API (`channels.list` con `forHandle`, 1 unidad por llamada, 10.000 unidades al día) |
| TikTok    | Posible automático con Display API (`user.info.stats`, `video.list` con visualizaciones, likes, comentarios y compartidos). **[no confirmado]** en sandbox y escritorio | Manual                                                                                                                      |
| LinkedIn  | Manual: sin métricas en autoservicio (ver `docs/connectors/linkedin.md`)                                                                                                | Manual                                                                                                                      |
| X         | Manual por decisión del propietario                                                                                                                                     | Manual                                                                                                                      |

## Decisión

- La app pasa a ser de **análisis, planificación y producción**. La publicación por API se
  **oculta**, no se borra: el código se mantiene probado por si se recupera.
- Las capturas las lee Claude (visión) y devuelve datos estructurados validados con Zod. El
  usuario los revisa y corrige antes de guardarlos. Nunca se guardan sin su confirmación.
- No hay scraping ni automatización de navegador, como hasta ahora.

## Consecuencias

- Cada análisis con capturas consume tokens de Claude, que cuentan en el límite mensual.
- TikTok se añade como red, sin publicación por API.
- El modo manual (copiar texto, exportar medios, marcar como publicado) pasa a ser el flujo
  principal y debe ser cómodo.
