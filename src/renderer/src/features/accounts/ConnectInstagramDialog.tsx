import * as React from 'react'
import { ExternalLink, KeyRound, Loader2, Shield } from 'lucide-react'
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
import { useSettings } from '@renderer/features/settings/useSettings'
import { useConnectInstagramOAuth, useConnectInstagramToken } from './useAccounts'

type Method = 'token' | 'oauth'

const DEVELOPERS_URL = 'https://developers.facebook.com/apps/'

function Steps({ steps }: { steps: string[] }): React.JSX.Element {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
      {steps.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  )
}

function ConnectBody({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [method, setMethod] = React.useState<Method>('token')
  const [token, setToken] = React.useState('')
  const settings = useSettings()
  const [appId, setAppId] = React.useState(settings.data?.publishing.instagramAppId ?? '')
  const [appSecret, setAppSecret] = React.useState('')
  const connectToken = useConnectInstagramToken()
  const connectOAuth = useConnectInstagramOAuth()
  const pending = connectToken.isPending || connectOAuth.isPending
  const error = connectToken.error ?? connectOAuth.error

  const submit = (): void => {
    if (method === 'token') {
      connectToken.mutate({ accessToken: token.trim() }, { onSuccess: onClose })
    } else {
      connectOAuth.mutate(
        { appId: appId.trim(), appSecret: appSecret.trim() },
        { onSuccess: onClose }
      )
    }
  }

  const canSubmit =
    method === 'token' ? token.trim().length >= 20 : appId.trim() && appSecret.trim()

  return (
    <>
      <DialogHeader>
        <DialogTitle>Conectar Instagram</DialogTitle>
        <DialogDescription>
          Hace falta una cuenta <strong>profesional</strong> (Business o Creator) y una app en Meta
          for Developers. Los tokens se guardan cifrados en tu equipo.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <Segmented
          aria-label="Método de conexión"
          value={method}
          onChange={setMethod}
          options={[
            { value: 'token', label: 'Token del panel de Meta', icon: KeyRound },
            { value: 'oauth', label: 'Iniciar sesión (OAuth)', icon: Shield }
          ]}
        />

        {method === 'token' ? (
          <>
            <Steps
              steps={[
                'Entra en developers.facebook.com, crea una app (caso de uso "Other", tipo "Business").',
                'Añade el producto Instagram → "API setup with Instagram business login".',
                'Añade tu cuenta de Instagram como cuenta de prueba y acepta la invitación desde la app de Instagram.',
                'Pulsa "Generate token" junto a tu cuenta, inicia sesión y copia el token (dura 60 días; la app lo renueva sola).'
              ]}
            />
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => void invoke('app:openExternal', { url: DEVELOPERS_URL })}
            >
              <ExternalLink aria-hidden /> Abrir Meta for Developers
            </Button>
            <Field label="Token de acceso" htmlFor="ig-token">
              <Textarea
                id="ig-token"
                rows={3}
                className="font-mono text-xs"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="IGAAR…"
                spellCheck={false}
              />
            </Field>
          </>
        ) : (
          <>
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              Experimental: Meta no documenta si acepta <code>http://localhost</code> como
              redirección. Si falla, usa el token del panel.
            </p>
            <Steps
              steps={[
                'En tu app de Meta, abre Instagram → "API setup with Instagram business login" → "Business login settings".',
                'Añade http://localhost:47821/callback en "OAuth redirect URIs" y guarda.',
                'Copia el Instagram App ID y el App Secret de esa misma pantalla.'
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Instagram App ID" htmlFor="ig-app-id">
                <Input
                  id="ig-app-id"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="App Secret" htmlFor="ig-app-secret" hint="Se guarda cifrado.">
                <Input
                  id="ig-app-secret"
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
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

export function ConnectInstagramDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <ConnectBody onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
