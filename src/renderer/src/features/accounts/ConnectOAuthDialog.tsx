import * as React from 'react'
import { ExternalLink, KeyRound, Loader2, Shield } from 'lucide-react'
import type { OAuthNetwork } from '@shared/domain/accounts'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import { Segmented } from '@renderer/components/ui/segmented'
import { invoke } from '@renderer/lib/ipc'
import { useConnectLinkedInToken, useConnectOAuth, useOAuthClients } from './useAccounts'

interface NetworkConfig {
  title: string
  intro: string
  consoleUrl: string
  consoleLabel: string
  idLabel: string
  secretRequired: boolean
  secretHint: string
  redirect: string | null
  steps: string[]
  warning: string | null
}

const CONFIG: Record<OAuthNetwork, NetworkConfig> = {
  youtube: {
    title: 'Conectar YouTube',
    intro:
      'Necesitas tu propia app en Google Cloud (gratis). La app abre el navegador, tú autorizas con tu cuenta de Google y los permisos se guardan cifrados en tu equipo.',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    consoleLabel: 'Abrir Google Cloud',
    idLabel: 'ID de cliente',
    secretRequired: false,
    secretHint: 'Google lo da al crear el cliente de escritorio. Se guarda cifrado.',
    redirect: null,
    steps: [
      'En Google Cloud crea un proyecto y activa "YouTube Data API v3" y "YouTube Analytics API".',
      'En la pantalla de consentimiento añade tu cuenta como usuario de prueba. Si la dejas en "Pruebas", el acceso caduca a los 7 días: pásala a "En producción" para evitarlo.',
      'En "Credenciales" crea un "ID de cliente de OAuth" de tipo "Aplicación de escritorio".',
      'Copia el ID de cliente y el secreto aquí.'
    ],
    warning:
      'Google mostrará "app no verificada" porque es tu propia app: pulsa "Avanzado" y continúa. Si YouTube deja tus vídeos en privado, hará falta la auditoría de Google.'
  },
  linkedin: {
    title: 'Conectar LinkedIn',
    intro:
      'Publicas como tu perfil personal. Necesitas una app en el portal de desarrolladores de LinkedIn (gratis).',
    consoleUrl: 'https://www.linkedin.com/developers/apps',
    consoleLabel: 'Abrir portal de LinkedIn',
    idLabel: 'Client ID',
    secretRequired: true,
    secretHint: 'Primary Client Secret de la pestaña Auth. Se guarda cifrado.',
    redirect: 'http://localhost:47822/callback',
    steps: [
      'Crea una app (LinkedIn la asocia a una página de empresa).',
      'En "Products" añade "Share on LinkedIn" y "Sign In with LinkedIn using OpenID Connect".',
      'En "Auth" añade como Redirect URL: http://localhost:47822/callback',
      'Copia el Client ID y el Client Secret aquí.'
    ],
    warning:
      'LinkedIn no documenta que acepte http://localhost como redirección. Si falla, usa la opción "Token del portal".'
  },
  x: {
    title: 'Conectar X',
    intro:
      'Necesitas una app en la consola de desarrolladores de X. X cobra por uso: publicar cuesta 0,015 $ y 0,20 $ si el post lleva un enlace.',
    consoleUrl: 'https://developer.x.com/en/portal/dashboard',
    consoleLabel: 'Abrir consola de X',
    idLabel: 'Client ID',
    secretRequired: false,
    secretHint: 'Solo si tu app es "confidencial". Las apps nativas no tienen secreto.',
    redirect: 'http://127.0.0.1:47823/callback',
    steps: [
      'Crea una app y activa OAuth 2.0 con permisos de lectura y escritura.',
      'Añade como URL de retorno: http://127.0.0.1:47823/callback',
      'Añade saldo en la sección de facturación (sin saldo, X rechaza las publicaciones).',
      'Copia el Client ID (y el Client Secret, si tu app lo tiene) aquí.'
    ],
    warning: null
  }
}

