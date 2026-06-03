import { BackendRESTChecker } from './backend-rest.adapter'
import type { ILastUpdatesChecker } from './types'

export const lastUpdatesChecker: ILastUpdatesChecker = new BackendRESTChecker()
export type { ILastUpdatesChecker }
