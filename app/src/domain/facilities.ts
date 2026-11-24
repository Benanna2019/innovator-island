export type FacilityKind = 'restroom' | 'atm' | 'dining'

export interface Facility {
  id: string
  kind: FacilityKind
  /** Proper names (shops) are not translated. Restrooms and ATMs use the kind label. */
  name: string | null
  x: number
  y: number
}

/** Fixed park amenities. Positions are percentages of the map, converted from the original Leaflet coordinates. */
export const FACILITIES: readonly Facility[] = [
  { id: 'facility-001', kind: 'restroom', name: null, x: 90.5, y: 31.3 },
  { id: 'facility-002', kind: 'restroom', name: null, x: 29.6, y: 70.3 },
  { id: 'facility-003', kind: 'restroom', name: null, x: 57.1, y: 84.3 },
  { id: 'facility-004', kind: 'atm', name: null, x: 71.2, y: 65.7 },
  { id: 'facility-005', kind: 'atm', name: null, x: 33.9, y: 58.6 },
  { id: 'facility-006', kind: 'atm', name: null, x: 55.7, y: 24.7 },
  { id: 'facility-007', kind: 'dining', name: 'Island Tacos', x: 76.2, y: 22 },
  { id: 'facility-008', kind: 'dining', name: "Sam's Nut Shack", x: 71.5, y: 47.7 },
  { id: 'facility-009', kind: 'dining', name: 'Island Burgers', x: 42.3, y: 58.7 },
  { id: 'facility-010', kind: 'dining', name: 'Serverless Souvenirs', x: 58.1, y: 32.2 },
]
