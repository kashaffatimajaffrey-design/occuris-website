// The eight Occuralog rows shown on screen 3 (PRD section 15), exactly as
// written. `message` is Roman Urdu and renders with lang="ur".
// Owner: Kashaf. Only rows cleared for public use go here.

export interface SampleRow {
  message: string;
  item: string;
  qty: string;
  from: string;
  vehicle: string;
  eta: string;
  delay: string;
  confidence: string;
}

export const sampleRows: SampleRow[] = [
  { message: 'truck late hai, 200 carton kal pohnchenge', item: 'Cartons', qty: '200', from: 'Ahmed, dispatch', vehicle: 'Truck KHI-4471', eta: 'Tomorrow', delay: '1 day', confidence: '0.94' },
  { message: 'port se clearance abhi tak nahi mili, 3 container ruke hue hain', item: 'Containers', qty: '3', from: 'Port agent', vehicle: 'Container', eta: 'Unknown', delay: 'Blocked', confidence: '0.91' },
  { message: '50 bag cement aaj load ho gaye, raat tak Sukkur', item: 'Cement, bags', qty: '50', from: 'Warehouse A', vehicle: 'Truck', eta: 'Tonight', delay: '0', confidence: '0.97' },
  { message: 'supplier bol raha hai copper wire ka rate 12% barh gaya', item: 'Copper wire', qty: 'n/a', from: 'Supplier, Lahore', vehicle: 'n/a', eta: 'n/a', delay: 'Price +12%', confidence: '0.88' },
  { message: '2 pallet damage hain, photo bhej raha hoon', item: 'Pallets', qty: '2', from: 'Receiving', vehicle: 'n/a', eta: 'n/a', delay: 'Damage', confidence: '0.90' },
  { message: 'generator ka spare part Dubai se aa raha hai, 10 din lagenge', item: 'Generator spare', qty: '1', from: 'Supplier, Dubai', vehicle: 'Air freight', eta: '10 days', delay: '0', confidence: '0.93' },
  { message: 'stock khatam hone wala hai, 30 carton bacha hai sirf', item: 'Cartons', qty: '30', from: 'Store', vehicle: 'n/a', eta: 'n/a', delay: 'Stock-out risk', confidence: '0.95' },
  { message: 'driver ne bola Hyderabad bypass band hai, 4 ghante extra', item: 'Any', qty: 'n/a', from: 'Driver', vehicle: 'Truck', eta: '+4 hours', delay: '4 hours', confidence: '0.89' },
];
