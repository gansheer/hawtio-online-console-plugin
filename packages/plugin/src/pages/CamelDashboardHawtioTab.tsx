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
import { useK8sWatchResources } from '@openshift-console/dynamic-plugin-sdk'

interface CamelApp {
  metadata?: {
    name?: string
    namespace?: string
    uid?: string
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
    }>
    phase?: string
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

export const CamelDashboardHawtioTab: React.FunctionComponent<CamelDashboardHawtioTabProps> = props => {
  const [isLoading, setLoading] = useState<boolean>(true)
  const podIdRef = useRef<string|null>(null)
  const [error, setError] = useState<Error | null>()

  // Ensure the correct theme for OpenShift version
  useOpenShiftTheme()

  // Query actual Pod resources using the CamelApp selector
  const resources = useK8sWatchResources<{
    pods: any[]
  }>({
    pods: {
      isList: true,
      groupVersionKind: {
        group: '',
        version: 'v1',
        kind: 'Pod'
      },
      namespaced: true,
      namespace: props.obj?.metadata?.namespace,
      selector: props.obj?.spec?.selector,
    },
  })

  const pod = resources.pods.data && resources.pods.data.length > 0 ? resources.pods.data[0] : null

  useEffect(() => {
    if (!resources.pods.loaded) {
      return
    }

    const newId = podUid(pod) ?? ''
    const podChanged = newId !== podIdRef.current

    if (isLoading) {
      const awaitService = async (p: any | null) => {
        if (!p) {
          setError(new Error('No pods available for this CamelApp'))
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

  }, [isLoading, pod, resources.pods.loaded])

  if (!resources.pods.loaded || isLoading) {
    return <ConsoleLoading />
  }

  if (error) {
    return (
      <PageSection variant={PageSectionVariants.light}>
        <Card>
          <CardBody>
            <Alert variant='danger' title='Error occurred while loading'>
              <textarea
                readOnly
                style={{ width: '100%', height: '100%', resize: 'none', background: 'transparent', border: 'none' }}
              >
                {stack(error)}
              </textarea>
            </Alert>
          </CardBody>
        </Card>
      </PageSection>
    )
  }

  return <Hawtio />
}

export default CamelDashboardHawtioTab
