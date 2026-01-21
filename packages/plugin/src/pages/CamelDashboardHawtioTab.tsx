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

interface CamelAppPod {
  name: string
  ready: string
  phase: string
  restarts: string
  uid?: string
  namespace?: string
}

interface CamelApp {
  metadata?: {
    name?: string
    namespace?: string
    uid?: string
  }
  status?: {
    pods?: CamelAppPod[]
    phase?: string
  }
}

interface CamelDashboardHawtioTabProps {
  obj?: CamelApp
  customData?: any
}

/**
 * Convert CamelApp to a Pod-like object for hawtioService
 * Uses the first available pod from the CamelApp status
 */
function camelAppToPod(camelApp: CamelApp | undefined): any | null {
  if (!camelApp?.status?.pods || camelApp.status.pods.length === 0) {
    return null
  }

  // Get the first pod
  const pod = camelApp.status.pods[0]

  return {
    metadata: {
      name: pod.name,
      namespace: pod.namespace || camelApp.metadata?.namespace,
      uid: pod.uid,
    },
    status: {
      phase: pod.phase,
    }
  }
}

function podUid(pod: any | null): string | null {
  if (!pod) return null
  return pod.metadata?.uid ?? null
}

export const CamelDashboardHawtioTab: React.FunctionComponent<CamelDashboardHawtioTabProps> = props => {
  const pod = camelAppToPod(props.obj)
  const [isLoading, setLoading] = useState<boolean>(true)
  const podIdRef = useRef<string|null>(podUid(pod))
  const [error, setError] = useState<Error | null>()

  // Ensure the correct theme for OpenShift version
  useOpenShiftTheme()

  useEffect(() => {
    const newId = podUid(pod) ?? ''
    const podChanged = newId !== podIdRef.current

    if (isLoading) {
      const awaitService = async (p: any | null) => {
        if (!p) {
          setError(new Error('No pods available in CamelApp'))
          setLoading(false)
          return
        }

        log.debug(`Initialising Hawtio for CamelApp pod ${p?.metadata?.name} ...`)
        await hawtioService.reset(p)

        if (!hawtioService.isResolved() || hawtioService.getError()) {
          setError(new Error('Failure to initialize the HawtioService', { cause: hawtioService.getError() }))
          setLoading(false) // error occurred so loading is done
          return
        }

        log.debug(`Hawtio initialize complete for ${p?.metadata?.name} ...`)
        setError(null)
        setLoading(false)
      }
      awaitService(pod)

    } else if (podChanged) {
      /*
       * Ensure that we change state to refresh
       * the page on a new pod
       */
      setLoading(true)
      podIdRef.current = newId
    }

  }, [isLoading, pod])

  if (isLoading) {
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
