import React, { useEffect, useRef, useState } from 'react'
import { Alert, Card, CardBody, PageSection, PageSectionVariants } from '@patternfly/react-core'
import '@patternfly/patternfly/patternfly.css'
import { useOpenShiftTheme } from '../hooks'
import { hawtioService } from '../hawtio-service'
import { Hawtio } from '@hawtio/react/ui'
import '@hawtio/react/dist/index.css'
import './openshift-console-plugin.css'
import './hawtiomaintab.css'
import { stack } from '../utils'
import { log } from '../globals'
import { ConsoleLoading } from './ConsoleLoading'
import { useK8sWatchResources, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk'
import { connectionService } from '../connection-service'

interface CamelApp {
  metadata?: {
    name?: string
    namespace?: string
    ownerReferences?: Array<{
      apiVersion: string
      kind: string
      name: string
      uid: string
      controller?: boolean
    }>
  }
  spec?: {
    selector?: {
      matchLabels?: Record<string, string>
    }
  }
  status?: {
    pods?: Array<{
      name: string
      ready: boolean
      status: string
      jolokiaEnabled?: boolean
    }>
  }
}

interface CamelDashboardHawtioTabProps {
  obj?: CamelApp
  customData?: any
}

function podUid(pod: any | null): string | null {
  if (!pod) return null
  return pod.metadata?.uid ?? null
}

function ownerGvk(kind: string) {
  switch (kind) {
    case 'Deployment':
      return { group: 'apps', version: 'v1', kind: 'Deployment' }
    case 'StatefulSet':
      return { group: 'apps', version: 'v1', kind: 'StatefulSet' }
    case 'DaemonSet':
      return { group: 'apps', version: 'v1', kind: 'DaemonSet' }
    case 'ReplicaSet':
      return { group: 'apps', version: 'v1', kind: 'ReplicaSet' }
    case 'CronJob':
      return { group: 'batch', version: 'v1', kind: 'CronJob' }
    default:
      return { group: 'apps', version: 'v1', kind }
  }
}

export const CamelDashboardHawtioTab: React.FunctionComponent<CamelDashboardHawtioTabProps> = props => {
  log.debug('CamelDashboardHawtioTab props:', JSON.stringify(props, null, 2))

  const [isLoading, setLoading] = useState<boolean>(true)
  const podIdRef = useRef<string|null>(null)
  const [error, setError] = useState<Error | null>()

  // Ensure the correct theme for OpenShift version
  useOpenShiftTheme()

  // Get the owner resource (Deployment, StatefulSet, etc.)
  const ownerRef = props.obj?.metadata?.ownerReferences?.[0]
  const [owner, ownerLoaded] = useK8sWatchResource<any>(
    ownerRef
      ? {
          name: ownerRef.name,
          namespace: props.obj?.metadata?.namespace,
          groupVersionKind: ownerGvk(ownerRef.kind),
          isList: false,
        }
      : null
  )

  // Query pods using the owner's selector
  const resources = useK8sWatchResources<{
    pods: any[]
  }>({
    pods: ownerLoaded && owner && owner.spec?.selector
      ? {
          isList: true,
          groupVersionKind: {
            group: '',
            version: 'v1',
            kind: 'Pod'
          },
          namespaced: true,
          namespace: props.obj?.metadata?.namespace,
          selector: owner.spec.selector,
        }
      : {
          isList: true,
          groupVersionKind: {
            group: '',
            version: 'v1',
            kind: 'Pod'
          },
          namespaced: false,
          namespace: '',
        }
  })

  // Filter pods to only those with Jolokia port
  const jolokiaPods = resources.pods.data?.filter(p => connectionService.hasJolokiaPort(p)) || []
  const pod = jolokiaPods.length > 0 ? jolokiaPods[0] : null

  useEffect(() => {
    if (!ownerLoaded || !resources.pods.loaded) {
      return
    }

    const newId = podUid(pod) ?? ''
    const podChanged = newId !== podIdRef.current

    if (isLoading) {
      const awaitService = async (p: any | null) => {
        if (!p) {
          const totalPods = resources.pods.data?.length || 0
          const msg = totalPods > 0
            ? `No pods with Jolokia port found. This CamelApp has ${totalPods} pod(s) but none expose Jolokia on port 8778.\n\nTo enable Hawtio integration, ensure your Camel application exposes a Jolokia endpoint.`
            : 'No pods available for this CamelApp.'
          setError(new Error(msg))
          setLoading(false)
          return
        }

        log.debug(`Initialising Hawtio for CamelApp pod ${p?.metadata?.name} ...`)
        await hawtioService.reset(p)

        if (!hawtioService.isResolved() || hawtioService.getError()) {
          setError(new Error('Failure to initialize the HawtioService', { cause: hawtioService.getError() }))
          setLoading(false)
          return
        }

        log.debug(`Hawtio initialize complete for ${p?.metadata?.name} ...`)
        setError(null)
        setLoading(false)
      }
      awaitService(pod)

    } else if (podChanged) {
      // Ensure that we change state to refresh the page on a new pod
      setLoading(true)
      podIdRef.current = newId
    }

  }, [isLoading, pod, ownerLoaded, resources.pods.loaded])

  if (!ownerLoaded || !resources.pods.loaded || isLoading) {
    return <ConsoleLoading />
  }

  if (error) {
    const debugInfo = {
      ownerRef: ownerRef?.kind + '/' + ownerRef?.name,
      ownerLoaded,
      ownerSelector: owner?.spec?.selector,
      totalPods: resources.pods.data?.length || 0,
      jolokiaPods: jolokiaPods.length,
      selectedPod: pod?.metadata?.name,
      podAnnotations: pod?.metadata?.annotations,
      errorCause: hawtioService.getError()?.message || 'N/A'
    }

    return (
      <PageSection variant={PageSectionVariants.light}>
        <Card>
          <CardBody>
            <Alert variant='warning' title='Hawtio not available'>
              <p style={{ whiteSpace: 'pre-wrap' }}>{error.message}</p>
              <details style={{ marginTop: '1rem' }}>
                <summary>Debug Information</summary>
                <pre style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </details>
            </Alert>
          </CardBody>
        </Card>
      </PageSection>
    )
  }

  return (
    <div style={{ minHeight: '800px', height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
      <Hawtio />
    </div>
  )
}

export default CamelDashboardHawtioTab