function Steps({ steps }: { steps: string[] }): React.JSX.Element {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
      {steps.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  )
}

type Method = 'oauth' | 'token'

function Body({
  network,
  onClose
}: {
  network: OAuthNetwork
  onClose: () => void
}): React.JSX.Element {
  const config = CONFIG[network]
  const clients = useOAuthClients()
  const saved = clients.data?.[network]
  const [method, setMethod] = React.useState<Method>('oauth')
  const [clientId, setClientId] = React.useState<string | null>(null)
  const [clientSecret, setClientSecret] = React.useState('')
  const [token, setToken] = React.useState('')
  const connectOAuth = useConnectOAuth()
  const connectToken = useConnectLinkedInToken()
  const pending = connectOAuth.isPending || connectToken.isPending
  const error = connectOAuth.error ?? connectToken.error
  const idValue = clientId ?? saved?.clientId ?? ''
  const secretOk = !config.secretRequired || clientSecret.trim() !== '' || saved?.hasSecret === true
  const canSubmit =
    method === 'token' ? token.trim().length >= 20 : idValue.trim() !== '' && secretOk

  const submit = (): void => {
    if (method === 'token') {
      connectToken.mutate({ accessToken: token.trim() }, { onSuccess: onClose })
    } else {
      connectOAuth.mutate(
        { network, clientId: idValue.trim(), clientSecret: clientSecret.trim() },
        { onSuccess: onClose }
      )
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{config.title}</DialogTitle>
        <DialogDescription>{config.intro}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        {network === 'linkedin' && (
          <Segmented
            aria-label="Método de conexión"
            value={method}
            onChange={setMethod}
            options={[
              { value: 'oauth', label: 'Iniciar sesión (OAuth)', icon: Shield },
              { value: 'token', label: 'Token del portal', icon: KeyRound }
            ]}
          />
        )}

        {method === 'token' ? (
          <>
            <Steps
              steps={[
                'Abre el generador de tokens del portal de LinkedIn y elige tu app.',
                'Marca los permisos openid, profile y w_member_social, y genera el token.',
                'Cópialo aquí. Dura 60 días y habrá que repetirlo al caducar.'
              ]}
            />
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                void invoke('app:openExternal', {
                  url: 'https://www.linkedin.com/developers/tools/oauth/token-generator'
                })
              }
            >
              <ExternalLink aria-hidden /> Abrir el generador de tokens
            </Button>
            <Field label="Token de acceso" htmlFor="oauth-token">
              <Textarea
                id="oauth-token"
                rows={3}
                className="font-mono text-xs"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                spellCheck={false}
              />
            </Field>
          </>
        ) : (
          <>
            {config.warning && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                {config.warning}
              </p>
            )}
            <Steps steps={config.steps} />
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => void invoke('app:openExternal', { url: config.consoleUrl })}
            >
              <ExternalLink aria-hidden /> {config.consoleLabel}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Field label={config.idLabel} htmlFor="oauth-client-id">
                <Input
                  id="oauth-client-id"
                  value={idValue}
                  onChange={(e) => setClientId(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </Field>
              <Field
                label={config.secretRequired ? 'Client Secret' : 'Client Secret (si lo hay)'}
                htmlFor="oauth-client-secret"
                hint={
                  saved?.hasSecret
                    ? 'Ya hay uno guardado; déjalo en blanco para usarlo.'
                    : config.secretHint
                }
              >
                <Input
                  id="oauth-client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </Field>
            </div>
            <p className="text-xs text-muted">
              Se abrirá tu navegador para autorizar. Vuelve a la app cuando termine.
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error.message}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={!canSubmit || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? (method === 'oauth' ? 'Esperando al navegador…' : 'Comprobando…') : 'Conectar'}
        </Button>
      </DialogFooter>
    </>
  )
}

export function ConnectOAuthDialog({
  network,
  onOpenChange
}: {
  /** null = cerrado. */
  network: OAuthNetwork | null
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Dialog open={network !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {network && <Body key={network} network={network} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
